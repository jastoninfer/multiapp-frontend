import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FileText,
  Info,
  Loader2,
  MapPin,
  Send,
  User,
  Users,
  Wrench
} from "lucide-react";
import { createTicket } from "../api/tickets";
import { getFriendlyError } from "../api/client";
import { isAgentOrAdmin, isCustomer, isResourceUser } from "../auth/authorization";
import { ErrorMessage } from "../components/ErrorMessage";
import { ForbiddenMessage } from "../components/ForbiddenMessage";
import { useCurrentTenant } from "../hooks/useCurrentTenant";
import { invalidateTicketData } from "../cache/invalidation";
import { CreateTicketRequest, TicketType } from "../types";

const ticketTypes: Array<{
  value: TicketType;
  label: string;
  description: string;
  icon: typeof Wrench;
}> = [
  {
    value: "SERVICE_REQUEST",
    label: "Service request",
    description: "Planned help, setup, maintenance, or a standard customer request.",
    icon: Wrench
  },
  {
    value: "INCIDENT",
    label: "Incident",
    description: "Unexpected interruption, failure, or issue that needs operational attention.",
    icon: ClipboardList
  }
];

export function NewTicketPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, currentTenant } = useCurrentTenant();
  const me = profile;
  const authz = { me, tenant: currentTenant };
  const staff = isAgentOrAdmin(authz);
  const customer = isCustomer(authz);
  const canCreate = staff || isCustomer(authz) || isResourceUser(authz);
  const [requesterMode, setRequesterMode] = useState<"self" | "user" | "contact">("self");
  const [form, setForm] = useState<CreateTicketRequest>({
    title: "",
    description: "",
    ticketType: "SERVICE_REQUEST",
    locationText: "",
    requesterUserId: me?.userId ?? null,
    requesterContactId: null
  });

  const titleLength = form.title.trim().length;
  const descriptionLength = form.description?.length ?? 0;
  const locationLength = form.locationText?.trim().length ?? 0;
  const selectedTicketType = ticketTypes.find((item) => item.value === form.ticketType) ?? ticketTypes[0];
  const selfRequesterUnavailable = requesterMode === "self" && !me?.userId;

  const mutation = useMutation({
    mutationFn: () => {
      const body: CreateTicketRequest = {
        title: form.title.trim(),
        description: form.description?.trim() || undefined,
        ticketType: form.ticketType,
        locationText: form.locationText?.trim() || undefined
      };

      if (!staff || requesterMode === "self") body.requesterUserId = me?.userId ?? null;
      if (staff && requesterMode === "user") body.requesterUserId = form.requesterUserId?.trim() || null;
      if (staff && requesterMode === "contact") body.requesterContactId = form.requesterContactId?.trim() || null;
      return createTicket(body);
    },
    onSuccess: async ({ data }) => {
      await invalidateTicketData(queryClient, currentTenant?.tenantId ?? "", data.id);
      navigate(`/tickets/${data.id}`);
    }
  });

  if (!canCreate) return <ForbiddenMessage message="Only customers, resource users, agents, and admins can create tickets." />;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  function onRequesterModeChange(nextMode: typeof requesterMode) {
    setRequesterMode(nextMode);
    if (nextMode === "self") {
      setForm({ ...form, requesterUserId: me?.userId ?? null, requesterContactId: null });
    }
    if (nextMode === "user") {
      setForm({ ...form, requesterUserId: "", requesterContactId: null });
    }
    if (nextMode === "contact") {
      setForm({ ...form, requesterUserId: null, requesterContactId: "" });
    }
  }

  return (
    <div className="stack new-ticket-page">
      <section className="new-ticket-hero">
        <div className="new-ticket-hero-main">
          <Link className="new-ticket-back" to="/tickets">
            <ArrowLeft size={15} />
            Tickets
          </Link>
          <div>
            <h1>Create ticket</h1>
            <p className="muted">
              {customer ? "Tell us what you need help with." : "Create a ticket with the key details the team needs."}
            </p>
          </div>
        </div>
        <div className="new-ticket-hero-meta" aria-label="Creation details">
          <span><CheckCircle2 size={15} />Starts at Medium priority</span>
          <span><Info size={15} />Adjustable later</span>
        </div>
      </section>

      <div className="new-ticket-layout">
        <form className="new-ticket-form-panel" onSubmit={onSubmit}>
          {staff && (
            <section className="ticket-form-section">
              <div className="ticket-form-section-heading">
                <span className="ticket-section-icon"><User size={17} /></span>
                <div>
                  <h2>Requester</h2>
                  <p>Choose who this ticket is being created for.</p>
                </div>
              </div>

              <div className="requester-mode-grid" role="radiogroup" aria-label="Requester mode">
                {[
                  { value: "self", label: "Current user", detail: me?.displayName || me?.email || "Signed-in staff", icon: User },
                  { value: "user", label: "Existing user", detail: "Use a known user UUID", icon: Users },
                  { value: "contact", label: "External contact", detail: "Use a contact UUID", icon: ClipboardList }
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      className={`requester-mode-card${requesterMode === item.value ? " selected" : ""}`}
                      aria-pressed={requesterMode === item.value}
                      onClick={() => onRequesterModeChange(item.value as typeof requesterMode)}
                    >
                      <Icon size={18} />
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.detail}</small>
                      </span>
                    </button>
                  );
                })}
              </div>

              {requesterMode === "user" && (
                <label className="ticket-field full">
                  <span>Requester user ID</span>
                  <div className="ticket-input-shell">
                    <User size={16} />
                    <input
                      required
                      placeholder="00000000-0000-0000-0000-000000000000"
                      value={form.requesterUserId ?? ""}
                      onChange={(e) => setForm({ ...form, requesterUserId: e.target.value, requesterContactId: null })}
                    />
                  </div>
                </label>
              )}

              {requesterMode === "contact" && (
                <label className="ticket-field full">
                  <span>Requester contact ID</span>
                  <div className="ticket-input-shell">
                    <ClipboardList size={16} />
                    <input
                      required
                      placeholder="00000000-0000-0000-0000-000000000000"
                      value={form.requesterContactId ?? ""}
                      onChange={(e) => setForm({ ...form, requesterContactId: e.target.value, requesterUserId: null })}
                    />
                  </div>
                </label>
              )}
            </section>
          )}

          <section className="ticket-form-section">
            <div className="ticket-form-section-heading">
              <span className="ticket-section-icon"><FileText size={17} /></span>
              <div>
                <h2>Ticket details</h2>
                <p>Keep the title concise and put operational context in the description.</p>
              </div>
            </div>

            <label className="ticket-field full">
              <span>Title</span>
              <div className="ticket-input-shell">
                <FileText size={16} />
                <input
                  required
                  maxLength={200}
                  placeholder="Short summary of the request"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <small>{titleLength}/200</small>
            </label>

            <div className="ticket-type-grid">
              {ticketTypes.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.value}
                    type="button"
                    className={`ticket-type-card${form.ticketType === item.value ? " selected" : ""}`}
                    aria-pressed={form.ticketType === item.value}
                    onClick={() => setForm({ ...form, ticketType: item.value })}
                  >
                    <Icon size={19} />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                );
              })}
            </div>

            <label className="ticket-field full">
              <span>Location</span>
              <div className="ticket-input-shell">
                <MapPin size={16} />
                <input
                  maxLength={100}
                  placeholder="Site, room, address, or area"
                  value={form.locationText ?? ""}
                  onChange={(e) => setForm({ ...form, locationText: e.target.value })}
                />
              </div>
              <small>{locationLength}/100</small>
            </label>

            <label className="ticket-field full">
              <span>Description</span>
              <div className="ticket-textarea-shell">
                <textarea
                  maxLength={4000}
                  placeholder="What happened, who is affected, what has already been tried, and any useful timing details."
                  value={form.description ?? ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <small>{descriptionLength}/4000</small>
            </label>
          </section>

          <div className="new-ticket-submit-row">
            <ErrorMessage message={mutation.error ? getFriendlyError(mutation.error) : undefined} />
            {selfRequesterUnavailable && <p className="muted new-ticket-inline-note">Loading your requester profile...</p>}
            <div className="new-ticket-actions">
              <Link className="button-link new-ticket-cancel" to="/tickets">Cancel</Link>
              <button className="new-ticket-submit" type="submit" disabled={mutation.isPending || selfRequesterUnavailable}>
                {mutation.isPending ? <Loader2 size={16} className="spin-icon" /> : <Send size={16} />}
                {mutation.isPending ? "Creating..." : "Create ticket"}
              </button>
            </div>
          </div>
        </form>

        <aside className="new-ticket-sidebar" aria-label="Ticket creation summary">
          <section className="new-ticket-summary-panel">
            <div className="ticket-form-section-heading compact">
              <span className="ticket-section-icon"><CheckCircle2 size={17} /></span>
              <div>
                <h2>Review</h2>
                <p>{customer ? "Your ticket will be submitted with these defaults." : "The ticket will be submitted with these defaults."}</p>
              </div>
            </div>
            <dl className="ticket-review-list">
              <div>
                <dt>Workspace</dt>
                <dd>{currentTenant?.name ?? "No tenant selected"}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{selectedTicketType.label}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>Medium</dd>
              </div>
            </dl>
          </section>

          <section className="new-ticket-summary-panel">
            <div className="ticket-sidebar-note">
              <Info size={18} />
              <span>
                <strong>Priority starts at Medium</strong>
                <small>Agents and admins can adjust it later when needed.</small>
              </span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
