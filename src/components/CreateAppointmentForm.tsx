import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Loader2, X } from "lucide-react";
import { createAppointment } from "../api/appointments";
import { getFriendlyError } from "../api/client";
import { UUID } from "../types";
import { ErrorMessage } from "./ErrorMessage";
import { useAuth } from "../auth/AuthContext";
import { invalidateAppointmentData, invalidateTicketData } from "../cache/invalidation";
import { useToast } from "./ToastProvider";

interface FormState {
  resourceUserId: string;
  customerUserId: string;
  customerContactId: string;
  startAt: string;
  endAt: string;
  addressText: string;
  notes: string;
}

function initialState(defaultAddressText = ""): FormState {
  return {
  resourceUserId: "",
  customerUserId: "",
  customerContactId: "",
  startAt: "",
  endAt: "",
  addressText: defaultAddressText,
  notes: ""
};
}

function toOffsetDateTime(value: string) {
  return value ? new Date(value).toISOString() : "";
}

export function CreateAppointmentForm({ ticketId, defaultAddressText = "" }: { ticketId: UUID; defaultAddressText?: string }) {
  const [form, setForm] = useState(() => initialState(defaultAddressText));
  const [showForm, setShowForm] = useState(false);
  const { tenantId } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      createAppointment(ticketId, {
        resourceUserId: form.resourceUserId.trim(),
        customerUserId: form.customerUserId.trim() || null,
        customerContactId: form.customerContactId.trim() || null,
        startAt: toOffsetDateTime(form.startAt),
        endAt: toOffsetDateTime(form.endAt),
        addressText: form.addressText.trim() || undefined,
        notes: form.notes.trim() || undefined
      }),
    onSuccess: async ({ data }) => {
      notify("Appointment created.");
      setForm(initialState(defaultAddressText));
      setShowForm(false);
      await Promise.all([
        invalidateTicketData(queryClient, tenantId, ticketId),
        invalidateAppointmentData(queryClient, tenantId, data.appointmentId)
      ]);
    }
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <section className="panel ticket-detail-module">
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
          <label>
            Resource User ID
            <input required value={form.resourceUserId} onChange={(e) => update("resourceUserId", e.target.value)} />
          </label>
          <label>
            Customer User ID
            <input value={form.customerUserId} onChange={(e) => update("customerUserId", e.target.value)} />
          </label>
          <label>
            Customer Contact ID
            <input value={form.customerContactId} onChange={(e) => update("customerContactId", e.target.value)} />
          </label>
          <label>
            Start
            <input required type="datetime-local" value={form.startAt} onChange={(e) => update("startAt", e.target.value)} />
          </label>
          <label>
            End
            <input required type="datetime-local" value={form.endAt} onChange={(e) => update("endAt", e.target.value)} />
          </label>
          <label>
            Address
            <input value={form.addressText} onChange={(e) => update("addressText", e.target.value)} />
          </label>
          <label className="full">
            Notes
            <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} />
          </label>
          <button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 size={16} className="spin-icon" /> : <CalendarPlus size={16} />}
            Create appointment
          </button>
        </form>
      )}
      <ErrorMessage message={mutation.error ? getFriendlyError(mutation.error, "Time conflict or outside working hours.") : undefined} />
    </section>
  );
}
