import { MeResponse, MeTenantResponse, TenantRole } from "../types";

export interface AuthzContext {
  me?: MeResponse;
  tenant?: MeTenantResponse;
}

function normalizeRole(role?: TenantRole) {
  return role?.toUpperCase();
}

export function isPlatformAdmin(me?: MeResponse, tenants: MeTenantResponse[] = []) {
  return Boolean(me?.isPlatformAdmin ?? me?.is_platform_admin) || tenants.some((tenant) =>
    tenant.name === "__platform_admin" && normalizeRole(tenant.role) === "ADMIN"
  );
}

export function hasRole(ctx: AuthzContext, role: TenantRole) {
  return normalizeRole(ctx.tenant?.role) === normalizeRole(role);
}

export function hasAnyRole(ctx: AuthzContext, roles: TenantRole[]) {
  return roles.some((role) => hasRole(ctx, role));
}

export function isAdmin(ctx: AuthzContext) {
  return isPlatformAdmin(ctx.me) || hasRole(ctx, "ADMIN");
}

export function isAgentOrAdmin(ctx: AuthzContext) {
  return isPlatformAdmin(ctx.me) || hasAnyRole(ctx, ["AGENT", "ADMIN"]);
}

export function isResourceUser(ctx: AuthzContext) {
  return hasRole(ctx, "RESOURCE_USER");
}

export function isCustomer(ctx: AuthzContext) {
  return hasRole(ctx, "CUSTOMER");
}
