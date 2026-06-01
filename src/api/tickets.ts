import { apiRequest, normalizePage } from "./client";
import { cleanQueryParam } from "./params";
import {
  CreateTicketRequest,
  PageResponse,
  TicketCreatedResponse,
  TicketDetailResponse,
  TicketFilters,
  TicketResponse,
  TicketStatus,
  UpdateTicketRequest,
  UUID
} from "../types";

function ticketParams(filters: TicketFilters = {}) {
  const params = new URLSearchParams({
    page: String(filters.page ?? 0),
    size: String(filters.size ?? 20)
  });
  const q = cleanQueryParam(filters.q);
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "" && key !== "page" && key !== "size" && key !== "q") {
      params.set(key, String(value));
    }
  });
  if (q !== null) params.set("q", q);
  return params;
}

export async function listTickets(filters: TicketFilters = {}): Promise<PageResponse<TicketResponse>> {
  const { data } = await apiRequest<unknown>(`/tickets?${ticketParams(filters)}`);
  return normalizePage<TicketResponse>(data);
}

export async function getTicket(id: UUID) {
  return apiRequest<TicketDetailResponse>(`/tickets/${id}`);
}

export async function createTicket(body: CreateTicketRequest) {
  return apiRequest<TicketCreatedResponse>("/tickets", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body
  });
}

export async function updateTicket(id: UUID, etag: string, body: UpdateTicketRequest) {
  return apiRequest<void>(`/tickets/${id}`, {
    method: "PATCH",
    etag,
    body,
    parseAs: "empty"
  });
}

export async function assignTicket(id: UUID, etag: string, newAssigneeId: UUID) {
  return apiRequest<void>(`/tickets/${id}/assign`, {
    method: "POST",
    etag,
    body: { newAssigneeId },
    parseAs: "empty"
  });
}

export async function transitionTicket(id: UUID, etag: string, fromStatus: TicketStatus, toStatus: TicketStatus) {
  return apiRequest<void>(`/tickets/${id}/transition`, {
    method: "POST",
    etag,
    body: { fromStatus, toStatus },
    parseAs: "empty"
  });
}
