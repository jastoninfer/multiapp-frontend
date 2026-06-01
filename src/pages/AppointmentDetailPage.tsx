import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  Edit3,
  FileText,
  Loader2,
  MapPin,
  RotateCcw,
  Ticket as TicketIcon,
  UserRound,
  X,
  XCircle
} from "lucide-react";
import { getAppointment, patchAppointment } from "../api/appointments";
import { getFriendlyError } from "../api/client";
import { invalidateAppointmentData, invalidateTicketData } from "../cache/invalidation";
import { ErrorMessage } from "../components/ErrorMessage";
import { useToast } from "../components/ToastProvider";
import { useAuth } from "../auth/AuthContext";
import { isAgentOrAdmin, isResourceUser } from "../auth/authorization";
import { useCurrentTenant } from "../hooks/useCurrentTenant";
import { queryKeys } from "../queryKeys";
import { UpdateAppointmentRequest } from "../types";
import { compactId, formatDateTime, titleCase, toIsoFromLocal } from "../ui/format";

const MAX_RESCHEDULE_MS = 8 * 60 * 60 * 1000;

function isActiveAppointment(status?: string | null) {
  return status === "BOOKED" || status === "RESCHEDULED";
}

function localInputFromIso(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function validateReschedule(startAt: string, endAt: string) {
  if (!startAt || !endAt) return "Choose both start and end time.";
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return "Choose a valid time range.";
  if (end - start > MAX_RESCHEDULE_MS) return "Appointments cannot be longer than 8 hours.";
  return "";
}

function slug(value?: string | null) {
  return (value || "").toLowerCase().replace(/_/g, "-");
}

export function AppointmentDetailPage() {
  const { id } = useParams();
  const appointmentId = id || "";
  const { isTenantSelected, tenantId } = useAuth();
  const { profile, currentTenant } = useCurrentTenant();
  const authz = { me: profile, tenant: currentTenant };
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const query = useQuery({
    queryKey: queryKeys.appointment(tenantId, appointmentId),
    queryFn: () => getAppointment(appointmentId),
    enabled: Boolean(appointmentId && isTenantSelected)
  });

  const [notes, setNotes] = useState("");
  const [addressText, setAddressText] = useState("");
  const [rescheduleStartAt, setRescheduleStartAt] = useState("");
  const [rescheduleEndAt, setRescheduleEndAt] = useState("");
  const [actionError, setActionError] = useState("");
  const [showEditDetails, setShowEditDetails] = useState(false);

  const item = query.data?.data;
  const etag = query.data?.etag;
  const staff = isAgentOrAdmin(authz);
  const assignedResource = isResourceUser(authz) && item?.resourceUserId === profile?.userId;
  const active = isActiveAppointment(item?.status);
  const canEditNotes = Boolean(active && (staff || assignedResource));
  const canEditAddress = Boolean(active && staff);
  const canComplete = Boolean(active && (staff || assignedResource) && item?.arrivedAt);
  const canCancel = Boolean(active && staff);
  const canReschedule = Boolean(active && staff);
  const canMarkArrived = Boolean(active && assignedResource && !item?.arrivedAt);
  const showCompleteAction = Boolean(active && (staff || assignedResource) && (staff || item?.arrivedAt));
  const hasAppointmentActions = Boolean(canMarkArrived || showCompleteAction || canCancel || canReschedule);
  const ticketTitle = item?.ticketTitle || item?.title || "Untitled ticket";
  const resourceLabel = item?.resourceUserName || compactId(item?.resourceUserId);
  const resourceContent = staff && item?.resourceUserId ? (
    <Link className="person-inline-link" to={`/members/${item.resourceUserId}`}>{resourceLabel}</Link>
  ) : resourceLabel;

  useEffect(() => {
    if (item) {
      setNotes(item.notes ?? "");
      setAddressText(item.addressText ?? "");
      setRescheduleStartAt(localInputFromIso(item.startAt));
      setRescheduleEndAt(localInputFromIso(item.endAt));
      setShowEditDetails(false);
    }
  }, [item]);

  const refreshAppointment = async () => {
    await Promise.all([
      invalidateAppointmentData(queryClient, tenantId, appointmentId),
      item?.ticketId ? invalidateTicketData(queryClient, tenantId, item.ticketId) : Promise.resolve()
    ]);
  };

  const mutation = useMutation({
    mutationFn: ({ body }: { body: UpdateAppointmentRequest; message: string }) => {
      if (!etag) throw new Error("Refresh this appointment and try again.");
      return patchAppointment(appointmentId, etag, body);
    },
    onSuccess: async (_, variables) => {
      notify(variables.message);
      setShowEditDetails(false);
      await refreshAppointment();
    }
  });

  function onSaveDetails(event: FormEvent) {
    event.preventDefault();
    setActionError("");
    if (!canEditNotes) {
      setActionError("You cannot update this appointment.");
      return;
    }
    const body: UpdateAppointmentRequest = {
      notes: notes.trim()
    };
    if (canEditAddress) body.addressText = addressText.trim();
    mutation.mutate({
      body,
      message: "Appointment details saved."
    });
  }

  function completeAppointment() {
    if (!canComplete || !item?.arrivedAt) return;
    setActionError("");
    mutation.mutate({
      body: { status: "COMPLETED" },
      message: "Appointment marked completed."
    });
  }

  function markArrived() {
    if (!canMarkArrived) return;
    setActionError("");
    mutation.mutate({
      body: { arrivedAt: new Date().toISOString() },
      message: "Arrival recorded."
    });
  }

  function cancelAppointment() {
    if (!canCancel) return;
    setActionError("");
    mutation.mutate({
      body: { status: "CANCELLED" },
      message: "Appointment cancelled."
    });
  }

  function rescheduleAppointment(event: FormEvent) {
    event.preventDefault();
    if (!canReschedule) return;
    setActionError("");
    const validationMessage = validateReschedule(rescheduleStartAt, rescheduleEndAt);
    if (validationMessage) {
      setActionError(validationMessage);
      return;
    }
    mutation.mutate({
      body: {
        status: "RESCHEDULED",
        startAt: toIsoFromLocal(rescheduleStartAt),
        endAt: toIsoFromLocal(rescheduleEndAt)
      },
      message: "Appointment rescheduled."
    });
  }

  return (
    <div className="stack appointment-detail-page">
      <section className="ticket-detail-hero">
        <div className="ticket-detail-hero-main">
          <Link className="new-ticket-back" to="/appointments">
            <ArrowLeft size={15} />
            Appointments
          </Link>
          <div>
            <h1>Appointment details</h1>
            {item && (
              <div className="ticket-detail-badges">
                <span className="ticket-hero-chip"><CalendarClock size={14} />{formatDateTime(item.startAt)}</span>
                <span className={`ticket-hero-chip ticket-hero-chip-${slug(item.status)}`}><CircleDot size={14} />{titleCase(item.status)}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {!isTenantSelected && (
        <section className="panel">
          <p className="muted">Select a tenant before loading appointment details.</p>
        </section>
      )}
      <ErrorMessage message={query.error ? getFriendlyError(query.error) : undefined} />
      {query.isLoading && (
        <section className="panel ticket-detail-loading">
          <Loader2 size={18} className="spin-icon" />
          Loading appointment...
        </section>
      )}

      {item && (
        <div className="ticket-detail-layout">
          <main className="ticket-detail-main">
            <section className="panel ticket-detail-request-panel">
              <div className="ticket-detail-section-title">
                <span><CalendarClock size={17} /></span>
                <div>
                  <h2>Appointment information</h2>
                  <p>Timing, location, and field arrival for this visit.</p>
                </div>
              </div>
              <div className="appointment-info-list primary">
                <div className="appointment-info-item">
                  <CalendarClock size={16} />
                  <span><small>Start</small><strong>{formatDateTime(item.startAt)}</strong></span>
                </div>
                <div className="appointment-info-item">
                  <Clock3 size={16} />
                  <span><small>End</small><strong>{formatDateTime(item.endAt)}</strong></span>
                </div>
                <div className="appointment-info-item">
                  <UserRound size={16} />
                  <span><small>Resource</small><strong>{resourceContent}</strong></span>
                </div>
                <div className="appointment-info-item">
                  <CheckCircle2 size={16} />
                  <span><small>Arrived</small><strong>{item.arrivedAt ? formatDateTime(item.arrivedAt) : "Not recorded"}</strong></span>
                </div>
                <div className="appointment-info-item address">
                  <MapPin size={16} />
                  <span><small>Address</small><strong>{item.addressText || "No address recorded"}</strong></span>
                </div>
              </div>
            </section>

            <section className="panel ticket-detail-request-panel">
              <div className="ticket-detail-section-title">
                <span><FileText size={17} /></span>
                <div>
                  <h2>Appointment notes</h2>
                  <p>{canEditNotes ? "Review notes, then update them when field details change." : "Review field notes."}</p>
                </div>
                {canEditNotes && (
                  <button
                    type="button"
                    className="secondary ticket-section-action"
                    onClick={() => setShowEditDetails((open) => !open)}
                  >
                    {showEditDetails ? <X size={15} /> : <Edit3 size={15} />}
                    {showEditDetails ? "Close" : "Update notes"}
                  </button>
                )}
              </div>
              {!showEditDetails && (
                <p className="ticket-detail-description appointment-notes-text">{item.notes || "No appointment notes recorded."}</p>
              )}
              {showEditDetails && (
                <form className="ticket-detail-inline-form" onSubmit={onSaveDetails}>
                  {canEditAddress && (
                    <label className="ticket-inline-field full">
                      <span>Address</span>
                      <input value={addressText} onChange={(event) => setAddressText(event.target.value)} />
                    </label>
                  )}
                  <label className="ticket-inline-field full">
                    <span>Notes</span>
                    <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
                  </label>
                  <div className="ticket-inline-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setNotes(item.notes ?? "");
                        setAddressText(item.addressText ?? "");
                        setShowEditDetails(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" disabled={mutation.isPending}>
                      {mutation.isPending ? <Loader2 size={16} className="spin-icon" /> : <CheckCircle2 size={16} />}
                      Save details
                    </button>
                  </div>
                </form>
              )}
            </section>
          </main>

          <aside className="ticket-detail-sidebar">
            <section className="panel ticket-detail-side-card">
              <div className="ticket-detail-section-title compact">
                <span><TicketIcon size={17} /></span>
                <div>
                  <h2>Source ticket</h2>
                  <p>Related request context and history.</p>
                </div>
              </div>
              <div className="source-ticket-card">
                <p className="source-ticket-title">{ticketTitle}</p>
                {item.ticketId && (
                  <Link className="button-link source-ticket-action" to={`/tickets/${item.ticketId}`}>
                    View details
                    <ArrowRight size={14} />
                  </Link>
                )}
              </div>
            </section>

            {hasAppointmentActions && (
              <section className="panel ticket-detail-side-card">
                <div className="ticket-detail-section-title compact">
                  <span><CheckCircle2 size={17} /></span>
                  <div>
                    <h2>Appointment actions</h2>
                    <p>Move this appointment through the allowed workflow.</p>
                  </div>
                </div>
                <div className="ticket-status-actions">
                  {canMarkArrived && (
                    <button
                      type="button"
                      className="secondary ticket-transition-button"
                      disabled={mutation.isPending}
                      onClick={markArrived}
                    >
                      <MapPin size={16} />
                      <span>
                        <strong>Mark arrived</strong>
                        <small>Record that you have arrived onsite.</small>
                      </span>
                    </button>
                  )}
                  {showCompleteAction && (
                    <button
                      type="button"
                      className="secondary ticket-transition-button"
                      disabled={!canComplete || mutation.isPending}
                      onClick={completeAppointment}
                    >
                      <CheckCircle2 size={16} />
                      <span>
                        <strong>Mark completed</strong>
                        <small>{item.arrivedAt ? "Complete this onsite appointment." : "Requires an arrival time first."}</small>
                      </span>
                    </button>
                  )}
                  {canCancel && (
                    <button
                      type="button"
                      className="secondary ticket-transition-button"
                      disabled={mutation.isPending}
                      onClick={cancelAppointment}
                    >
                      <XCircle size={16} />
                      <span>
                        <strong>Cancel appointment</strong>
                        <small>Cancel this booked or rescheduled visit.</small>
                      </span>
                    </button>
                  )}
                </div>
                {canReschedule && (
                  <form className="appointment-reschedule-form" onSubmit={rescheduleAppointment}>
                    <label>
                      <span>New start</span>
                      <input type="datetime-local" value={rescheduleStartAt} onChange={(event) => setRescheduleStartAt(event.target.value)} />
                    </label>
                    <label>
                      <span>New end</span>
                      <input type="datetime-local" value={rescheduleEndAt} onChange={(event) => setRescheduleEndAt(event.target.value)} />
                    </label>
                    <button type="submit" className="secondary" disabled={mutation.isPending}>
                      <RotateCcw size={16} />
                      Reschedule
                    </button>
                    <small>Maximum appointment length is 8 hours.</small>
                  </form>
                )}
              </section>
            )}
          </aside>
        </div>
      )}

      <ErrorMessage message={actionError || (mutation.error ? getFriendlyError(mutation.error, "This appointment changed. Refresh and try again.") : undefined)} />
    </div>
  );
}
