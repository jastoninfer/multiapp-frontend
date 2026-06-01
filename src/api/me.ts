import { apiRequest } from "./client";
import { MeResponseWithTenants, MeTenantResponse, UUID } from "../types";

export async function getMe() {
  const { data } = await apiRequest<MeResponseWithTenants>("/me", { tenantScoped: false });
  return data;
}

export async function setDefaultTenant(userId: UUID, tenantId: UUID) {
  const { data } = await apiRequest<MeTenantResponse[]>(`/users/${userId}/default-tenant`, {
    method: "POST",
    body: { tenantId },
    tenantId
  });
  return data;
}
