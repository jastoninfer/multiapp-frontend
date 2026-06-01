import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpDown,
  CalendarClock,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Filter,
  Inbox,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Tag,
  Ticket as TicketIcon,
  UserRound,
  UsersRound,
  Wrench,
  type LucideIcon
} from "lucide-react";
import { listTickets } from "../api/tickets";
import { getFriendlyError } from "../api/client";
import { cleanQueryParam } from "../api/params";
import { useAuth } from "../auth/AuthContext";
import { isAgentOrAdmin, isCustomer, isResourceUser } from "../auth/authorization";
import { ErrorMessage } from "../components/ErrorMessage";
import { ForbiddenMessage } from "../components/ForbiddenMessage";
import { DEFAULT_LIST_PAGE_SIZE, ListPagination } from "../components/ListPagination";
import { StatusBadge } from "../components/StatusBadge";
import { useCurrentTenant } from "../hooks/useCurrentTenant";
import { queryKeys } from "../queryKeys";
import { TicketFilters } from "../types";
import { compactId, formatDateTimeWithZone, titleCase, toIsoFromLocal } from "../ui/format";

interface TicketDraft {
  ticketStatus: string;
  ticketPriority: string;
  ticketType: string;
  q: string;
  ownerId: string;
  requesterUserId: string;
  createdFrom: string;
  createdTo: string;
  sort: string;
}

const initialDraft: TicketDraft = {
  ticketStatus: "",
  ticketPriority: "",
  ticketType: "",
  q: "",
  ownerId: "",
  requesterUserId: "",
  createdFrom: "",
  createdTo: "",
  sort: "updatedAt,desc"
};

const statusOptions = [
  { value: "", label: "Any status", detail: "Show every workflow state" },
  { value: "NEW", label: "New", detail: "Recently submitted tickets" },
  { value: "IN_PROGRESS", label: "In progress", detail: "Work already underway" },
  { value: "CLOSED", label: "Closed", detail: "Completed or resolved tickets" },
  { value: "REOPENED", label: "Reopened", detail: "Returned to active work" }
];

const priorityOptions = [
  { value: "", label: "Any priority", detail: "Show every priority level" },
  { value: "LOW", label: "Low", detail: "Lower urgency queue" },
  { value: "MEDIUM", label: "Medium", detail: "Default priority" },
  { value: "HIGH", label: "High", detail: "Needs earlier attention" },
  { value: "URGENT", label: "Urgent", detail: "Highest urgency work" }
];

const typeOptions = [
  { value: "", label: "Any type", detail: "Incident and service requests" },
  { value: "INCIDENT", label: "Incident", detail: "Unexpected issue or interruption" },
  { value: "SERVICE_REQUEST", label: "Service request", detail: "Planned request or service work" }
];

const sortOptions = [
  { value: "updatedAt,desc", label: "Recently updated", detail: "Latest activity first" },
  { value: "createdAt,desc", label: "Newest created", detail: "Newest tickets first" },
  { value: "createdAt,asc", label: "Oldest created", detail: "Oldest tickets first" },
  { value: "priority,desc", label: "Priority high to low", detail: "Urgent work first" },
  { value: "status,asc", label: "Status A-Z", detail: "Group by workflow state" }
];

function toFilters(draft: TicketDraft, page = 0): TicketFilters {
  return {
    ticketStatus: draft.ticketStatus || undefined,
    ticketPriority: draft.ticketPriority || undefined,
    ticketType: draft.ticketType || undefined,
    q: cleanQueryParam(draft.q),
    ownerId: draft.ownerId || undefined,
    requesterUserId: draft.requesterUserId || undefined,
    createdFrom: toIsoFromLocal(draft.createdFrom),
    createdTo: toIsoFromLocal(draft.createdTo),
    sort: draft.sort,
    page,
    size: DEFAULT_LIST_PAGE_SIZE
  };
}

function TypeBadge({ value }: { value?: string | null }) {
  const normalized = value ?? "-";
  const typeClass = normalized.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return <span className={`type-badge type-badge-${typeClass}`}>{titleCase(normalized)}</span>;
}

function TicketCreatedTime({ value }: { value?: string | null }) {
  const formatted = formatDateTimeWithZone(value);
  return (
    <time className="ticket-created-time" dateTime={value ?? undefined}>
      {formatted.date}, {formatted.time}
    </time>
  );
}

function FilterLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="ticket-filter-label">
      <Icon size={14} />
      {children}
    </span>
  );
}

function TicketFilterDropdown({
  label,
  icon: Icon,
  value,
  options,
  onChange
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  options: Array<{ value: string; label: string; detail?: string }>;
  onChange: (value: string) => void;
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
    <div className="ticket-filter-field" ref={dropdownRef}>
      <FilterLabel icon={Icon}>{label}</FilterLabel>
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

function activeFilterCount(filters: TicketFilters) {
  return [
    filters.ticketStatus,
    filters.ticketPriority,
    filters.ticketType,
    filters.q,
    filters.ownerId,
    filters.requesterUserId,
    filters.createdFrom,
    filters.createdTo
  ].filter(Boolean).length;
}

export function TicketsPage() {
  const { isTenantSelected, tenantId } = useAuth();
  const { profile, currentTenant } = useCurrentTenant();
  const authz = { me: profile, tenant: currentTenant };
  const canView = isCustomer(authz) || isResourceUser(authz) || isAgentOrAdmin(authz);
  const staff = isAgentOrAdmin(authz);
  const [searchParams] = useSearchParams();
  const [draft, setDraft] = useState<TicketDraft>({
    ...initialDraft,
    ticketPriority: searchParams.get("ticketPriority") ?? "",
    ticketStatus: searchParams.get("ticketStatus") ?? "",
    q: searchParams.get("q")?.slice(0, 25) ?? "",
    createdFrom: searchParams.get("createdFrom") ?? "",
    createdTo: searchParams.get("createdTo") ?? "",
    sort: searchParams.get("sort") ?? initialDraft.sort
  });
  const [filters, setFilters] = useState<TicketFilters>(() => toFilters(draft));
  const appliedFilterCount = activeFilterCount(filters);
  const queryKey = useMemo(() => queryKeys.tickets(tenantId, filters), [filters, tenantId]);
  const ticketsQuery = useQuery({
    queryKey,
    queryFn: () => listTickets(filters),
    enabled: isTenantSelected && canView
  });

  if (!canView) return <ForbiddenMessage message="Tickets are visible to customers, agents, admins, and platform admins." />;

  function onFilter(event: FormEvent) {
    event.preventDefault();
    setFilters(toFilters(draft, 0));
  }

  function resetFilters() {
    setDraft(initialDraft);
    setFilters(toFilters(initialDraft, 0));
  }

  function onPageChange(page: number) {
    setFilters((current) => ({ ...current, page, size: DEFAULT_LIST_PAGE_SIZE }));
  }

  return (
    <div className="stack tickets-page">
      <section className="panel">
        <div className="section-heading">
          <h1>Tickets</h1>
          <Link className="button-link ticket-create-action" to="/tickets/new"><Plus size={16} />Create Ticket</Link>
        </div>
        <form className="filter-panel ticket-filter-panel" onSubmit={onFilter}>
          <div className="ticket-filter-header">
            <div>
              <h2><SlidersHorizontal size={16} />Filters</h2>
              <p>Refine the queue by title, state, priority, type, owner, and creation window.</p>
            </div>
            <span className="ticket-filter-count">
              <Filter size={14} />
              {appliedFilterCount ? `${appliedFilterCount} active` : "No filters"}
            </span>
          </div>
          <div className="filter-grid">
            <label className="ticket-filter-field ticket-title-query-field">
              <FilterLabel icon={Search}>Title contains</FilterLabel>
              <span className="ticket-filter-control">
                <Search size={16} />
                <input
                  maxLength={25}
                  placeholder="Search ticket title"
                  value={draft.q}
                  onChange={(e) => setDraft({ ...draft, q: e.target.value })}
                />
              </span>
            </label>
            <TicketFilterDropdown
              label="Status"
              icon={CircleDot}
              value={draft.ticketStatus}
              options={statusOptions}
              onChange={(value) => setDraft({ ...draft, ticketStatus: value })}
            />
            <TicketFilterDropdown
              label="Priority"
              icon={Tag}
              value={draft.ticketPriority}
              options={priorityOptions}
              onChange={(value) => setDraft({ ...draft, ticketPriority: value })}
            />
            <TicketFilterDropdown
              label="Type"
              icon={Wrench}
              value={draft.ticketType}
              options={typeOptions}
              onChange={(value) => setDraft({ ...draft, ticketType: value })}
            />
            <TicketFilterDropdown
              label="Sort"
              icon={ArrowUpDown}
              value={draft.sort}
              options={sortOptions}
              onChange={(value) => setDraft({ ...draft, sort: value })}
            />
            {isAgentOrAdmin(authz) && (
              <>
                <label className="ticket-filter-field">
                  <FilterLabel icon={UserRound}>Owner user</FilterLabel>
                  <span className="ticket-filter-control">
                    <UserRound size={16} />
                    <input placeholder="UUID" value={draft.ownerId} onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })} />
                  </span>
                </label>
                <label className="ticket-filter-field">
                  <FilterLabel icon={UsersRound}>Requester user</FilterLabel>
                  <span className="ticket-filter-control">
                    <UsersRound size={16} />
                    <input placeholder="UUID" value={draft.requesterUserId} onChange={(e) => setDraft({ ...draft, requesterUserId: e.target.value })} />
                  </span>
                </label>
              </>
            )}
            <label className="ticket-filter-field">
              <FilterLabel icon={CalendarClock}>Created after</FilterLabel>
              <span className="ticket-filter-control">
                <CalendarClock size={16} />
                <input type="datetime-local" value={draft.createdFrom} onChange={(e) => setDraft({ ...draft, createdFrom: e.target.value })} />
              </span>
            </label>
            <label className="ticket-filter-field">
              <FilterLabel icon={Clock3}>Created before</FilterLabel>
              <span className="ticket-filter-control">
                <Clock3 size={16} />
                <input type="datetime-local" value={draft.createdTo} onChange={(e) => setDraft({ ...draft, createdTo: e.target.value })} />
              </span>
            </label>
          </div>
          <div className="filter-actions ticket-filter-actions">
            <button type="button" className="ticket-reset-button" onClick={resetFilters}><RotateCcw size={15} />Reset</button>
            <button type="submit" className="ticket-apply-button"><Filter size={15} />Apply filters</button>
          </div>
        </form>
        <ErrorMessage message={ticketsQuery.error ? getFriendlyError(ticketsQuery.error) : undefined} />
        {!isTenantSelected ? (
          <div className="empty-state ticket-empty-state">
            <Inbox size={22} />
            <span>Select a tenant before loading tickets.</span>
          </div>
        ) : ticketsQuery.isLoading ? (
          <div className="ticket-loading-state">
            <Loader2 size={18} className="spin-icon" />
            Loading tickets...
          </div>
        ) : (
          <>
            <div className="ticket-results-summary">
              <span><TicketIcon size={15} />{ticketsQuery.data?.total ?? 0} tickets found</span>
              <span><Filter size={14} />{appliedFilterCount ? `${appliedFilterCount} filters applied` : "Showing the default queue"}</span>
            </div>
            {ticketsQuery.data?.items.length ? (
              <>
                <table className="ticket-table">
                  <thead>
                    <tr>
                      <th><span className="ticket-th-label"><TicketIcon size={13} />Ticket</span></th>
                      <th><span className="ticket-th-label"><CircleDot size={13} />Status</span></th>
                      <th><span className="ticket-th-label"><Tag size={13} />Priority</span></th>
                      <th><span className="ticket-th-label"><Wrench size={13} />Type</span></th>
                      <th><span className="ticket-th-label"><UserRound size={13} />Owner</span></th>
                      <th><span className="ticket-th-label"><UsersRound size={13} />Requester</span></th>
                      <th><span className="ticket-th-label"><CalendarClock size={13} />Created</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticketsQuery.data.items.map((ticket) => {
                      const ownerLabel = ticket.ownerName || compactId(ticket.ownerUserId);
                      const requesterLabel = ticket.requesterName || compactId(ticket.requesterUserId || ticket.requesterContactId);
                      const requesterIsContact = Boolean(ticket.requesterContactId && !ticket.requesterUserId);
                      return (
                        <tr key={ticket.id}>
                          <td className="ticket-title-cell">
                            <Link className="ticket-title-link" to={`/tickets/${ticket.id}`} title={ticket.title}>{ticket.title}</Link>
                            <span className="ticket-subline">Created by {ticket.createdByName || "-"}</span>
                          </td>
                          <td><StatusBadge value={ticket.status} /></td>
                          <td><StatusBadge value={ticket.priority} /></td>
                          <td><TypeBadge value={ticket.type || ticket.ticketType} /></td>
                          <td className="ticket-person-cell">
                            {staff && ticket.ownerUserId ? (
                              <Link className="person-inline-link" to={`/members/${ticket.ownerUserId}`}>{ownerLabel}</Link>
                            ) : (
                              ownerLabel
                            )}
                          </td>
                          <td className="ticket-person-cell">
                            {staff && requesterIsContact && ticket.requesterContactId ? (
                              <span className="ticket-requester-combo">
                                <Link className="person-inline-link contact-person-link" to={`/contacts/${ticket.requesterContactId}`}>{requesterLabel}</Link>
                              </span>
                            ) : staff && ticket.requesterUserId ? (
                              <Link className="person-inline-link" to={`/members/${ticket.requesterUserId}`}>{requesterLabel}</Link>
                            ) : requesterIsContact ? (
                              <span className="ticket-requester-combo">
                                <span className="contact-person-name">{requesterLabel}</span>
                              </span>
                            ) : (
                              requesterLabel
                            )}
                          </td>
                          <td><TicketCreatedTime value={ticket.createdAt} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <ListPagination
                  page={filters.page ?? 0}
                  size={filters.size ?? DEFAULT_LIST_PAGE_SIZE}
                  total={ticketsQuery.data.total}
                  isFetching={ticketsQuery.isFetching}
                  onPageChange={onPageChange}
                />
              </>
            ) : (
              <div className="empty-state ticket-empty-state">
                <Inbox size={22} />
                <span>No tickets match the current filters.</span>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
