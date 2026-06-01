import { appConfig } from "../auth/config";
import { BACKEND_UNAUTHORIZED_EVENT, REFRESH_TOKEN_KEY, SESSION_EXPIRED_EVENT, TENANT_KEY, TOKEN_KEY } from "../auth/AuthContext";
import { refreshKeycloakSession, wasLoginCallbackRecent } from "../auth/oidc";
import { ApiErrorBody } from "../types";

export class ApiError extends Error {
  status: number;
  body?: ApiErrorBody;

  constructor(status: number, message: string, body?: ApiErrorBody) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface ApiResult<T> {
  data: T;
  etag?: string;
  response: Response;
}

interface RequestOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: unknown;
  headers?: HeadersInit;
  etag?: string;
  tenantId?: string;
  token?: string;
  tenantScoped?: boolean;
  rawBody?: BodyInit;
  parseAs?: "json" | "blob" | "text" | "empty";
}

const MAX_BACKEND_CONCURRENCY = 6;
const MIN_SAME_REQUEST_INTERVAL_MS = 750;

let activeBackendRequests = 0;
const lastStartedAtByRequestKey = new Map<string, number>();
const inFlightGetRequests = new Map<string, Promise<ApiResult<unknown>>>();
let refreshSessionPromise: Promise<string> | null = null;

export function requestId() {
  return crypto.randomUUID();
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function isFormDataBody(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function methodFor(options: RequestOptions) {
  return (options.method ?? "GET").toUpperCase();
}

function bodyKey(body: BodyInit | undefined, originalBody: unknown) {
  if (body === undefined) return "";
  if (isFormDataBody(originalBody)) return "[form-data]";
  if (typeof body === "string") return body;
  return "[body]";
}

function backendRequestKey(path: string, options: RequestOptions, body: BodyInit | undefined) {
  const tenantId = options.tenantId ?? localStorage.getItem(TENANT_KEY) ?? "";
  const tenantScoped = options.tenantScoped ?? true;
  return JSON.stringify({
    method: methodFor(options),
    path,
    tenantId: tenantScoped ? tenantId : "",
    tenantScoped,
    etag: options.etag ?? "",
    parseAs: options.parseAs ?? "json",
    body: bodyKey(body, options.body)
  });
}

async function scheduleBackendRequest<T>(requestKey: string, task: () => Promise<T>): Promise<T> {
  await new Promise<void>((resolve) => {
    const tryStart = () => {
      const now = Date.now();
      const lastStartedAt = lastStartedAtByRequestKey.get(requestKey) ?? 0;
      const sameRequestWaitMs = Math.max(0, MIN_SAME_REQUEST_INTERVAL_MS - (now - lastStartedAt));

      if (activeBackendRequests < MAX_BACKEND_CONCURRENCY && sameRequestWaitMs === 0) {
        activeBackendRequests += 1;
        lastStartedAtByRequestKey.set(requestKey, now);
        resolve();
        return;
      }

      setTimeout(tryStart, Math.max(sameRequestWaitMs, 50));
    };

    tryStart();
  });

  try {
    return await task();
  } finally {
    activeBackendRequests = Math.max(0, activeBackendRequests - 1);
  }
}

function buildHeaders(options: RequestOptions): Headers {
  const headers = new Headers(options.headers);
  const tenantId = options.tenantId ?? localStorage.getItem(TENANT_KEY) ?? "";
  const token = options.token ?? localStorage.getItem(TOKEN_KEY) ?? "";
  const tenantScoped = options.tenantScoped ?? true;

  // /me and other tenant-independent endpoints pass tenantScoped=false.
  // Business endpoints use the selected tenant from localStorage by default.
  headers.set("X-Request-Id", requestId());
  if (tenantScoped && tenantId) headers.set("X-Tenant-Id", tenantId);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.etag) headers.set("If-Match", options.etag);

  const hasBody = options.body !== undefined || options.rawBody !== undefined;
  if (hasBody && !isFormDataBody(options.body) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

function decodeJwtPayload(token: string): { exp?: number } | undefined {
  const [, payload] = token.split(".");
  if (!payload) return undefined;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as { exp?: number };
  } catch {
    return undefined;
  }
}

function isTokenExpired(token: string, skewSeconds = 15) {
  const exp = decodeJwtPayload(token)?.exp;
  if (!exp) return false;
  return exp * 1000 <= Date.now() + skewSeconds * 1000;
}

function currentReturnTo() {
  return `${window.location.pathname}${window.location.search}`;
}

function handleUnauthorized(path: string) {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  const recentlyLoggedIn = wasLoginCallbackRecent();
  const expired = token ? isTokenExpired(token) : true;

  if ((expired || path === "/me") && !recentlyLoggedIn) {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { returnTo: currentReturnTo() } }));
    return;
  }

  window.dispatchEvent(new CustomEvent(BACKEND_UNAUTHORIZED_EVENT, {
    detail: { path, returnTo: currentReturnTo(), recentlyLoggedIn, expired }
  }));
}

async function refreshAccessToken(path: string): Promise<string> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY) || "";
  if (!refreshToken) {
    handleUnauthorized(path);
    throw new ApiError(401, "Please sign in again.");
  }

  if (!refreshSessionPromise) {
    refreshSessionPromise = refreshKeycloakSession(refreshToken)
      .then((session) => session.accessToken)
      .finally(() => {
        refreshSessionPromise = null;
      });
  }

  try {
    return await refreshSessionPromise;
  } catch (error) {
    handleUnauthorized(path);
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "Please sign in again.");
  }
}

async function tokenForRequest(path: string, options: RequestOptions) {
  if (options.token !== undefined) return options.token;
  const token = localStorage.getItem(TOKEN_KEY) || "";
  if (!token) {
    return localStorage.getItem(REFRESH_TOKEN_KEY) ? refreshAccessToken(path) : "";
  }
  if (!isTokenExpired(token, 45)) return token;
  return refreshAccessToken(path);
}

async function parseError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | undefined;
  try {
    body = await response.clone().json();
  } catch {
    body = undefined;
  }

  const fallback: Record<number, string> = {
    400: "Invalid request.",
    401: "You are not signed in, or your session is invalid.",
    403: "You do not have access to this resource.",
    404: "The resource was not found.",
    409: "The request conflicts with the current resource state.",
    412: "The resource changed. Refresh and try again."
  };

  return new ApiError(response.status, body?.message || fallback[response.status] || "Request failed.", body);
}

const DEFAULT_ERROR_MESSAGE = "Something went wrong. Try again.";
const TECHNICAL_ERROR_PATTERNS = [
  /x-tenant-id/i,
  /requestcontexts?/i,
  /request context/i,
  /jwt/i,
  /oidc/i,
  /keycloak/i,
  /access[_ -]?token/i,
  /id[_ -]?token/i,
  /authorization code/i,
  /invalid[_ -]?grant/i,
  /bearer/i,
  /uuid/i,
  /sql/i,
  /exception/i,
  /stack trace/i,
  /java\./i,
  /com\.example/i,
  /http \d{3}/i,
  /missing .*header/i,
  /invalid .*header/i
];

export function toUserErrorMessage(message?: string, fallback = DEFAULT_ERROR_MESSAGE) {
  const normalized = message?.trim();
  if (!normalized) return fallback;
  if (normalized.length > 180) return fallback;
  if (TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(normalized))) return fallback;
  return normalized;
}

export function getFriendlyError(error: unknown, conflictText = "That change could not be saved. Refresh and try again.") {
  if (!(error instanceof ApiError)) {
    return toUserErrorMessage(error instanceof Error ? error.message : undefined);
  }
  if (error.status === 400) return "Check the details and try again.";
  if (error.status === 401) return "Please sign in again.";
  if (error.status === 403) return "You do not have permission to do that.";
  if (error.status === 404) return "We could not find that record.";
  if (error.status === 409) return toUserErrorMessage(conflictText, "That change could not be saved.");
  if (error.status === 412) return "This record changed. Refresh and try again.";
  if (error.status === 429) return "Too many requests. Try again shortly.";
  if (error.status >= 500) return "Something went wrong on our side. Try again shortly.";
  return DEFAULT_ERROR_MESSAGE;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const body =
    options.rawBody ??
    (options.body === undefined || isFormDataBody(options.body)
      ? (options.body as BodyInit | undefined)
      : JSON.stringify(options.body));

  const requestKey = backendRequestKey(path, options, body);
  const method = methodFor(options);
  if (method === "GET") {
    const inFlight = inFlightGetRequests.get(requestKey);
    if (inFlight) return inFlight as Promise<ApiResult<T>>;
  }

  const execute = async (): Promise<ApiResult<T>> => {
    const fetchWithToken = async (token: string) => fetch(joinUrl(appConfig.apiBaseUrl, path), {
      ...options,
      body,
      headers: buildHeaders({ ...options, token })
    });

    let token = await tokenForRequest(path, options);
    let response = await fetchWithToken(token);

    if (response.status === 401 && options.token === undefined && localStorage.getItem(REFRESH_TOKEN_KEY)) {
      try {
        token = await refreshAccessToken(path);
        response = await fetchWithToken(token);
      } catch {
        const error = await parseError(response);
        handleUnauthorized(path);
        throw error;
      }
    }

    if (!response.ok) {
      const error = await parseError(response);
      if (error.status === 401) {
        handleUnauthorized(path);
      }
      throw error;
    }

    const etag = response.headers.get("ETag") || undefined;
    const parseAs = options.parseAs ?? "json";
    let data: T;

    if (response.status === 204 || parseAs === "empty") {
      data = undefined as T;
    } else if (parseAs === "blob") {
      data = (await response.blob()) as T;
    } else if (parseAs === "text") {
      data = (await response.text()) as T;
    } else {
      data = (await response.json()) as T;
    }

    // Some controllers return ETag headers; others only expose version in JSON.
    // We normalize both into ApiResult.etag for If-Match callers.
    const versionEtag =
      etag ??
      (data && typeof data === "object" && "version" in data && typeof (data as { version?: unknown }).version === "number"
        ? `"${(data as { version: number }).version}"`
        : undefined);

    return { data, etag: versionEtag, response };
  };

  const scheduled = scheduleBackendRequest(requestKey, execute);
  if (method === "GET") {
    inFlightGetRequests.set(requestKey, scheduled as Promise<ApiResult<unknown>>);
    scheduled.then(
      () => inFlightGetRequests.delete(requestKey),
      () => inFlightGetRequests.delete(requestKey)
    );
  }
  return scheduled;
}

export function normalizePage<T>(raw: unknown): { items: T[]; page: number; size: number; total: number } {
  const value = raw as {
    items?: T[];
    content?: T[];
    page?: number;
    number?: number;
    size?: number;
    total?: number;
    totalCount?: number;
    totalElements?: number;
  };

  return {
    items: value.items ?? value.content ?? [],
    page: value.page ?? value.number ?? 0,
    size: value.size ?? 20,
    total: value.total ?? value.totalCount ?? value.totalElements ?? 0
  };
}

export function parseContentDispositionFilename(header: string | null) {
  if (!header) return undefined;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);

  const plainMatch = header.match(/filename="?([^"]+)"?/i);
  return plainMatch?.[1];
}
