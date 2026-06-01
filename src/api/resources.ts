import { apiRequest } from "./client";
import { AvailabilityResponse, ResourceBlockResponse, UUID, WorkingHoursRule } from "../types";

export async function getAvailability(resourceUserId: UUID, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const suffix = params.toString() ? `?${params}` : "";
  return apiRequest<AvailabilityResponse>(`/resources/${resourceUserId}/availability${suffix}`);
}

export async function listResourceBlocks(resourceUserId: UUID, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const suffix = params.toString() ? `?${params}` : "";
  const { data } = await apiRequest<ResourceBlockResponse[]>(`/resources/${resourceUserId}/blocks${suffix}`);
  return data;
}

export async function createResourceBlock(
  resourceUserId: UUID,
  body: { startAt: string; endAt: string; reason: string }
) {
  return apiRequest<ResourceBlockResponse>(`/resources/${resourceUserId}/blocks`, {
    method: "POST",
    body
  });
}

export async function deleteResourceBlock(resourceUserId: UUID, blockId: UUID, version: number) {
  return apiRequest<void>(`/resources/${resourceUserId}/blocks/${blockId}`, {
    method: "DELETE",
    etag: `"${version}"`,
    parseAs: "empty"
  });
}

export async function updateWorkingHours(resourceUserId: UUID, timezone: string, rules: WorkingHoursRule[]) {
  return apiRequest<void>(`/resources/${resourceUserId}/availability`, {
    method: "PUT",
    body: { timezone, rules },
    parseAs: "empty"
  });
}
