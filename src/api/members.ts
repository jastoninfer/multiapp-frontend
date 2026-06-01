import { apiRequest, normalizePage } from "./client";
import { cleanQueryParam } from "./params";
import { MemberUserInfo, PageResponse, TenantRole, UUID } from "../types";

export interface MemberFilters {
  q?: string | null;
  role?: TenantRole;
  status?: string;
  page?: number;
  size?: number;
}

function memberParams(filters: MemberFilters = {}) {
  const params = new URLSearchParams({
    page: String(filters.page ?? 0),
    size: String(filters.size ?? 20)
  });
  if (filters.role) params.set("role", filters.role);
  if (filters.status) params.set("status", filters.status);
  const q = cleanQueryParam(filters.q);
  if (q !== null) params.set("q", q);
  return params;
}

export async function listMembers(filters: MemberFilters = {}): Promise<PageResponse<MemberUserInfo>> {
  const qs = memberParams(filters);
  const { data } = await apiRequest<unknown>(`/members${qs ? `?${qs}` : ""}`);
  // const { data } = await apiRequest<unknown>(`/members?${memberParams(filters)}`);
  return normalizePage<MemberUserInfo>(data);
  // return filters.role ? { ...page, items: page.items.filter((item) => item.role === filters.role) } : page;
}

export async function getMember(userId: UUID) {
  return apiRequest<MemberUserInfo>(`/members/${userId}`);
}

export async function addMember(body: { userId: UUID; role: TenantRole; isDefault: boolean }) {
  return apiRequest<MemberUserInfo>("/members", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body
  });
}

export async function updateMember(userId: UUID, etag: string, targetRole: TenantRole) {
  return apiRequest<void>(`/members/${userId}`, {
    method: "PATCH",
    etag,
    body: { targetRole },
    parseAs: "empty"
  });
}

export async function removeMember(userId: UUID, version: number) {
  return apiRequest<void>(`/members/${userId}`, {
    method: "DELETE",
    etag: `"${version}"`,
    parseAs: "empty"
  });
}
