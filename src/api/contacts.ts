import { apiRequest, normalizePage } from "./client";
import { ClaimCodeResponse, ClaimResult, ContactResponse, PageResponse, UUID } from "../types";

export interface ContactFilters {
  displayName?: string;
  email?: string;
  phone?: string;
  linked?: string;
  page?: number;
  size?: number;
}

function contactParams(filters: ContactFilters = {}) {
  const params = new URLSearchParams({
    page: String(filters.page ?? 0),
    size: String(filters.size ?? 20)
  });
  if (filters.displayName) params.set("displayName", filters.displayName);
  if (filters.email) params.set("email", filters.email);
  if (filters.phone) params.set("phone", filters.phone);
  if (filters.linked) params.set("linked", filters.linked);
  return params;
}

export async function listContacts(filters: ContactFilters = {}): Promise<PageResponse<ContactResponse>> {
  const { data } = await apiRequest<unknown>(`/contacts?${contactParams(filters)}`);
  return normalizePage<ContactResponse>(data);
}

export async function getContact(contactId: UUID) {
  return apiRequest<ContactResponse>(`/contacts/${contactId}`);
}

export async function createContact(body: { contactType?: string; email?: string; phone?: string; displayName: string }) {
  return apiRequest<ContactResponse>("/contacts", {
    method: "POST",
    body
  });
}

export async function updateContact(
  contactId: UUID,
  etag: string,
  body: { contactType?: string; email?: string; phone?: string; displayName?: string }
) {
  return apiRequest<void>(`/contacts/${contactId}`, {
    method: "PATCH",
    etag,
    body,
    parseAs: "empty"
  });
}

export async function issueClaimCode(contactId: UUID, expiresInMinutes: number) {
  const { data } = await apiRequest<ClaimCodeResponse>(`/contacts/${contactId}/claim-codes`, {
    method: "POST",
    body: { expiresInMinutes }
  });
  return data;
}

export async function claimContact(body: { code: string; email?: string; phone?: string }) {
  const { data } = await apiRequest<ClaimResult>("/contacts/claim", {
    method: "POST",
    body
  });
  return data;
}
