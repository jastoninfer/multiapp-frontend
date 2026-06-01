import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { appConfig, AppConfig } from "./config";

export const TOKEN_KEY = "multiapp.accessToken";
export const ID_TOKEN_KEY = "multiapp.idToken";
export const REFRESH_TOKEN_KEY = "multiapp.refreshToken";
export const TENANT_KEY = "multiapp.currentTenantId";
export const LOGOUT_IN_PROGRESS_KEY = "multiapp.logoutInProgress";
export const SESSION_EXPIRED_EVENT = "multiapp:session-expired";
export const BACKEND_UNAUTHORIZED_EVENT = "multiapp:backend-unauthorized";
export const AUTH_SESSION_UPDATED_EVENT = "multiapp:auth-session-updated";
export const SESSION_EXPIRED_RETURN_TO_KEY = "multiapp.sessionExpired.returnTo";

export type AuthIssue = "" | "session-expired" | "backend-unauthorized";

interface BackendUnauthorizedDetail {
  returnTo?: string;
}

export interface AuthSession {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
}

export interface AuthContextValue {
  config: AppConfig;
  token: string;
  idToken: string;
  refreshToken: string;
  tenantId: string;
  setSession: (session: AuthSession) => void;
  setToken: (token: string) => void;
  updateTenantId: (tenantId: string) => void;
  clearSessionStorage: () => void;
  clearSession: () => void;
  // authIssue is a global auth-flow signal, not a replacement for per-request
  // API errors. "session-expired" blocks protected routes until the user signs
  // in again; "backend-unauthorized" records that a 401 happened even though
  // the token was not clearly expired.
  clearAuthIssue: () => void;
  authIssue: AuthIssue;
  isAuthenticated: boolean;
  isTenantSelected: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStorage(key: string) {
  return localStorage.getItem(key) || "";
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [token, setTokenState] = useState(() => loadStorage(TOKEN_KEY));
  const [idToken, setIdTokenState] = useState(() => loadStorage(ID_TOKEN_KEY));
  const [refreshToken, setRefreshTokenState] = useState(() => loadStorage(REFRESH_TOKEN_KEY));
  const [tenantId, setTenantIdState] = useState(() => loadStorage(TENANT_KEY));
  const [authIssue, setAuthIssue] = useState<AuthIssue>("");

  const value = useMemo<AuthContextValue>(() => {
    const setIdToken = (nextIdToken: string) => {
      const normalized = nextIdToken.trim();
      setIdTokenState(normalized);
      if (normalized) localStorage.setItem(ID_TOKEN_KEY, normalized);
      else localStorage.removeItem(ID_TOKEN_KEY);
    };

    const setToken = (nextToken: string) => {
      const normalized = nextToken.trim();
      setTokenState(normalized);
      if (normalized) localStorage.setItem(TOKEN_KEY, normalized);
      else localStorage.removeItem(TOKEN_KEY);
    };

    const setRefreshToken = (nextRefreshToken: string) => {
      const normalized = nextRefreshToken.trim();
      setRefreshTokenState(normalized);
      if (normalized) localStorage.setItem(REFRESH_TOKEN_KEY, normalized);
      else localStorage.removeItem(REFRESH_TOKEN_KEY);
    };

    const updateTenantId = (nextTenantId: string) => {
      const normalized = nextTenantId.trim();
      setTenantIdState(normalized);
      if (normalized) localStorage.setItem(TENANT_KEY, normalized);
      else localStorage.removeItem(TENANT_KEY);
    };

    return {
      config: appConfig,
      token,
      idToken,
      refreshToken,
      tenantId,
      // access_token is used for backend APIs; id_token is kept only for
      // Keycloak RP-initiated logout as id_token_hint.
      setSession: (session) => {
        setAuthIssue("");
        setToken(session.accessToken);
        setIdToken(session.idToken ?? "");
        setRefreshToken(session.refreshToken ?? "");
      },
      setToken,
      updateTenantId,
      clearSessionStorage: () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(ID_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(TENANT_KEY);
      },
      clearSession: () => {
        setTokenState("");
        setIdTokenState("");
        setRefreshTokenState("");
        setTenantIdState("");
        setAuthIssue("");
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(ID_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(TENANT_KEY);
      },
      clearAuthIssue: () => setAuthIssue(""),
      authIssue,
      isAuthenticated: Boolean(token),
      isTenantSelected: Boolean(tenantId)
    };
  }, [authIssue, idToken, refreshToken, tenantId, token]);

  useEffect(() => {
    function rememberReturnTo(returnTo?: string) {
      if (returnTo) sessionStorage.setItem(SESSION_EXPIRED_RETURN_TO_KEY, returnTo);
    }

    function onSessionExpired(event: Event) {
      const detail = (event as CustomEvent<{ returnTo?: string }>).detail;
      rememberReturnTo(detail?.returnTo);
      setAuthIssue("session-expired");
      setTokenState("");
      setIdTokenState("");
      setRefreshTokenState("");
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ID_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }

    function onBackendUnauthorized(event: Event) {
      const detail = (event as CustomEvent<BackendUnauthorizedDetail>).detail;
      rememberReturnTo(detail?.returnTo);
      setAuthIssue("backend-unauthorized");
    }

    function onSessionUpdated(event: Event) {
      const detail = (event as CustomEvent<AuthSession>).detail;
      setAuthIssue("");
      setTokenState(detail.accessToken ?? "");
      setIdTokenState(detail.idToken ?? "");
      setRefreshTokenState(detail.refreshToken ?? "");
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    window.addEventListener(BACKEND_UNAUTHORIZED_EVENT, onBackendUnauthorized);
    window.addEventListener(AUTH_SESSION_UPDATED_EVENT, onSessionUpdated);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
      window.removeEventListener(BACKEND_UNAUTHORIZED_EVENT, onBackendUnauthorized);
      window.removeEventListener(AUTH_SESSION_UPDATED_EVENT, onSessionUpdated);
    };
  }, []);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
