import { useEffect, useState } from "react";
import { startKeycloakLogin } from "../auth/oidc";
import { LOGOUT_IN_PROGRESS_KEY, useAuth } from "../auth/AuthContext";
import { ErrorMessage } from "../components/ErrorMessage";

export function SignedOutPage() {
  const { config, clearAuthIssue, clearSession } = useAuth();
  const [error, setError] = useState("");
  const [isStartingLogin, setIsStartingLogin] = useState(false);

  useEffect(() => {
    clearSession();
    clearAuthIssue();
    sessionStorage.removeItem(LOGOUT_IN_PROGRESS_KEY);
  }, [clearAuthIssue, clearSession]);

  function signIn() {
    setError("");
    setIsStartingLogin(true);
    clearAuthIssue();
    sessionStorage.removeItem(LOGOUT_IN_PROGRESS_KEY);
    startKeycloakLogin(config, "/dashboard").catch((err) => {
      setIsStartingLogin(false);
      setError(err instanceof Error ? err.message : "Unable to start sign-in.");
    });
  }

  return (
    <section className="panel narrow">
      <h1>You are signed out</h1>
      <p className="muted">Your local session has been cleared and Keycloak sign-out has been requested.</p>
      <button type="button" disabled={isStartingLogin} onClick={signIn}>Sign in again</button>
      <ErrorMessage message={error} />
    </section>
  );
}
