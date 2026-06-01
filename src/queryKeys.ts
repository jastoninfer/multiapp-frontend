import { UUID } from "./types";

export const queryKeys = {
  me: ["me"] as const,
  ticketLists: (tenantId: string) => ["tickets", tenantId] as const,
  tickets: (tenantId: string, filters: unknown) => ["tickets", tenantId, filters] as const,
  ticket: (tenantId: string, ticketId: UUID) => ["ticket", tenantId, ticketId] as const,
  ticketComments: (tenantId: string, ticketId: UUID, page = 0) => ["ticket-comments", tenantId, ticketId, page] as const,
  ticketAttachments: (tenantId: string, ticketId: UUID) => ["ticket-attachments", tenantId, ticketId] as const,
  appointments: (tenantId: string, filters: unknown) => ["appointments", tenantId, filters] as const,
  appointment: (tenantId: string, appointmentId: UUID) => ["appointment", tenantId, appointmentId] as const,
  members: (tenantId: string, filters: unknown) => ["members", tenantId, filters] as const,
  member: (tenantId: string, userId: UUID) => ["member", tenantId, userId] as const,
  contacts: (tenantId: string, filters: unknown) => ["contacts", tenantId, filters] as const,
  contact: (tenantId: string, contactId: UUID) => ["contact", tenantId, contactId] as const,
  auditLogs: (tenantId: string, filters: unknown) => ["audit-logs", tenantId, filters] as const,
  tenant: (tenantId: string) => ["tenant", tenantId] as const,
  adminTenants: (filters: unknown) => ["admin-tenants", filters] as const,
  resourceAvailability: (tenantId: string, resourceUserId: UUID, from?: string, to?: string) =>
    ["resource-availability", tenantId, resourceUserId, from ?? "", to ?? ""] as const,
  resourceBlocks: (tenantId: string, resourceUserId: UUID, from?: string, to?: string) =>
    ["resource-blocks", tenantId, resourceUserId, from ?? "", to ?? ""] as const,
  workingHours: (tenantId: string, resourceUserId: UUID) => ["working-hours", tenantId, resourceUserId] as const
};
