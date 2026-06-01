import { apiRequest, normalizePage } from "./client";
import { PageResponse, TenantResponse, UUID } from "../types";

export async function getTenant() {
  const { data } = await apiRequest<TenantResponse>("/tenant");
  return data;
}

export async function updateTenant(body: { name?: string }) {
  const { data } = await apiRequest<TenantResponse>("/tenant", {
    method: "PATCH",
    body
  });
  return data;
}

export async function transitionTenant(options: {
  fromStatus: string;
  toStatus: string;
  requestTenantId?: UUID;
  targetTenantId?: UUID;
}) {
  const { data } = await apiRequest<TenantResponse>("/tenant/transition", {
    method: "POST",
    tenantId: options.requestTenantId,
    body: {
      fromStatus: options.fromStatus,
      toStatus: options.toStatus,
      targetTenantId: options.targetTenantId
    }
  });
  return data;
}

export async function listAdminTenants(): Promise<PageResponse<TenantResponse>> {
  const { data } = await apiRequest<unknown>("/admin/tenants?page=0&size=20");
  return normalizePage<TenantResponse>(data);
}

export async function createTenant(name: string) {
  const { data } = await apiRequest<TenantResponse>("/admin/tenants", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: { name }
  });
  return data;
}

export async function transitionUser(userId: UUID, fromStatus: string, toStatus: string) {
  const { data } = await apiRequest<unknown>(`/users/${userId}/transition`, {
    method: "POST",
    body: { fromStatus, toStatus }
  });
  return data;
}
