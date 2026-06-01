import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { getMe } from "../api/me";
import { useAuth } from "../auth/AuthContext";
import { queryKeys } from "../queryKeys";

export function useCurrentTenant() {
  const { isAuthenticated, tenantId } = useAuth();
  const location = useLocation();
  const isAuthFlowRoute =
    location.pathname.startsWith("/auth/callback") ||
    location.pathname.startsWith("/signed-out") ||
    location.pathname.startsWith("/session-expired");
  const meQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: getMe,
    enabled: isAuthenticated && !isAuthFlowRoute
  });

  const tenants = meQuery.data?.tenants ?? [];
  const profile = meQuery.data?.meResponse;
  // /me is the single source of truth for both profile and tenant memberships.
  // Do not add a separate /me/tenants query unless the backend contract changes.
  const currentTenant =
    tenants.find((tenant) => tenant.tenantId === tenantId) ??
    tenants.find((tenant) => tenant.isDefault) ??
    tenants[0];

  return {
    meQuery,
    tenantsQuery: meQuery,
    profile,
    currentTenant,
    tenants,
    role: currentTenant?.role
  };
}
