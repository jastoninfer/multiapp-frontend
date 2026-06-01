import { useState } from "react";
import { SESSION_EXPIRED_RETURN_TO_KEY, useAuth } from "../auth/AuthContext";
import { clearOidcTransientState, startKeycloakLogin } from "../auth/oidc";
import { ErrorMessage } from "../components/ErrorMessage";

export function SessionExpiredPage() {
  const { config, clearSession, clearAuthIssue } = useAuth();
  const [error, setError] = useState("");
  const [isStartingLogin, setIsStartingLogin] = useState(false);
  const returnTo = sessionStorage.getItem(SESSION_EXPIRED_RETURN_TO_KEY) || "/dashboard";

  function signIn(forceLogin = false) {
    setError("");
    setIsStartingLogin(true);
    clearSession();
    clearAuthIssue();
    clearOidcTransientState();
    sessionStorage.removeItem(SESSION_EXPIRED_RETURN_TO_KEY);
    startKeycloakLogin(config, returnTo, forceLogin ? { prompt: "login" } : {}).catch((err) => {
      setIsStartingLogin(false);
      setError(err instanceof Error ? err.message : "Unable to start sign-in.");
    });
  }

  return (
    <section className="panel narrow">
      <h1>Please sign in again</h1>
      <p className="muted">
        For your security, your sign-in has expired or changed in another tab. Sign in again and we will bring you back to where you were.
      </p>
      <div className="inline-form">
        <button type="button" disabled={isStartingLogin} onClick={() => signIn(false)}>Sign in again</button>
        <button type="button" className="secondary" disabled={isStartingLogin} onClick={() => signIn(true)}>Use a different account</button>
      </div>
      <ErrorMessage message={error} />
    </section>
  );
}
