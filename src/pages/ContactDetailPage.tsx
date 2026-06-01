import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Link2,
  Loader2,
  Mail,
  Pencil,
  Phone,
  RotateCcw,
  UserRound,
  type LucideIcon
} from "lucide-react";
import { getContact, updateContact } from "../api/contacts";
import { getFriendlyError } from "../api/client";
import { isAgentOrAdmin } from "../auth/authorization";
import { ErrorMessage } from "../components/ErrorMessage";
import { ForbiddenMessage } from "../components/ForbiddenMessage";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ToastProvider";
import { useAuth } from "../auth/AuthContext";
import { useCurrentTenant } from "../hooks/useCurrentTenant";
import { queryKeys } from "../queryKeys";
import { compactId } from "../ui/format";

const initialContactForm = { displayName: "", email: "", phone: "", contactType: "PERSON" };
const contactNamePattern = /^[^\p{Cc}\r\n]+$/u;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9]\d{7,14}$/;
const contactNameHelp = "Name is required, up to 20 characters, with no line breaks or control characters.";
const contactReachHelp = "Provide at least one contact method. Email must be valid; phone must use international format, for example +61412345678.";
const typeOptions = [
  { value: "PERSON", label: "Person", detail: "Individual external contact" },
  { value: "ORG", label: "Organisation", detail: "Company, team, or vendor" }
];

function ContactFieldLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="ticket-filter-label">
      <Icon size={14} />
      {children}
    </span>
  );
}

function ContactTypeDropdown({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const selected = typeOptions.find((option) => option.value === value) ?? typeOptions[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="ticket-filter-field contact-dropdown-field" ref={dropdownRef}>
      <ContactFieldLabel icon={Building2}>Type</ContactFieldLabel>
      <div className={`ticket-dropdown${open ? " open" : ""}`}>
        <button type="button" className="ticket-dropdown-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
          <span className="ticket-dropdown-trigger-main">
            <Building2 size={16} />
            <span>{selected.label}</span>
          </span>
          <ChevronDown size={16} className="ticket-dropdown-chevron" />
        </button>
        {open && (
          <div className="ticket-dropdown-menu" role="listbox" aria-label="Contact type">
            {typeOptions.map((option) => {
              const selectedOption = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`ticket-dropdown-option${selectedOption ? " selected" : ""}`}
                  role="option"
                  aria-selected={selectedOption}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="ticket-dropdown-option-copy">
                    <strong>{option.label}</strong>
                    <small>{option.detail}</small>
                  </span>
                  {selectedOption && <Check size={15} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function cleanOptional(value: string) {
  return value.trim() || undefined;
}

function validateContactForm(form: typeof initialContactForm) {
  const name = form.displayName.trim();
  const email = form.email.trim();
  const phone = form.phone.trim();
  if (!name) return "Name is required.";
  if (name.length > 20) return "Name must be 20 characters or fewer.";
  if (!contactNamePattern.test(name)) return contactNameHelp;
  if (!email && !phone) return "Provide at least an email or a phone number.";
  if (email && !emailPattern.test(email)) return "Enter a valid email address.";
  if (phone && !phonePattern.test(phone)) return "Phone must use international E.164 format, for example +61412345678.";
  return "";
}

export function ContactDetailPage() {
  const { contactId = "" } = useParams();
  const { tenantId } = useAuth();
  const { profile, currentTenant } = useCurrentTenant();
  const authz = { me: profile, tenant: currentTenant };
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [form, setForm] = useState(initialContactForm);
  const [editing, setEditing] = useState(false);
  const [copiedContactId, setCopiedContactId] = useState(false);
  const query = useQuery({
    queryKey: queryKeys.contact(tenantId, contactId),
    queryFn: () => getContact(contactId),
    enabled: Boolean(contactId && isAgentOrAdmin(authz))
  });
  const contact = query.data?.data;
  const etag = query.data?.etag ?? (contact?.version !== undefined ? `"${contact.version}"` : undefined);

  useEffect(() => {
    if (contact) {
      setForm({
        displayName: contact.displayName,
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        contactType: contact.contactType
      });
    }
  }, [contact]);

  const mutation = useMutation({
    mutationFn: (payload: typeof initialContactForm) => {
      if (!etag) throw new Error("Missing ETag. Refresh and retry.");
      return updateContact(contactId, etag, {
        displayName: payload.displayName.trim(),
        email: cleanOptional(payload.email),
        phone: cleanOptional(payload.phone),
        contactType: payload.contactType
      });
    },
    onSuccess: async () => {
      notify("Contact updated.");
      setEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.contact(tenantId, contactId) }),
        queryClient.invalidateQueries({ queryKey: ["contacts", tenantId] })
      ]);
    }
  });

  if (!isAgentOrAdmin(authz)) return <ForbiddenMessage message="Contact details are visible to agents and admins." />;

  function openEditor() {
    if (contact) {
      setForm({
        displayName: contact.displayName,
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        contactType: contact.contactType
      });
    }
    setEditing(true);
  }

  function closeEditor() {
    if (contact) {
      setForm({
        displayName: contact.displayName,
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        contactType: contact.contactType
      });
    }
    setEditing(false);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const validationError = validateContactForm(form);
    if (validationError) {
      notify(validationError);
      return;
    }
    mutation.mutate(form);
  }

  async function copyContactId() {
    if (!contact?.contactId) return;
    try {
      await navigator.clipboard.writeText(contact.contactId);
      setCopiedContactId(true);
      notify("Contact ID copied.");
      window.setTimeout(() => setCopiedContactId(false), 1400);
    } catch {
      notify("Could not copy Contact ID.");
    }
  }

  return (
    <div className="stack contact-detail-page">
      <section className="dashboard-hero ticket-detail-hero member-detail-hero">
        <div>
          <Link className="chart-link member-back-link" to="/contacts">
            <ArrowLeft size={14} />
            Contacts
          </Link>
          <h1>{contact?.displayName || "Contact detail"}</h1>
          <p className="muted">{contact?.email || contact?.phone || "External contact details."}</p>
        </div>
        {contact && (
          <div className="ticket-detail-badges">
            <span className="ticket-hero-chip"><Building2 size={14} />{contact.contactType}</span>
            <span className="ticket-hero-chip"><Link2 size={14} />{contact.linkedUserId ? "LINKED" : "NOT LINKED"}</span>
          </div>
        )}
      </section>

      <ErrorMessage message={query.error ? getFriendlyError(query.error) : undefined} />
      {query.isLoading ? (
        <div className="ticket-loading-state">
          <Loader2 size={18} className="spin-icon" />
          Loading contact...
        </div>
      ) : contact && (
        <div className="ticket-detail-layout contact-detail-layout">
          <main className="ticket-detail-main">
            {editing ? (
              <section className="filter-panel ticket-filter-panel contact-panel">
                <form onSubmit={onSubmit}>
                  <div className="ticket-filter-header">
                    <div>
                      <h2><Pencil size={16} />Edit contact</h2>
                      <p>Update the display details and contact methods for this record.</p>
                    </div>
                  </div>
                  <div className="contact-form-grid">
                    <label className="ticket-filter-field contact-name-field">
                      <ContactFieldLabel icon={UserRound}>Name</ContactFieldLabel>
                      <span className="ticket-filter-control">
                        <UserRound size={16} />
                        <input required maxLength={20} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
                      </span>
                      <small className="contact-field-help">{contactNameHelp}</small>
                    </label>
                    <ContactTypeDropdown value={form.contactType} onChange={(contactType) => setForm({ ...form, contactType })} />
                    <label className="ticket-filter-field">
                      <ContactFieldLabel icon={Mail}>Email</ContactFieldLabel>
                      <span className="ticket-filter-control">
                        <Mail size={16} />
                        <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                      </span>
                    </label>
                    <label className="ticket-filter-field">
                      <ContactFieldLabel icon={Phone}>Phone</ContactFieldLabel>
                      <span className="ticket-filter-control">
                        <Phone size={16} />
                        <input placeholder="+61412345678" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                      </span>
                      <small className="contact-field-help">{contactReachHelp}</small>
                    </label>
                  </div>
                  <div className="filter-actions ticket-filter-actions">
                    <button type="button" className="ticket-reset-button" onClick={closeEditor}>
                      <RotateCcw size={15} />
                      Cancel
                    </button>
                    <button type="submit" className="ticket-apply-button" disabled={mutation.isPending}>
                      {mutation.isPending ? <Loader2 size={15} className="spin-icon" /> : <CheckCircle2 size={15} />}
                      Save
                    </button>
                  </div>
                </form>
                <ErrorMessage message={mutation.error ? getFriendlyError(mutation.error, "This record was modified by someone else. Refresh and retry.") : undefined} />
              </section>
            ) : (
              <section className="panel">
                <div className="ticket-detail-section-title compact">
                  <span><UserRound size={17} /></span>
                  <div>
                    <h2>Contact details</h2>
                    <p>Core contact information used by the support team.</p>
                  </div>
                </div>
                <div className="member-detail-grid">
                  <div className="member-detail-item">
                    <small>Name</small>
                    <strong>{contact.displayName}</strong>
                  </div>
                  <div className="member-detail-item">
                    <small>Contact ID</small>
                    <span className="member-id-row">
                      <strong title={contact.contactId}>{compactId(contact.contactId)}</strong>
                      <button type="button" className="secondary member-copy-id-button" onClick={copyContactId}>
                        {copiedContactId ? <Check size={13} /> : <Copy size={13} />}
                        {copiedContactId ? "Copied" : "Copy"}
                      </button>
                    </span>
                  </div>
                  <div className="member-detail-item contact-type-detail-item">
                    <small>Type</small>
                    <StatusBadge value={contact.contactType} />
                  </div>
                  <div className="member-detail-item">
                    <small>Email</small>
                    <strong>{contact.email || "-"}</strong>
                  </div>
                  <div className="member-detail-item">
                    <small>Phone</small>
                    <strong>{contact.phone || "-"}</strong>
                  </div>
                </div>
              </section>
            )}
          </main>

          <aside className="ticket-detail-sidebar">
            <section className="panel ticket-detail-side-card">
              <div className="ticket-detail-section-title compact">
                <span><Link2 size={17} /></span>
                <div>
                  <h2>Linked user</h2>
                  <p>{contact.linkedUserId ? "This contact is connected to a user profile." : "This contact is not linked to a user yet."}</p>
                </div>
              </div>
              <div className="member-status-stack">
                <span><small>State</small><StatusBadge value={contact.linkedUserId ? "LINKED" : "NOT_LINKED"} /></span>
                {contact.linkedUserId ? (
                  <Link className="contact-linked-user-link" to={`/members/${contact.linkedUserId}`}>
                    {contact.linkedUserName || "Linked user"}
                  </Link>
                ) : (
                  <p className="member-self-protection-note">No user profile is connected to this contact.</p>
                )}
              </div>
            </section>

            <section className="panel ticket-detail-side-card">
              <div className="ticket-detail-section-title compact">
                <span><Pencil size={17} /></span>
                <div>
                  <h2>Contact information</h2>
                  <p>Change the saved details for this contact.</p>
                </div>
              </div>
              {!editing && (
                <button type="button" className="secondary ticket-transition-button" onClick={openEditor}>
                  <Pencil size={16} />
                  <span>
                    <strong>Edit contact</strong>
                    <small>Update name, type, email, or phone.</small>
                  </span>
                </button>
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
