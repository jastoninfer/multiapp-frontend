import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AuthRedirect } from "./AuthRedirect";

export function RequireAuth() {
  const { authIssue, isAuthenticated } = useAuth();

  if (authIssue === "session-expired") {
    return <Navigate to="/session-expired" replace />;
  }

  if (!isAuthenticated) {
    return <AuthRedirect />;
  }

  return <Outlet />;
}
