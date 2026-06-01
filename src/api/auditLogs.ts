import { apiRequest, normalizePage } from "./client";
import { cleanQueryParam } from "./params";
import { AuditEntityType, AuditLogResponse, PageResponse, UUID } from "../types";

export interface AuditLogFilters {
  entityType?: AuditEntityType;
  entityId?: UUID | null;
  action?: string | null;
  requestId?: string | null;
  page?: number;
  size?: number;
}

function auditLogParams(filters: AuditLogFilters = {}) {
  const params = new URLSearchParams({
    page: String(filters.page ?? 0),
    size: String(filters.size ?? 20)
  });
  if (filters.entityType) params.set("entityType", filters.entityType);
  const entityId = cleanQueryParam(filters.entityId);
  if (entityId !== null) params.set("entityId", entityId);
  const action = cleanQueryParam(filters.action);
  if (action !== null) params.set("action", action);
  const requestId = cleanQueryParam(filters.requestId);
  if (requestId !== null) params.set("requestId", requestId);
  return params;
}

export async function listAuditLogs(filters: AuditLogFilters = {}): Promise<PageResponse<AuditLogResponse>> {
  const qs = auditLogParams(filters);
  const { data } = await apiRequest<unknown>(`/audit-logs?${qs}`);
  return normalizePage<AuditLogResponse>(data);
}
