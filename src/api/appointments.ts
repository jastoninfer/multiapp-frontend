import { apiRequest } from "./client";
import {
  AppointmentCreatedResponse,
  AppointmentDetailResponse,
  AppointmentSummary,
  CreateAppointmentRequest,
  PageResponse,
  UpdateAppointmentRequest,
  UUID
} from "../types";
import { normalizePage } from "./client";

export interface AppointmentFilters {
  resourceUserId?: UUID;
  ticketId?: UUID;
  from?: string;
  to?: string;
  status?: string;
  sort?: string;
  page?: number;
  size?: number;
}

export async function listAppointments(filters: AppointmentFilters = {}): Promise<PageResponse<AppointmentSummary>> {
  const params = new URLSearchParams({ page: String(filters.page ?? 0), size: String(filters.size ?? 20) });
  Object.entries(filters).forEach(([key, value]) => {
    if (value && key !== "page" && key !== "size") params.set(key, String(value));
  });

  const { data } = await apiRequest<unknown>(`/appointments?${params}`);
  return normalizePage<AppointmentSummary>(data);
}

export async function createAppointment(ticketId: UUID, body: CreateAppointmentRequest) {
  return apiRequest<AppointmentCreatedResponse>(`/tickets/${ticketId}/appointments`, {
    method: "POST",
    body
  });
}

export async function getAppointment(id: UUID) {
  return apiRequest<AppointmentDetailResponse>(`/appointments/${id}`);
}

export async function patchAppointment(id: UUID, etag: string, body: UpdateAppointmentRequest) {
  return apiRequest<void>(`/appointments/${id}`, {
    method: "PATCH",
    etag,
    body,
    parseAs: "empty"
  });
}
