import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Check, Clock3, Loader2, Search, UserRound, X } from "lucide-react";
import { createAppointment } from "../api/appointments";
import { getFriendlyError } from "../api/client";
import { listMembers } from "../api/members";
import { cleanQueryParam } from "../api/params";
import { getAvailability } from "../api/resources";
import type { AppointmentSummary, CreateAppointmentRequest, MemberUserInfo, UUID, WorkingHoursRule } from "../types";
import { ErrorMessage } from "./ErrorMessage";
import { useAuth } from "../auth/AuthContext";
import { invalidateAppointmentData, invalidateTicketData } from "../cache/invalidation";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { queryKeys } from "../queryKeys";
import { compactId } from "../ui/format";
import { useToast } from "./ToastProvider";

interface FormState {
  resourceUserId: string;
  startAt: string;
  endAt: string;
  addressText: string;
  notes: string;
}

interface CreateAppointmentFormProps {
  ticketId: UUID;
  defaultAddressText?: string;
  requesterUserId?: UUID | null;
  requesterContactId?: UUID | null;
  requesterName?: string | null;
}

function initialState(defaultAddressText = ""): FormState {
  return {
    resourceUserId: "",
    startAt: "",
    endAt: "",
    addressText: defaultAddressText,
    notes: ""
  };
}

function toOffsetDateTime(value: string) {
  return value ? new Date(value).toISOString() : "";
}

function hasInvalidControlText(value: string, allowLineBreaks = false) {
  return Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    const control = code <= 31 || code === 127;
    if (!control) return false;
    return !(allowLineBreaks && (char === "\r" || char === "\n" || char === "\t"));
  });
}

function resourceLabel(member: MemberUserInfo) {
  return member.displayName || member.email || compactId(member.userId);
}

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayLabel(dayOfWeek: number) {
  return dayNames[dayOfWeek - 1] ?? `Day ${dayOfWeek}`;
}

function localDayOfWeek(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function localDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatLocalTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatShortDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function summarizeWorkingHours(rules: WorkingHoursRule[], startAt: string) {
  const sorted = [...rules].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  const selectedDay = localDayOfWeek(startAt);

  if (selectedDay) {
    const rule = sorted.find((item) => item.dayOfWeek === selectedDay);
    return rule ? `${dayLabel(selectedDay)} ${rule.startLocal}-${rule.endLocal}` : `${dayLabel(selectedDay)} not working`;
  }

  if (!sorted.length) return "No working hours";
  const groups: Array<{ from: number; to: number; start: string; end: string }> = [];
  sorted.forEach((rule) => {
    const last = groups[groups.length - 1];
    if (last && last.to + 1 === rule.dayOfWeek && last.start === rule.startLocal && last.end === rule.endLocal) {
      last.to = rule.dayOfWeek;
      return;
    }
    groups.push({ from: rule.dayOfWeek, to: rule.dayOfWeek, start: rule.startLocal, end: rule.endLocal });
  });
  const labels = groups.map((group) => {
    const dayRange = group.from === group.to ? dayLabel(group.from) : `${dayLabel(group.from)}-${dayLabel(group.to)}`;
    return `${dayRange} ${group.start}-${group.end}`;
  });
  return labels.slice(0, 2).join(", ") + (labels.length > 2 ? ` +${labels.length - 2}` : "");
}

function summarizeBusyAppointments(appointments: AppointmentSummary[], startAt: string) {
  const now = Date.now();
  const activeAppointments = appointments
    .filter((item) => {
      const startsAt = new Date(item.startAt).getTime();
      return item.status !== "CANCELLED" && !Number.isNaN(startsAt) && startsAt > now;
    })
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const selectedDateKey = startAt ? localDateKey(startAt) : "";
  const matchingAppointments = selectedDateKey
    ? activeAppointments.filter((item) => localDateKey(item.startAt) === selectedDateKey)
    : activeAppointments;
  const visible = matchingAppointments.slice(0, 2);

  if (!visible.length) return selectedDateKey ? "No bookings that day" : "No upcoming bookings";
  return visible.map((item) => {
    if (selectedDateKey) return `${formatLocalTime(item.startAt)}-${formatLocalTime(item.endAt)}`;
    return formatShortDateTime(item.startAt);
  }).join(", ") + (matchingAppointments.length > visible.length ? ` +${matchingAppointments.length - visible.length}` : "");
}

function validateAppointmentForm(form: FormState, requesterUserId?: UUID | null, requesterContactId?: UUID | null) {
  const resourceUserId = form.resourceUserId.trim();
  const addressText = form.addressText.trim();
  const notes = form.notes.trim();

  if (!resourceUserId) return "Choose a resource from the list before scheduling.";
  if (Boolean(requesterUserId) === Boolean(requesterContactId)) return "This ticket needs exactly one requester before an appointment can be scheduled.";
  if (!form.startAt || !form.endAt) return "Choose both start and end times.";

  const start = new Date(form.startAt);
  const end = new Date(form.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Choose valid appointment times.";
  if (end <= start) return "End time must be after the start time.";
  if (end.getTime() - start.getTime() > 8 * 60 * 60 * 1000) return "Appointments cannot be longer than 8 hours.";
  if (addressText.length > 100) return "Address must be 100 characters or fewer.";
  if (hasInvalidControlText(addressText)) return "Address cannot contain line breaks or control characters.";
  if (notes.length > 500) return "Notes must be 500 characters or fewer.";
  if (hasInvalidControlText(notes, true)) return "Notes cannot contain unsupported control characters.";

  return "";
}

function buildCreateAppointmentRequest(
  form: FormState,
  requesterUserId?: UUID | null,
  requesterContactId?: UUID | null
): CreateAppointmentRequest {
  return {
    resourceUserId: form.resourceUserId.trim(),
    customerUserId: requesterUserId ?? null,
    customerContactId: requesterContactId ?? null,
    startAt: toOffsetDateTime(form.startAt),
    endAt: toOffsetDateTime(form.endAt),
    addressText: form.addressText.trim() || undefined,
    notes: form.notes.trim() || undefined
  };
}

export function CreateAppointmentForm({
  ticketId,
  defaultAddressText = "",
  requesterUserId,
  requesterContactId,
  requesterName
}: CreateAppointmentFormProps) {
  const [form, setForm] = useState(() => initialState(defaultAddressText));
  const [resourceSearch, setResourceSearch] = useState("");
  const debouncedResourceSearch = useDebouncedValue(resourceSearch, 250);
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const { tenantId } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const resourcePickerRef = useRef<HTMLDivElement | null>(null);
  const resourceFilters = {
    role: "RESOURCE_USER",
    q: cleanQueryParam(debouncedResourceSearch),
    page: 0,
    size: 20
  } as const;
  const resources = useQuery({
    queryKey: queryKeys.members(tenantId, resourceFilters),
    queryFn: () => listMembers(resourceFilters),
    enabled: Boolean(tenantId && showForm && resourcePickerOpen),
    placeholderData: (previousData) => previousData
  });
  const availabilityQuery = useQuery({
    queryKey: queryKeys.resourceAvailability(tenantId, form.resourceUserId, "", ""),
    queryFn: () => getAvailability(form.resourceUserId),
    enabled: Boolean(tenantId && showForm && form.resourceUserId)
  });
  const requesterLabel = requesterName || compactId(requesterUserId || requesterContactId);
  const availability = availabilityQuery.data?.data;

  const mutation = useMutation({
    mutationFn: () =>
      createAppointment(ticketId, buildCreateAppointmentRequest(form, requesterUserId, requesterContactId)),
    onSuccess: async ({ data }) => {
      notify("Appointment created.");
      setForm(initialState(defaultAddressText));
      setResourceSearch("");
      setFormError("");
      setShowForm(false);
      await Promise.all([
        invalidateTicketData(queryClient, tenantId, ticketId),
        invalidateAppointmentData(queryClient, tenantId, data.appointmentId)
      ]);
    }
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFormError("");
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function selectResource(resource: MemberUserInfo) {
    setFormError("");
    setForm((prev) => ({ ...prev, resourceUserId: resource.userId }));
    setResourceSearch(resourceLabel(resource));
    setResourcePickerOpen(false);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const validationMessage = validateAppointmentForm(form, requesterUserId, requesterContactId);
    if (validationMessage) {
      setFormError(validationMessage);
      return;
    }
    mutation.mutate();
  }

  useEffect(() => {
    if (!resourcePickerOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!resourcePickerRef.current?.contains(event.target as Node)) setResourcePickerOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setResourcePickerOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [resourcePickerOpen]);

  return (
    <section className="panel ticket-detail-module ticket-create-appointment-panel">
      <div className="ticket-detail-section-title">
        <span><CalendarPlus size={17} /></span>
        <div>
          <h2>Create appointment</h2>
          <p>Schedule a visit when this ticket needs onsite work.</p>
        </div>
        <button type="button" className="secondary ticket-section-action" onClick={() => setShowForm((open) => !open)}>
          {showForm ? <X size={15} /> : <CalendarPlus size={15} />}
          {showForm ? "Close" : "Schedule"}
        </button>
      </div>
      {showForm && (
        <form className="grid-form ticket-appointment-form" onSubmit={onSubmit}>
          <div className="ticket-appointment-requester">
            <span>Requester</span>
            <strong>{requesterLabel}</strong>
          </div>
          <div className="ticket-resource-picker" ref={resourcePickerRef}>
            <label htmlFor="ticket-resource-user">
              <span>Resource</span>
            </label>
            <div className={`ticket-resource-combobox${resourcePickerOpen ? " open" : ""}`}>
              <Search size={16} />
              <input
                id="ticket-resource-user"
                role="combobox"
                aria-expanded={resourcePickerOpen}
                aria-controls="ticket-resource-options"
                aria-autocomplete="list"
                aria-required="true"
                placeholder="Search by name or email"
                value={resourceSearch}
                onFocus={() => setResourcePickerOpen(true)}
                onChange={(event) => {
                  setResourceSearch(event.target.value);
                  update("resourceUserId", "");
                  setResourcePickerOpen(true);
                }}
              />
            </div>
            {resourcePickerOpen && (
              <div className="ticket-resource-options" id="ticket-resource-options" role="listbox" aria-label="Resource users">
                {resources.isLoading ? (
                  <div className="ticket-resource-option-status">Loading resources...</div>
                ) : resources.data?.items.length ? (
                  resources.data.items.map((resource) => {
                    const selected = resource.userId === form.resourceUserId;
                    return (
                      <button
                        type="button"
                        key={resource.userId}
                        className={`ticket-resource-option${selected ? " selected" : ""}`}
                        role="option"
                        aria-selected={selected}
                        onClick={() => selectResource(resource)}
                      >
                        <UserRound size={15} />
                        <span>
                          <strong>{resourceLabel(resource)}</strong>
                          <small>{resource.status} - {resource.email}</small>
                        </span>
                        {selected && <Check size={15} />}
                      </button>
                    );
                  })
                ) : (
                  <div className="ticket-resource-option-status">No resource users found.</div>
                )}
              </div>
            )}
          </div>
          {form.resourceUserId && (
            <div className="ticket-resource-availability" aria-live="polite">
              <span><Clock3 size={14} />Availability</span>
              {availabilityQuery.isLoading ? (
                <strong>Loading...</strong>
              ) : availabilityQuery.error ? (
                <strong>{getFriendlyError(availabilityQuery.error, "Could not load availability.")}</strong>
              ) : (
                <>
                  <strong>{summarizeWorkingHours(availability?.workingHours ?? [], form.startAt)}</strong>
                  <small>Booked: {summarizeBusyAppointments(availability?.appointments ?? [], form.startAt)}</small>
                </>
              )}
            </div>
          )}
          <label>
            <span>Start</span>
            <input required type="datetime-local" value={form.startAt} onChange={(e) => update("startAt", e.target.value)} />
          </label>
          <label>
            <span>End</span>
            <input required type="datetime-local" value={form.endAt} onChange={(e) => update("endAt", e.target.value)} />
          </label>
          <label>
            <span>Address</span>
            <input maxLength={100} value={form.addressText} onChange={(e) => update("addressText", e.target.value)} />
          </label>
          <label className="full">
            <span>Notes</span>
            <textarea maxLength={500} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
          </label>
          <small className="ticket-appointment-help">Appointment length can be up to 8 hours.</small>
          <button type="submit" className="ticket-apply-button" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 size={16} className="spin-icon" /> : <CalendarPlus size={16} />}
            Create appointment
          </button>
        </form>
      )}
      <ErrorMessage message={formError || (mutation.error ? getFriendlyError(mutation.error, "Time conflict or outside working hours.") : undefined)} />
    </section>
  );
}
