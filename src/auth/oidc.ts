import { AppConfig, appConfig, hasOidcConfig } from "./config";
import { AUTH_SESSION_UPDATED_EVENT, ID_TOKEN_KEY, REFRESH_TOKEN_KEY, TOKEN_KEY, type AuthSession } from "./AuthContext";

const OIDC_STATE_KEY = "multiapp.oidc.state";
const OIDC_VERIFIER_KEY = "multiapp.oidc.verifier";
const OIDC_RETURN_TO_KEY = "multiapp.oidc.returnTo";
const OIDC_CALLBACK_PREFIX = "multiapp.oidc.callback.";
const OIDC_LAST_CALLBACK_AT_KEY = "multiapp.oidc.lastCallbackAt";

// The callback code is one-time-use. This error keeps Keycloak's raw OIDC
// error fields so the callback page can distinguish recoverable invalid_grant
// from fatal configuration/state problems.
export class OidcTokenExchangeError extends Error {
  error?: string;
  description?: string;

  constructor(message: string, error?: string, description?: string) {
    super(message);
    this.name = "OidcTokenExchangeError";
    this.error = error;
    this.description = description;
  }
}

interface LoginOptions {
  prompt?: "login";
  loginHint?: string;
}

function base64Url(bytes: ArrayBuffer | Uint8Array) {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const binary = String.fromCharCode(...array);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(value: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

function randomString() {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function realmBase(config: AppConfig = appConfig) {
  return `${config.keycloakUrl.replace(/\/+$/, "")}/realms/${encodeURIComponent(config.keycloakRealm)}`;
}

function normalizeReturnTo(returnTo: string) {
  if (!returnTo || returnTo === "/" || returnTo.startsWith("/signed-out") || returnTo.startsWith("/auth/callback")) {
    return "/dashboard";
  }
  return returnTo;
}

// Starts Authorization Code + PKCE. We store only transient verifier/state in
// sessionStorage because they belong to this browser tab's login transaction.
export async function startKeycloakLogin(
  config: AppConfig = appConfig,
  returnTo = window.location.pathname + window.location.search,
  options: LoginOptions = {}
) {
  if (!hasOidcConfig(config)) throw new Error("Missing Keycloak environment configuration.");

  const verifier = randomString();
  const state = randomString();
  const challenge = base64Url(await sha256(verifier));
  sessionStorage.setItem(OIDC_STATE_KEY, state);
  sessionStorage.setItem(OIDC_VERIFIER_KEY, verifier);
  sessionStorage.setItem(OIDC_RETURN_TO_KEY, normalizeReturnTo(returnTo));

  const params = new URLSearchParams({
    client_id: config.keycloakClientId,
    redirect_uri: `${window.location.origin}/auth/callback`,
    response_type: "code",
    scope: "openid profile email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  });
  if (options.prompt) params.set("prompt", options.prompt);
  if (options.loginHint?.trim()) params.set("login_hint", options.loginHint.trim());

  window.location.assign(`${realmBase(config)}/protocol/openid-connect/auth?${params}`);
}

function callbackKey(code: string, state: string) {
  return `${OIDC_CALLBACK_PREFIX}${state}.${code}`;
}

export function reserveCallbackExchange(code: string, state: string) {
  const key = callbackKey(code, state);
  const current = sessionStorage.getItem(key);
  if (current === "processing" || current === "consumed") return false;
  sessionStorage.setItem(key, "processing");
  return true;
}

export function markCallbackExchangeConsumed(code: string, state: string) {
  sessionStorage.setItem(callbackKey(code, state), "consumed");
}

export function clearCallbackExchange(code: string, state: string) {
  sessionStorage.removeItem(callbackKey(code, state));
}

export function clearOidcTransientState() {
  sessionStorage.removeItem(OIDC_STATE_KEY);
  sessionStorage.removeItem(OIDC_VERIFIER_KEY);
  Object.keys(sessionStorage)
    .filter((key) => key.startsWith(OIDC_CALLBACK_PREFIX))
    .forEach((key) => sessionStorage.removeItem(key));
}

export function markLoginCallbackCompleted() {
  sessionStorage.setItem(OIDC_LAST_CALLBACK_AT_KEY, String(Date.now()));
}

export function wasLoginCallbackRecent(windowMs = 15000) {
  const raw = sessionStorage.getItem(OIDC_LAST_CALLBACK_AT_KEY);
  const at = raw ? Number(raw) : 0;
  return Number.isFinite(at) && Date.now() - at >= 0 && Date.now() - at < windowMs;
}

// Exchanges the one-time authorization code for tokens. Callers must guard this
// function with reserveCallbackExchange; calling it twice with the same code
// will make Keycloak return invalid_grant / Code not valid.
export async function exchangeCodeForToken(code: string, state: string, config: AppConfig = appConfig): Promise<AuthSession> {
  const expectedState = sessionStorage.getItem(OIDC_STATE_KEY);
  const verifier = sessionStorage.getItem(OIDC_VERIFIER_KEY);
  if (!expectedState || expectedState !== state || !verifier) {
    throw new OidcTokenExchangeError("OIDC state validation failed. Please sign in again.", "invalid_state");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.keycloakClientId,
    redirect_uri: `${window.location.origin}/auth/callback`,
    code,
    code_verifier: verifier
  });

  const response = await fetch(`${realmBase(config)}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    let payload: { error?: string; error_description?: string } = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    throw new OidcTokenExchangeError(
      payload.error_description || "Keycloak token exchange failed.",
      payload.error,
      payload.error_description
    );
  }
  const payload = (await response.json()) as { access_token?: string; id_token?: string; refresh_token?: string };
  if (!payload.access_token) {
    throw new OidcTokenExchangeError("Keycloak did not return an access token.", "missing_access_token");
  }

  return {
    accessToken: payload.access_token,
    idToken: payload.id_token,
    refreshToken: payload.refresh_token
  };
}

export async function refreshKeycloakSession(refreshToken: string, config: AppConfig = appConfig): Promise<AuthSession> {
  if (!hasOidcConfig(config)) throw new Error("Missing Keycloak environment configuration.");
  const currentRefreshToken = refreshToken.trim();
  if (!currentRefreshToken) throw new OidcTokenExchangeError("No refresh token is available.", "missing_refresh_token");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.keycloakClientId,
    refresh_token: currentRefreshToken
  });

  const response = await fetch(`${realmBase(config)}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    let payload: { error?: string; error_description?: string } = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    throw new OidcTokenExchangeError(
      payload.error_description || "Keycloak token refresh failed.",
      payload.error,
      payload.error_description
    );
  }

  const payload = (await response.json()) as { access_token?: string; id_token?: string; refresh_token?: string };
  if (!payload.access_token) {
    throw new OidcTokenExchangeError("Keycloak did not return an access token.", "missing_access_token");
  }

  const session = {
    accessToken: payload.access_token,
    idToken: payload.id_token ?? localStorage.getItem(ID_TOKEN_KEY) ?? "",
    refreshToken: payload.refresh_token ?? currentRefreshToken
  };
  persistAuthSession(session);
  return session;
}

export function persistAuthSession(session: AuthSession) {
  localStorage.setItem(TOKEN_KEY, session.accessToken);
  if (session.idToken) localStorage.setItem(ID_TOKEN_KEY, session.idToken);
  else localStorage.removeItem(ID_TOKEN_KEY);
  if (session.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
  else localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_UPDATED_EVENT, { detail: session }));
}

export function consumeReturnTo() {
  const returnTo = sessionStorage.getItem(OIDC_RETURN_TO_KEY) || "/dashboard";
  sessionStorage.removeItem(OIDC_RETURN_TO_KEY);
  return normalizeReturnTo(returnTo);
}

export function peekReturnTo() {
  const returnTo = sessionStorage.getItem(OIDC_RETURN_TO_KEY) || "/dashboard";
  return normalizeReturnTo(returnTo);
}

export function keycloakLogoutUrl(config: AppConfig = appConfig, idToken?: string) {
  const params = new URLSearchParams({
    client_id: config.keycloakClientId,
    post_logout_redirect_uri: `${window.location.origin}/signed-out`
  });
  if (idToken) params.set("id_token_hint", idToken);
  return `${realmBase(config)}/protocol/openid-connect/logout?${params}`;
}
