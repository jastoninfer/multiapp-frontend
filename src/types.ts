export type UUID = string;

export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketType = "INCIDENT" | "SERVICE_REQUEST";
export type TicketStatus =
  | "NEW"
  | "IN_PROGRESS"
  | "CLOSED"
  | "REOPENED"
  | string;

export type AppointmentStatus =
  | "BOOKED"
  | "RESCHEDULED"
  | "CANCELLED"
  | "COMPLETED"
  | string;

export interface PageResponse<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export interface SliceBlock<T> {
  items: T[];
  totalCount: number;
  hasMore: boolean;
}

export interface TicketResponse {
  id: UUID;
  ticketNo?: number;
  version?: number;
  status?: TicketStatus;
  priority?: TicketPriority;
  type?: TicketType;
  ticketType?: TicketType;
  ownerUserId?: UUID | null;
  ownerName?: string | null;
  requesterUserId?: UUID | null;
  requesterContactId?: UUID | null;
  linkedUserId?: UUID | null;
  requesterName?: string | null;
  createdByUserId?: UUID | null;
  createdByName?: string | null;
  title: string;
  description?: string | null;
  locationText?: string | null;
  createdAt?: string;
  updatedAt?: string;
  commentCount?: number;
  attachmentCount?: number;
  nextAppointmentAt?: string | null;
}

export interface TicketDetailResponse {
  ticket: TicketResponse;
  isManagedAsResourceUser?: boolean;
  upcomingAppointments?: SliceBlock<AppointmentSummary>;
  recentPastAppointments?: SliceBlock<AppointmentSummary>;
  appointments?: SliceBlock<AppointmentSummary>;
  comments?: SliceBlock<CommentResponse>;
  attachments?: SliceBlock<AttachmentSummary>;
}

export interface CreateTicketRequest {
  requesterUserId?: UUID | null;
  requesterContactId?: UUID | null;
  title: string;
  description?: string;
  ticketType: TicketType;
  locationText?: string;
}

export interface TicketCreatedResponse {
  id: UUID;
  version: number;
  status: TicketStatus;
}

export interface AppointmentSummary {
  id: UUID;
  version?: number;
  ticketId?: UUID | null;
  ticketTitle?: string | null;
  title?: string | null;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  resourceUserId: UUID;
  resourceUserName?: string | null;
  addressText?: string | null;
}

export interface AppointmentDetailResponse extends AppointmentSummary {
  notes?: string | null;
  arrivedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AppointmentCreatedResponse {
  appointmentId: UUID;
  version: number;
  status: AppointmentStatus;
}

export interface CreateAppointmentRequest {
  resourceUserId: UUID;
  customerUserId?: UUID | null;
  customerContactId?: UUID | null;
  startAt: string;
  endAt: string;
  addressText?: string;
  notes?: string;
}

export interface UpdateAppointmentRequest {
  status?: AppointmentStatus;
  startAt?: string;
  endAt?: string;
  notes?: string;
  addressText?: string;
  arrivedAt?: string;
}

export interface AttachmentSummary {
  id: UUID;
  attachmentId?: UUID;
  filename: string;
  contentType?: string;
  sizeBytes?: number;
  downloadUrl?: string;
  uploadedByUserId?: UUID;
  uploadedByUserName?: string | null;
  uploadedByName?: string | null;
  createdAt?: string;
}

export interface AttachmentResponse {
  attachmentId: UUID;
  ticketId: UUID;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt?: string;
  downloadUrl: string;
}

export interface ApiErrorBody {
  code?: string;
  message?: string;
  violations?: Array<{ field: string; message: string }>;
  timestamp?: string;
}

export interface TicketFilters {
  ticketStatus?: string;
  ticketPriority?: string;
  q?: string | null;
  ownerId?: UUID;
  requesterUserId?: UUID;
  requesterContactId?: UUID;
  ticketType?: string;
  createdFrom?: string;
  createdTo?: string;
  sort?: string;
  page?: number;
  size?: number;
}

export interface UpdateTicketRequest {
  title?: string;
  description?: string;
  priority?: TicketPriority;
  locationText?: string;
  ticketType?: TicketType;
}

export type CommentVisibility = "PUBLIC" | "INTERNAL" | string;

export interface CommentResponse {
  id: UUID;
  tenantId?: UUID;
  ticketId?: UUID;
  authorId?: UUID;
  actorUserId?: UUID;
  authorName?: string | null;
  authorDisplayName?: string | null;
  role?: TenantRole | string | null;
  authorRole?: TenantRole | string | null;
  visibility: CommentVisibility;
  body: string;
  createdAt?: string;
  editedAt?: string;
}

export interface ResourceBlockResponse {
  id: UUID;
  resourceUserId: UUID;
  startAt: string;
  endAt: string;
  reason: string;
  createdAt?: string;
  updatedAt?: string;
  version: number;
}

export interface WorkingHoursRule {
  dayOfWeek: number;
  startLocal: string;
  endLocal: string;
  timezone?: string;
}

export interface AvailabilityResponse {
  resourceUserId: UUID;
  blocks: ResourceBlockResponse[];
  appointments: AppointmentSummary[];
  workingHours: WorkingHoursRule[];
}

export type TenantRole = "ADMIN" | "AGENT" | "RESOURCE_USER" | "CUSTOMER" | string;

export interface MeResponse {
  userId: UUID;
  email: string;
  displayName: string;
  phone?: string | null;
  status: string;
  createdAt: string;
  isPlatformAdmin?: boolean;
  is_platform_admin?: boolean;
}

export interface MeTenantResponse {
  tenantId: UUID;
  name: string;
  role: TenantRole;
  isDefault: boolean;
}

export interface MeResponseWithTenants {
  meResponse: MeResponse;
  tenants: MeTenantResponse[];
}

export interface ContactResponse {
  tenantId: UUID;
  contactId: UUID;
  contactType: "PERSON" | "ORG" | string;
  email?: string | null;
  phone?: string | null;
  displayName: string;
  linkedUserId?: UUID | null;
  linkedUserName?: string | null;
  createdByUserId?: UUID | null;
  codeExpiryTime?: string | null;
  version: number;
}

export interface ClaimResult {
  tenantId: UUID;
  contactId: UUID;
}

export interface ClaimCodeResponse {
  code: string;
  expiresAt: string;
}

export interface MemberUserInfo {
  userId: UUID;
  email: string;
  displayName: string;
  role: TenantRole;
  status: string;
  isDefault: boolean;
  createdAt?: string;
  version: number;
}

export interface TenantResponse {
  id: UUID;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | string;
  createdAt?: string;
}

export type AuditEntityType =
  | "TICKET"
  | "APPOINTMENT"
  | "COMMENT"
  | "ATTACHMENT"
  | "USER"
  | "TENANT"
  | "MEMBERSHIP"
  | "CONTACT"
  | "CONTACT_CLAIM"
  | "RESOURCE_BLOCK"
  | "RESOURCE_WORKING_HOURS"
  | string;

export interface AuditLogResponse {
  tenantId: UUID;
  auditLogId: UUID;
  actorUserId?: UUID | null;
  entityType: AuditEntityType;
  entityId: UUID;
  action: string;
  diffJson?: unknown;
  requestId?: string | null;
  createdAt?: string;
}
