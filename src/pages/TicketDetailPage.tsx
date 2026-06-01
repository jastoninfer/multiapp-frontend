import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Edit3,
  FileText,
  MapPin,
  Loader2,
  Route,
  PlayCircle,
  RotateCcw,
  Send,
  Tag,
  UserRound,
  UsersRound,
  Wrench,
  X,
  type LucideIcon
} from "lucide-react";
import { assignTicket, getTicket, transitionTicket, updateTicket } from "../api/tickets";
import { getFriendlyError } from "../api/client";
import { listMembers } from "../api/members";
import { AppointmentList } from "../components/AppointmentList";
import { AttachmentList } from "../components/AttachmentList";
import { CreateAppointmentForm } from "../components/CreateAppointmentForm";
import { ErrorMessage } from "../components/ErrorMessage";
import { useCurrentTenant } from "../hooks/useCurrentTenant";
import { useAuth } from "../auth/AuthContext";
import { CommentPanel } from "../components/CommentPanel";
import { isAgentOrAdmin, isAdmin, isResourceUser } from "../auth/authorization";
import { invalidateTicketData } from "../cache/invalidation";
import { queryKeys } from "../queryKeys";
import { TicketPriority, TicketStatus, TicketType } from "../types";
import { compactId, formatDateTime, titleCase } from "../ui/format";

const priorities: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const types: TicketType[] = ["INCIDENT", "SERVICE_REQUEST"];
const ADMIN_WRITE = 8;
const REQUESTER_WRITE = 4;
const AGENT_OWNER_WRITE = 2;
const RESOURCE_APPOINTMENT_WRITE = 1;

function slug(value?: string | null) {
  return value ? value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") : "empty";
}

function MetaItem({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="ticket-detail-meta-item">
      <Icon size={16} />
      <span>
        <small>{label}</small>
        <strong>{children}</strong>
      </span>
    </div>
  );
}

function transitionCopy(status: TicketStatus) {
  switch (status) {
    case "IN_PROGRESS":
      return { label: "Start work", description: "Move this ticket to In Progress.", icon: PlayCircle };
    case "CLOSED":
      return { label: "Close ticket", description: "Mark the work as complete.", icon: CheckCircle2 };
    case "REOPENED":
      return { label: "Reopen ticket", description: "Return this ticket to the active queue.", icon: RotateCcw };
    default:
      return { label: `Move to ${titleCase(status)}`, description: `Set status to ${titleCase(status)}.`, icon: Send };
  }
}

export function TicketDetailPage() {
  const { id } = useParams();
  const ticketId = id || "";
  const { isTenantSelected, tenantId } = useAuth();
  const { profile, currentTenant, role } = useCurrentTenant();
  const authz = { me: profile, tenant: currentTenant };
  const queryClient = useQueryClient();
  const canManage = isAgentOrAdmin(authz);
  const isAdminUser = isAdmin(authz);
  const isAgentUser = currentTenant?.role?.toUpperCase() === "AGENT";
  const resourceUser = isResourceUser(authz);
  const canUseAttachments = Boolean(role);
  const [form, setForm] = useState({
    title: "",
    description: "",
    locationText: "",
    priority: "MEDIUM" as TicketPriority,
    ticketType: "SERVICE_REQUEST" as TicketType
  });
  const [assigneeId, setAssigneeId] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false);
  const ownerDropdownRef = useRef<HTMLDivElement | null>(null);

  const query = useQuery({
    queryKey: queryKeys.ticket(tenantId, ticketId),
    queryFn: () => getTicket(ticketId),
    enabled: Boolean(ticketId && isTenantSelected)
  });

  const detail = query.data?.data;
  const ticket = detail?.ticket;
  const etag = query.data?.etag ?? (ticket?.version !== undefined ? `"${ticket.version}"` : undefined);
  const ticketType = ticket?.type ?? ticket?.ticketType;
  const ticketStatus = ticket?.status ?? "";
  const currentUserId = profile?.userId;
  const requesterWrite = Boolean(
    ticket && currentUserId && (
      ticket.requesterUserId === currentUserId ||
      (ticket.requesterContactId && ticket.linkedUserId === currentUserId)
    )
  );
  const writeMask = (
    (isAdminUser ? ADMIN_WRITE : 0) |
    (requesterWrite ? REQUESTER_WRITE : 0) |
    (isAgentUser && ticket?.ownerUserId === currentUserId ? AGENT_OWNER_WRITE : 0) |
    (resourceUser && detail?.isManagedAsResourceUser ? RESOURCE_APPOINTMENT_WRITE : 0)
  );
  const canWriteTicket = writeMask > 0;
  const canEditAllTicketFields = (writeMask & ADMIN_WRITE) > 0;
  const canEditAgentTicketFields = (writeMask & AGENT_OWNER_WRITE) > 0;
  const canEditRequesterTicketFields = ticketStatus !== "CLOSED" && (writeMask & REQUESTER_WRITE) > 0;
  const canEditTicket = canEditAllTicketFields || canEditAgentTicketFields || canEditRequesterTicketFields;
  const canEditPriority = canEditAllTicketFields || canEditAgentTicketFields;
  const canEditType = canEditAllTicketFields;
  const canAddComment = canWriteTicket;
  const canPostInternal = (writeMask & (ADMIN_WRITE | AGENT_OWNER_WRITE)) > 0;
  const canUploadAttachment = canUseAttachments && canWriteTicket;
  const canCreateAppointment = (writeMask & (ADMIN_WRITE | AGENT_OWNER_WRITE)) > 0;
  const canManageOwnership = (writeMask & ADMIN_WRITE) > 0 && (ticketStatus === "NEW" || ticketStatus === "REOPENED");
  const nextStatusOptions: TicketStatus[] = [];
  if ((writeMask & ADMIN_WRITE) > 0) {
    if (ticketStatus === "IN_PROGRESS") nextStatusOptions.push("CLOSED");
    if (ticketStatus === "CLOSED") nextStatusOptions.push("REOPENED");
  } else {
    if ((writeMask & AGENT_OWNER_WRITE) > 0 && ticketStatus === "IN_PROGRESS") nextStatusOptions.push("CLOSED");
    if ((writeMask & REQUESTER_WRITE) > 0 && ticketStatus === "CLOSED") nextStatusOptions.push("REOPENED");
  }
  const eligibleMembers = useQuery({
    queryKey: queryKeys.members(tenantId, { q: "", page: 0, size: 100 }),
    queryFn: () => listMembers({ q: "", page: 0, size: 100 }),
    enabled: Boolean(tenantId && canManageOwnership)
  });
  const ownerCandidates = eligibleMembers.data?.items.filter((m) =>
    (m.role === "AGENT" || m.role === "ADMIN") && m.status === "ACTIVE" && m.userId !== ticket?.ownerUserId
  ) ?? [];
  const selectedOwner = ownerCandidates.find((member) => member.userId === assigneeId);
  const canManageTicketOwner = canManageOwnership && ownerCandidates.length > 0;
  const ownerActionLabel = ticket?.ownerUserId ? "Reassign owner" : "Assign owner";
  const showWorkflow = canManageTicketOwner || nextStatusOptions.length > 0;
  const requesterLabel = ticket?.requesterName || compactId(ticket?.requesterUserId || ticket?.requesterContactId);
  const ownerLabel = ticket?.ownerName || compactId(ticket?.ownerUserId);
  const requesterIsContact = Boolean(ticket?.requesterContactId && !ticket?.requesterUserId);
  const ownerContent = canManage && ticket?.ownerUserId ? (
    <Link className="person-inline-link" to={`/members/${ticket.ownerUserId}`}>{ownerLabel}</Link>
  ) : ownerLabel;
  const requesterContent = canManage && requesterIsContact && ticket?.requesterContactId ? (
    <span className="ticket-requester-combo">
      <Link className="person-inline-link contact-person-link" to={`/contacts/${ticket.requesterContactId}`}>{requesterLabel}</Link>
    </span>
  ) : canManage && ticket?.requesterUserId ? (
    <Link className="person-inline-link" to={`/members/${ticket.requesterUserId}`}>{requesterLabel}</Link>
  ) : requesterIsContact ? (
    <span className="ticket-requester-combo">
      <span className="contact-person-name">{requesterLabel}</span>
    </span>
  ) : requesterLabel;

  function resetDraftFromTicket() {
    if (!ticket) return;
    setForm({
      title: ticket.title ?? "",
      description: ticket.description ?? "",
      locationText: ticket.locationText ?? "",
      priority: ticket.priority ?? "MEDIUM",
      ticketType: ticket.type ?? ticket.ticketType ?? "SERVICE_REQUEST"
    });
  }

  useEffect(() => {
    if (ticket) {
      resetDraftFromTicket();
      setAssigneeId(ticket.ownerUserId ?? "");
      if (!canEditTicket) setShowEdit(false);
    }
  }, [ticket, canEditTicket]);

  useEffect(() => {
    if (!ownerDropdownOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!ownerDropdownRef.current?.contains(event.target as Node)) setOwnerDropdownOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOwnerDropdownOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ownerDropdownOpen]);

  const refreshTicket = () => invalidateTicketData(queryClient, tenantId, ticketId);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!canEditTicket) throw new Error("You cannot update this ticket.");
      if (!etag) throw new Error("Missing ETag. Reload this ticket and retry.");
      return updateTicket(ticketId, etag, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        locationText: form.locationText.trim() || undefined,
        priority: canEditPriority ? form.priority : undefined,
        ticketType: canEditType ? form.ticketType : undefined
      });
    },
    onSuccess: () => {
      refreshTicket();
      setShowEdit(false);
    }
  });
  const assignMutation = useMutation({
    mutationFn: () => {
      if (!canManageTicketOwner) throw new Error("You cannot assign this ticket.");
      if (!etag) throw new Error("Missing ETag. Reload this ticket and retry.");
      if (!assigneeId.trim()) throw new Error("Choose an owner first.");
      return assignTicket(ticketId, etag, assigneeId.trim());
    },
    onSuccess: refreshTicket
  });
  const transitionMutation = useMutation({
    mutationFn: (toStatus: TicketStatus) => {
      if (!etag || !ticket?.status) throw new Error("Missing ETag or current status. Reload this ticket and retry.");
      return transitionTicket(ticketId, etag, ticket.status, toStatus);
    },
    onSuccess: refreshTicket
  });

  function onEdit(event: FormEvent) {
    event.preventDefault();
    updateMutation.mutate();
  }

  return (
    <div className="stack ticket-detail-page">
      <section className="ticket-detail-hero">
        <div className="ticket-detail-hero-main">
          <Link className="new-ticket-back" to="/tickets">
            <ArrowLeft size={15} />
            Tickets
          </Link>
          <div>
            <h1>{ticket?.title || "Ticket details"}</h1>
            {ticket && (
              <div className="ticket-detail-badges">
                <span className={`ticket-hero-chip ticket-hero-chip-${slug(ticket.status)}`}><CircleDot size={14} />{titleCase(ticket.status)}</span>
                <span className={`ticket-hero-chip ticket-hero-chip-${slug(ticket.priority)}`}><Tag size={14} />{titleCase(ticket.priority)}</span>
                <span className={`ticket-hero-chip ticket-hero-chip-${slug(ticketType)}`}><Wrench size={14} />{titleCase(ticketType)}</span>
                <span className="ticket-hero-chip ticket-hero-chip-location"><MapPin size={14} />{ticket.locationText || "-"}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {!isTenantSelected && (
        <section className="panel">
          <p className="muted">Select a tenant before loading ticket details.</p>
        </section>
      )}
      <ErrorMessage message={query.error ? getFriendlyError(query.error) : undefined} />
      {query.isLoading && (
        <section className="panel ticket-detail-loading">
          <Loader2 size={18} className="spin-icon" />
          Loading ticket...
        </section>
      )}

      {ticket && detail && (
        <div className="ticket-detail-layout">
          <main className="ticket-detail-main">
            <section className="panel ticket-detail-request-panel">
              <div className="ticket-detail-section-title">
                <span><FileText size={17} /></span>
                <div>
                  <h2>Ticket information</h2>
                  <p>{canEditTicket ? "Review the request details and update them when needed." : "Review the request details."}</p>
                </div>
                {canEditTicket && (
                  <button type="button" className="secondary ticket-section-action" onClick={() => setShowEdit((open) => !open)}>
                    {showEdit ? <X size={15} /> : <Edit3 size={15} />}
                    {showEdit ? "Close" : "Update ticket"}
                  </button>
                )}
              </div>
              {!showEdit && (
                <p className="ticket-detail-description">
                  {ticket.description ? ticket.description : "No description provided."}
                </p>
              )}
              {showEdit && (
                <form className="ticket-detail-inline-form" onSubmit={onEdit}>
                  <label className="ticket-inline-field full">
                    <span>Title</span>
                    <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  </label>
                  <label className="ticket-inline-field">
                    <span>Location</span>
                    <input value={form.locationText} onChange={(e) => setForm({ ...form, locationText: e.target.value })} />
                  </label>
                  {(canEditPriority || canEditType) && (
                    <>
                      {canEditPriority && (
                        <label className="ticket-inline-field">
                          <span>Priority</span>
                          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TicketPriority })}>
                            {priorities.map((item) => <option key={item}>{item}</option>)}
                          </select>
                        </label>
                      )}
                      {canEditType && (
                        <label className="ticket-inline-field">
                          <span>Type</span>
                          <select value={form.ticketType} onChange={(e) => setForm({ ...form, ticketType: e.target.value as TicketType })}>
                            {types.map((item) => <option key={item}>{item}</option>)}
                          </select>
                        </label>
                      )}
                    </>
                  )}
                  <label className="ticket-inline-field full">
                    <span>Description</span>
                    <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </label>
                  <div className="ticket-inline-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        resetDraftFromTicket();
                        setShowEdit(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" disabled={updateMutation.isPending}>
                      {updateMutation.isPending ? <Loader2 size={16} className="spin-icon" /> : <CheckCircle2 size={16} />}
                      Save changes
                    </button>
                  </div>
                </form>
              )}
              <ErrorMessage message={updateMutation.error ? getFriendlyError(updateMutation.error, "This record was modified by someone else. Reload and retry.") : undefined} />
              <div className="ticket-detail-meta-grid">
                <MetaItem icon={UserRound} label="Owner">{ownerContent}</MetaItem>
                <MetaItem icon={UsersRound} label="Requester">{requesterContent}</MetaItem>
                <MetaItem icon={CalendarClock} label="Created">{formatDateTime(ticket.createdAt)}</MetaItem>
                <MetaItem icon={CalendarClock} label="Updated">{formatDateTime(ticket.updatedAt)}</MetaItem>
              </div>
            </section>

            <CommentPanel
              ticketId={ticketId}
              canComment={canAddComment}
              canPostInternal={canPostInternal}
              ownerUserId={ticket.ownerUserId}
              requesterUserId={ticket.requesterUserId}
              linkActors={canManage}
            />
          </main>

          <aside className="ticket-detail-sidebar">
            {showWorkflow && (
              <section className="panel ticket-detail-side-card">
                <div className="ticket-detail-section-title compact">
                  <span><Route size={17} /></span>
                  <div>
                    <h2>Workflow</h2>
                    <p>{ticketStatus === "CLOSED" ? "Reopen this ticket when more work is needed." : "Assign ownership and move the ticket forward."}</p>
                  </div>
                </div>
                {canManageTicketOwner && (
                  <div className="ticket-workflow-block">
                    <div className="ticket-owner-picker" ref={ownerDropdownRef}>
                      <span>Owner</span>
                      <div className={`ticket-dropdown${ownerDropdownOpen ? " open" : ""}`}>
                        <button
                          type="button"
                          className="ticket-dropdown-trigger"
                          aria-haspopup="listbox"
                          aria-expanded={ownerDropdownOpen}
                          onClick={() => setOwnerDropdownOpen((open) => !open)}
                        >
                          <span className="ticket-dropdown-trigger-main">
                            <UserRound size={16} />
                            <span>{selectedOwner ? selectedOwner.displayName || selectedOwner.email : "Choose owner"}</span>
                          </span>
                          <ChevronDown size={16} className="ticket-dropdown-chevron" />
                        </button>
                        {ownerDropdownOpen && (
                          <div className="ticket-dropdown-menu ticket-owner-dropdown-menu" role="listbox" aria-label="Owner">
                            {ownerCandidates.map((member) => {
                              const selected = member.userId === assigneeId;
                              return (
                                <button
                                  key={member.userId}
                                  type="button"
                                  className={`ticket-dropdown-option${selected ? " selected" : ""}`}
                                  role="option"
                                  aria-selected={selected}
                                  onClick={() => {
                                    setAssigneeId(member.userId);
                                    setOwnerDropdownOpen(false);
                                  }}
                                >
                                  <span className="ticket-dropdown-option-copy">
                                    <strong>{member.displayName || member.email}</strong>
                                    <small>{titleCase(member.role)} · {member.email}</small>
                                  </span>
                                  {selected && <Check size={15} />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    <button type="button" onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending || !assigneeId.trim()}>
                      <UserRound size={16} />
                      {ownerActionLabel}
                    </button>
                  </div>
                )}
                {nextStatusOptions.length > 0 && (
                  <div className="ticket-status-actions">
                    {nextStatusOptions.map((status) => {
                      const action = transitionCopy(status);
                      const Icon = action.icon;
                      return (
                        <button
                          key={status}
                          type="button"
                          className="secondary ticket-transition-button"
                          disabled={transitionMutation.isPending}
                          onClick={() => transitionMutation.mutate(status)}
                        >
                          <Icon size={16} />
                          <span>
                            <strong>{action.label}</strong>
                            <small>{action.description}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <ErrorMessage message={assignMutation.error ? getFriendlyError(assignMutation.error, "This record was modified by someone else. Reload and retry.") : undefined} />
                <ErrorMessage message={transitionMutation.error ? getFriendlyError(transitionMutation.error, "This record was modified by someone else. Reload and retry.") : undefined} />
              </section>
            )}

            {canUseAttachments && <AttachmentList ticketId={ticketId} items={detail.attachments?.items} canUpload={canUploadAttachment} />}

            <AppointmentList title="Upcoming appointments" items={detail.upcomingAppointments?.items ?? detail.appointments?.items} linkResources={canManage} />
            <AppointmentList title="Recent past appointments" items={detail.recentPastAppointments?.items} linkResources={canManage} />
            {canCreateAppointment && <CreateAppointmentForm ticketId={ticketId} defaultAddressText={ticket.locationText ?? ""} />}
          </aside>
        </div>
      )}
    </div>
  );
}
