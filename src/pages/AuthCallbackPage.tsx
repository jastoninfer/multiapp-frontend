import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  clearCallbackExchange,
  clearOidcTransientState,
  consumeReturnTo,
  exchangeCodeForToken,
  markLoginCallbackCompleted,
  markCallbackExchangeConsumed,
  OidcTokenExchangeError,
  peekReturnTo,
  reserveCallbackExchange,
  startKeycloakLogin
} from "../auth/oidc";
import { LOGOUT_IN_PROGRESS_KEY, useAuth } from "../auth/AuthContext";
import { ErrorMessage } from "../components/ErrorMessage";

type CallbackStatus = "processing" | "duplicate" | "recoverable-error" | "fatal-error";

export function AuthCallbackPage() {
  const { config, setSession, clearSession, clearAuthIssue } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [status, setStatus] = useState<CallbackStatus>("processing");
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      setStatus("fatal-error");
      setError("The Keycloak callback is missing code or state.");
      return;
    }

    if (!reserveCallbackExchange(code, state)) {
      setStatus("duplicate");
      return;
    }

    exchangeCodeForToken(code, state)
      .then((session) => {
        markCallbackExchangeConsumed(code, state);
        markLoginCallbackCompleted();
        clearOidcTransientState();
        sessionStorage.removeItem(LOGOUT_IN_PROGRESS_KEY);
        clearAuthIssue();
        setSession(session);
        navigate(consumeReturnTo(), { replace: true });
      })
      .catch((err) => {
        clearCallbackExchange(code, state);
        clearSession();
        sessionStorage.removeItem(LOGOUT_IN_PROGRESS_KEY);

        if (err instanceof OidcTokenExchangeError && err.error === "invalid_grant") {
          clearOidcTransientState();
          setStatus("recoverable-error");
          setError("The sign-in authorization code was already used or expired. Start sign-in again to continue.");
          return;
        }

        setStatus("fatal-error");
        setError(err instanceof Error ? err.message : "Unable to complete sign-in.");
      });
  }, [clearAuthIssue, clearSession, navigate, params, setSession]);

  function retry(forceLogin = false) {
    setError("");
    setStatus("processing");
    clearOidcTransientState();
    sessionStorage.removeItem(LOGOUT_IN_PROGRESS_KEY);
    clearAuthIssue();
    startKeycloakLogin(config, peekReturnTo(), forceLogin ? { prompt: "login" } : {}).catch((err) => {
      setStatus("fatal-error");
      setError(err instanceof Error ? err.message : "Unable to start sign-in.");
    });
  }

  return (
    <section className="panel narrow">
      <h1>Completing sign-in</h1>
      {status === "processing" && <p className="muted">Exchanging the authorization code for an access token...</p>}
      {status === "duplicate" && <p className="muted">This sign-in callback is already being processed.</p>}
      <ErrorMessage message={error} />
      {(status === "recoverable-error" || status === "fatal-error") && (
        <div className="inline-form">
          <button type="button" onClick={() => retry(false)}>Start sign-in again</button>
          <button type="button" className="secondary" onClick={() => retry(true)}>Force re-authentication</button>
        </div>
      )}
    </section>
  );
}
