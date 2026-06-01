import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Building2,
  Check,
  ChevronDown,
  Filter,
  Link2,
  Mail,
  Phone,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserRound,
  type LucideIcon
} from "lucide-react";
import { createContact, issueClaimCode, listContacts } from "../api/contacts";
import { getFriendlyError } from "../api/client";
import { isAgentOrAdmin } from "../auth/authorization";
import { ErrorMessage } from "../components/ErrorMessage";
import { ForbiddenMessage } from "../components/ForbiddenMessage";
import { DEFAULT_LIST_PAGE_SIZE, ListPagination } from "../components/ListPagination";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ToastProvider";
import { useAuth } from "../auth/AuthContext";
import { useCurrentTenant } from "../hooks/useCurrentTenant";
import { queryKeys } from "../queryKeys";

const CONTACT_PAGE_SIZE = DEFAULT_LIST_PAGE_SIZE;
const initialFilters = { displayName: "", email: "", phone: "", linked: "" };
const initialContactForm = { displayName: "", email: "", phone: "", contactType: "PERSON" };
const contactNamePattern = /^[^\p{Cc}\r\n]+$/u;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9]\d{7,14}$/;
const contactNameHelp = "Name is required, up to 20 characters, with no line breaks or control characters.";
const contactReachHelp = "Provide at least one contact method. Email must be valid; phone must use international format, for example +61412345678.";
const linkedOptions = [
  { value: "", label: "Any linked state", detail: "Show linked and not linked contacts" },
  { value: "true", label: "Linked", detail: "Contacts connected to a user" },
  { value: "false", label: "Not linked", detail: "Contacts without a user account" }
];
const typeOptions = [
  { value: "PERSON", label: "Person", detail: "Individual external contact" },
  { value: "ORG", label: "Organisation", detail: "Company, team, or vendor" }
];
type IssuedClaimCode = { code?: string; expiresAt: string };

function ContactFilterLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="ticket-filter-label">
      <Icon size={14} />
      {children}
    </span>
  );
}

function ContactDropdown({
  label,
  icon: Icon,
  value,
  options,
  onChange,
  hideLabel = false
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  options: Array<{ value: string; label: string; detail?: string }>;
  onChange: (value: string) => void;
  hideLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

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
    <div className={`ticket-filter-field contact-dropdown-field${hideLabel ? " label-hidden" : ""}`} ref={dropdownRef}>
      {!hideLabel && <ContactFilterLabel icon={Icon}>{label}</ContactFilterLabel>}
      <div className={`ticket-dropdown${open ? " open" : ""}`}>
        <button
          type="button"
          className="ticket-dropdown-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="ticket-dropdown-trigger-main">
            <Icon size={16} />
            <span>{selected.label}</span>
          </span>
          <ChevronDown size={16} className="ticket-dropdown-chevron" />
        </button>
        {open && (
          <div className="ticket-dropdown-menu" role="listbox" aria-label={label}>
            {options.map((option) => {
              const selectedOption = option.value === value;
              return (
                <button
                  key={option.value || "any"}
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
                    {option.detail && <small>{option.detail}</small>}
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

function minutesUntil(expiresAt: string | null | undefined, nowMs: number) {
  if (!expiresAt) return 0;
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) return 0;
  return Math.max(1, Math.ceil((expiresMs - nowMs) / 60000));
}

export function ContactsPage() {
  const { tenantId } = useAuth();
  const { profile, currentTenant } = useCurrentTenant();
  const authz = { me: profile, tenant: currentTenant };
  const canManageContacts = isAgentOrAdmin(authz);
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [newContact, setNewContact] = useState(initialContactForm);
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [issuedCodes, setIssuedCodes] = useState<Record<string, IssuedClaimCode>>({});
  const hideCodeTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const contacts = useQuery({
    queryKey: queryKeys.contacts(tenantId, { ...filters, page, size: CONTACT_PAGE_SIZE }),
    queryFn: () => listContacts({ ...filters, linked: filters.linked || undefined, page, size: CONTACT_PAGE_SIZE }),
    enabled: Boolean(tenantId && canManageContacts)
  });
  const create = useMutation({
    mutationFn: (payload: typeof initialContactForm) => createContact({
      displayName: payload.displayName.trim(),
      email: cleanOptional(payload.email),
      phone: cleanOptional(payload.phone),
      contactType: payload.contactType
    }),
    onSuccess: () => {
      notify("Contact created.");
      setNewContact(initialContactForm);
      setShowCreate(false);
      setPage(0);
      queryClient.invalidateQueries({ queryKey: ["contacts", tenantId] });
    }
  });
  const claim = useMutation({
    mutationFn: (contactId: string) => issueClaimCode(contactId, 60),
    onSuccess: (data, contactId) => {
      notify("Claim code issued.");
      setNowMs(Date.now());
      setIssuedCodes((current) => ({
        ...current,
        [contactId]: { code: data.code, expiresAt: data.expiresAt }
      }));
      if (hideCodeTimersRef.current[contactId]) clearTimeout(hideCodeTimersRef.current[contactId]);
      hideCodeTimersRef.current[contactId] = setTimeout(() => {
        setIssuedCodes((current) => {
          const issued = current[contactId];
          if (!issued) return current;
          return { ...current, [contactId]: { expiresAt: issued.expiresAt } };
        });
        setNowMs(Date.now());
        delete hideCodeTimersRef.current[contactId];
      }, 30000);
      queryClient.invalidateQueries({ queryKey: ["contacts", tenantId] });
    }
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => {
      window.clearInterval(intervalId);
      Object.values(hideCodeTimersRef.current).forEach((timerId) => clearTimeout(timerId));
      hideCodeTimersRef.current = {};
    };
  }, []);

  if (!canManageContacts) return <ForbiddenMessage message="Contacts are visible to agents and admins." />;

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const validationError = validateContactForm(newContact);
    if (validationError) {
      notify(validationError);
      return;
    }
    create.mutate(newContact);
  }

  function onFilter(event: FormEvent) {
    event.preventDefault();
    setPage(0);
    setFilters(draftFilters);
  }

  function resetFilters() {
    setDraftFilters(initialFilters);
    setFilters(initialFilters);
    setPage(0);
  }

  function cancelCreate() {
    setNewContact(initialContactForm);
    setShowCreate(false);
  }

  const total = contacts.data?.total ?? 0;
  const appliedFilterCount = Object.values(filters).filter(Boolean).length;

  function renderLinkedOrClaim(contact: NonNullable<typeof contacts.data>["items"][number]) {
    if (contact.linkedUserId) {
      return <Link to={`/members/${contact.linkedUserId}`}>{contact.linkedUserName || "Linked user"}</Link>;
    }
    const issued = issuedCodes[contact.contactId];
    const expiresAt = issued?.expiresAt ?? contact.codeExpiryTime;
    const minutesRemaining = minutesUntil(expiresAt, nowMs);
    const pending = claim.isPending && claim.variables === contact.contactId;
    if (issued?.code && minutesRemaining > 0) {
      return (
        <span className="contact-claim-state">
          <strong className="contact-claim-code">{issued.code}</strong>
          <small>Hidden in 30s. Reissue in {minutesRemaining} min.</small>
        </span>
      );
    }
    if (minutesRemaining > 0) {
      return (
        <span className="contact-claim-state">
          <strong>Code issued</strong>
          <small>Reissue in {minutesRemaining} min.</small>
        </span>
      );
    }
    return (
      <button type="button" className="secondary contact-claim-button" disabled={pending} onClick={() => claim.mutate(contact.contactId)}>
        Issue code
      </button>
    );
  }

  return (
    <div className="stack contacts-page">
      <section className="panel">
        <div className="section-heading">
          <div>
            <h1>Contacts</h1>
            <p className="muted">Manage external people and organisations used in tickets and claims.</p>
          </div>
          {!showCreate && (
            <button type="button" className="secondary" onClick={() => setShowCreate(true)}>
              <Plus size={16} />
              Add contact
            </button>
          )}
        </div>

        {showCreate ? (
          <form className="filter-panel ticket-filter-panel contact-panel" onSubmit={onCreate}>
            <div className="ticket-filter-header">
              <div>
                <h2><Plus size={16} />Add contact</h2>
                <p>Create an external contact with at least one way to reach them.</p>
              </div>
            </div>
            <div className="contact-form-grid">
              <label className="ticket-filter-field contact-name-field">
                <ContactFilterLabel icon={UserRound}>Name</ContactFilterLabel>
                <span className="ticket-filter-control">
                  <UserRound size={16} />
                  <input
                    required
                    maxLength={20}
                    placeholder="Display name"
                    value={newContact.displayName}
                    onChange={(event) => setNewContact({ ...newContact, displayName: event.target.value })}
                  />
                </span>
                <small className="contact-field-help">{contactNameHelp}</small>
              </label>
              <ContactDropdown
                label="Type"
                icon={Building2}
                value={newContact.contactType}
                options={typeOptions}
                onChange={(contactType) => setNewContact({ ...newContact, contactType })}
              />
              <label className="ticket-filter-field">
                <ContactFilterLabel icon={Mail}>Email</ContactFilterLabel>
                <span className="ticket-filter-control">
                  <Mail size={16} />
                  <input
                    type="email"
                    placeholder="name@example.com"
                    value={newContact.email}
                    onChange={(event) => setNewContact({ ...newContact, email: event.target.value })}
                  />
                </span>
              </label>
              <label className="ticket-filter-field">
                <ContactFilterLabel icon={Phone}>Phone</ContactFilterLabel>
                <span className="ticket-filter-control">
                  <Phone size={16} />
                  <input
                    placeholder="+61412345678"
                    value={newContact.phone}
                    onChange={(event) => setNewContact({ ...newContact, phone: event.target.value })}
                  />
                </span>
                <small className="contact-field-help">{contactReachHelp}</small>
              </label>
            </div>
            <div className="filter-actions ticket-filter-actions">
              <button type="button" className="ticket-reset-button" onClick={cancelCreate}>
                <RotateCcw size={15} />
                Cancel
              </button>
              <button type="submit" className="ticket-apply-button" disabled={create.isPending}>
                <Plus size={15} />
                Create
              </button>
            </div>
            <ErrorMessage message={create.error ? getFriendlyError(create.error) : undefined} />
          </form>
        ) : (
          <form className="filter-panel ticket-filter-panel contact-panel" onSubmit={onFilter}>
            <div className="ticket-filter-header">
              <div>
                <h2><SlidersHorizontal size={16} />Filters</h2>
                <p>Find contacts by name, contact method, or linked user state.</p>
              </div>
              <span className="ticket-filter-count">
                <UserRound size={14} />
                {total} contacts
              </span>
            </div>
            <div className="contact-filter-grid">
              <label className="ticket-filter-field">
                <span className="ticket-filter-control">
                  <Search size={16} />
                  <input placeholder="Display name" value={draftFilters.displayName} onChange={(event) => setDraftFilters({ ...draftFilters, displayName: event.target.value })} />
                </span>
              </label>
              <label className="ticket-filter-field">
                <span className="ticket-filter-control">
                  <Mail size={16} />
                  <input placeholder="Email" value={draftFilters.email} onChange={(event) => setDraftFilters({ ...draftFilters, email: event.target.value })} />
                </span>
              </label>
              <label className="ticket-filter-field">
                <span className="ticket-filter-control">
                  <Phone size={16} />
                  <input placeholder="Phone" value={draftFilters.phone} onChange={(event) => setDraftFilters({ ...draftFilters, phone: event.target.value })} />
                </span>
              </label>
              <ContactDropdown
                label="Linked state"
                icon={Link2}
                value={draftFilters.linked}
                options={linkedOptions}
                onChange={(linked) => setDraftFilters({ ...draftFilters, linked })}
                hideLabel
              />
            </div>
            <div className="filter-actions ticket-filter-actions">
              <button type="button" className="ticket-reset-button" onClick={resetFilters}><RotateCcw size={15} />Reset</button>
              <button type="submit" className="ticket-apply-button"><Filter size={15} />Apply filters</button>
            </div>
          </form>
        )}

        <ErrorMessage message={contacts.error ? getFriendlyError(contacts.error) : undefined} />
        <ErrorMessage message={claim.error ? getFriendlyError(claim.error) : undefined} />
        {contacts.isLoading ? (
          <div className="ticket-loading-state">Loading contacts...</div>
        ) : (
          <>
            <div className="ticket-results-summary">
              <span><UserRound size={15} />{total} contacts found</span>
              <span><Filter size={14} />{appliedFilterCount ? `${appliedFilterCount} filters applied` : "Showing all contacts"}</span>
            </div>
            {!contacts.data?.items.length ? (
              <div className="empty-state member-empty-state">
                <UserRound size={22} />
                <span>No contacts match these filters.</span>
              </div>
            ) : (
              <>
                <div className="member-table-wrap">
                  <table className="member-table contact-table">
                    <thead>
                      <tr>
                        <th><span className="ticket-th-label"><UserRound size={13} />Name</span></th>
                        <th><span className="ticket-th-label"><Building2 size={13} />Type</span></th>
                        <th><span className="ticket-th-label"><Mail size={13} />Email</span></th>
                        <th><span className="ticket-th-label"><Phone size={13} />Phone</span></th>
                        <th><span className="ticket-th-label"><Link2 size={13} />Linked user / claim code</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.data.items.map((contact) => (
                        <tr key={contact.contactId}>
                          <td><Link className="member-name-link" to={`/contacts/${contact.contactId}`}>{contact.displayName}</Link></td>
                          <td><StatusBadge value={contact.contactType} /></td>
                          <td className="member-table-muted">{contact.email || "-"}</td>
                          <td className="member-table-muted">{contact.phone || "-"}</td>
                          <td className="member-table-strong contact-link-claim-cell">{renderLinkedOrClaim(contact)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ListPagination
                  page={page}
                  size={CONTACT_PAGE_SIZE}
                  total={total}
                  isFetching={contacts.isFetching}
                  onPageChange={setPage}
                />
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
