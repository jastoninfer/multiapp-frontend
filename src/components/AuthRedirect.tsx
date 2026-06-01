import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { startKeycloakLogin } from "../auth/oidc";
import { LOGOUT_IN_PROGRESS_KEY, useAuth } from "../auth/AuthContext";
import { ErrorMessage } from "./ErrorMessage";

export function AuthRedirect() {
  const { config } = useAuth();
  const location = useLocation();
  const [error, setError] = useState("");
  const started = useRef(false);
  const logoutInProgress = sessionStorage.getItem(LOGOUT_IN_PROGRESS_KEY) === "1";

  useEffect(() => {
    if (logoutInProgress) return;
    if (started.current) return;
    started.current = true;
    const returnTo = `${location.pathname}${location.search}`;
    startKeycloakLogin(config, returnTo).catch((err) => {
      setError(err instanceof Error ? err.message : "Unable to start sign-in.");
    });
  }, [config, location.pathname, location.search, logoutInProgress]);

  if (logoutInProgress) {
    return <Navigate to="/signed-out" replace />;
  }

  return (
    <section className="panel narrow">
      <h1>Redirecting to sign in</h1>
      <p className="muted">This workspace requires authentication for every page.</p>
      <ErrorMessage message={error} />
    </section>
  );
}
