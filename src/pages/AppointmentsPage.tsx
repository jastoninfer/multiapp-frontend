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
  MapPin,
  SlidersHorizontal,
  Ticket as TicketIcon,
  UserRound,
  type LucideIcon
} from "lucide-react";
import { AppointmentFilters, listAppointments } from "../api/appointments";
import { getFriendlyError } from "../api/client";
import { isAgentOrAdmin, isResourceUser } from "../auth/authorization";
import { useAuth } from "../auth/AuthContext";
import { ErrorMessage } from "../components/ErrorMessage";
import { ForbiddenMessage } from "../components/ForbiddenMessage";
import { DEFAULT_LIST_PAGE_SIZE, ListPagination } from "../components/ListPagination";
import { StatusBadge } from "../components/StatusBadge";
import { useCurrentTenant } from "../hooks/useCurrentTenant";
import { queryKeys } from "../queryKeys";
import { compactId, formatDateTime, toIsoFromLocal } from "../ui/format";

interface AppointmentDraft {
  from: string;
  to: string;
  status: string;
  sort: string;
}

const initialDraft: AppointmentDraft = { from: "", to: "", status: "", sort: "startAt,desc" };

const statusOptions = [
  { value: "", label: "Any status", detail: "Show every appointment state" },
  { value: "BOOKED", label: "Booked", detail: "Confirmed upcoming work" },
  { value: "RESCHEDULED", label: "Rescheduled", detail: "Moved to a new time" },
  { value: "COMPLETED", label: "Completed", detail: "Finished appointments" },
  { value: "CANCELLED", label: "Cancelled", detail: "Appointments that will not happen" }
];

const sortOptions = [
  { value: "startAt,desc", label: "Latest start", detail: "Most recent start time first" },
  { value: "startAt,asc", label: "Earliest start", detail: "Soonest start time first" },
  { value: "endAt,asc", label: "Earliest end", detail: "Appointments ending soonest first" },
  { value: "status,asc", label: "Status A-Z", detail: "Group by appointment state" },
  { value: "resourceUserId,asc", label: "Resource user ID", detail: "Group by assigned resource" },
  { value: "id.id,asc", label: "Appointment ID", detail: "Stable appointment order" }
];

function formatAppointmentWindow(startAt?: string | null, endAt?: string | null) {
  if (!startAt || !endAt) return formatDateTime(startAt || endAt);
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${formatDateTime(startAt)} - ${formatDateTime(endAt)}`;
  }
  const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit" });
  const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
  const startDate = dateFormatter.format(start);
  const endDate = dateFormatter.format(end);
  const startTime = timeFormatter.format(start);
  const endTime = timeFormatter.format(end);
  return startDate === endDate
    ? `${startDate}, ${startTime} - ${endTime}`
    : `${startDate}, ${startTime} - ${endDate}, ${endTime}`;
}

function toFilters(draft: AppointmentDraft, resourceUserId?: string, page = 0): AppointmentFilters {
  return {
    resourceUserId: resourceUserId || undefined,
    from: toIsoFromLocal(draft.from),
    to: toIsoFromLocal(draft.to),
    status: draft.status || undefined,
    sort: draft.sort,
    page,
    size: DEFAULT_LIST_PAGE_SIZE
  };
}

function activeFilterCount(filters: AppointmentFilters) {
  return [filters.from, filters.to, filters.status].filter(Boolean).length;
}

function FilterLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="ticket-filter-label">
      <Icon size={14} />
      {children}
    </span>
  );
}

function AppointmentFilterDropdown({
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

export function AppointmentsPage() {
  const { tenantId } = useAuth();
  const { profile, currentTenant } = useCurrentTenant();
  const authz = useMemo(() => ({ me: profile, tenant: currentTenant }), [currentTenant, profile]);
  const resourceUser = isResourceUser(authz);
  const staff = isAgentOrAdmin(authz);
  const [searchParams] = useSearchParams();
  const urlSort = searchParams.get("sort") ?? initialDraft.sort;
  const [draft, setDraft] = useState<AppointmentDraft>({
    ...initialDraft,
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
    status: searchParams.get("status") ?? "",
    sort: sortOptions.some((option) => option.value === urlSort) ? urlSort : initialDraft.sort
  });
  const [filters, setFilters] = useState<AppointmentFilters>(() => toFilters(draft, resourceUser ? profile?.userId : undefined));
  const effectiveFilters = useMemo(
    () => ({ ...filters, resourceUserId: resourceUser ? profile?.userId : filters.resourceUserId }),
    [filters, profile?.userId, resourceUser]
  );
  const appliedFilterCount = activeFilterCount(effectiveFilters);
  const query = useQuery({
    queryKey: queryKeys.appointments(tenantId, effectiveFilters),
    queryFn: () => listAppointments(effectiveFilters),
    enabled: Boolean(tenantId && (staff || resourceUser))
  });

  if (!staff && !resourceUser) {
    return <ForbiddenMessage message="Appointments are visible to agents, admins, and resource users." />;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFilters(toFilters(draft, resourceUser ? profile?.userId : undefined, 0));
  }

  function resetFilters() {
    setDraft(initialDraft);
    setFilters(toFilters(initialDraft, resourceUser ? profile?.userId : undefined, 0));
  }

  function onPageChange(page: number) {
    setFilters((current) => ({ ...current, page, size: DEFAULT_LIST_PAGE_SIZE }));
  }

  return (
    <div className="stack appointments-page">
      <section className="panel">
        <div className="section-heading">
          <div>
            <h1>Appointments</h1>
            <p className="muted">Review scheduled work, status, and the source ticket.</p>
          </div>
        </div>
        <form className="filter-panel ticket-filter-panel" onSubmit={onSubmit}>
          <div className="ticket-filter-header">
            <div>
              <h2><SlidersHorizontal size={16} />Filters</h2>
              <p>Refine the schedule by time window and appointment status.</p>
            </div>
            <span className="ticket-filter-count">
              <Filter size={14} />
              {appliedFilterCount ? `${appliedFilterCount} active` : "No filters"}
            </span>
          </div>
          <div className="filter-grid appointment-filter-grid">
            <label className="ticket-filter-field">
              <FilterLabel icon={CalendarClock}>From</FilterLabel>
              <span className="ticket-filter-control">
                <CalendarClock size={16} />
                <input type="datetime-local" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
              </span>
            </label>
            <label className="ticket-filter-field">
              <FilterLabel icon={Clock3}>To</FilterLabel>
              <span className="ticket-filter-control">
                <Clock3 size={16} />
                <input type="datetime-local" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
              </span>
            </label>
            <AppointmentFilterDropdown
              label="Status"
              icon={CircleDot}
              value={draft.status}
              options={statusOptions}
              onChange={(value) => setDraft({ ...draft, status: value })}
            />
            <AppointmentFilterDropdown
              label="Sort"
              icon={ArrowUpDown}
              value={draft.sort}
              options={sortOptions}
              onChange={(value) => setDraft({ ...draft, sort: value })}
            />
          </div>
          <div className="filter-actions ticket-filter-actions">
            <button type="button" className="ticket-reset-button" onClick={resetFilters}>Reset</button>
            <button type="submit" className="ticket-apply-button"><Filter size={15} />Apply filters</button>
          </div>
        </form>
        <ErrorMessage message={query.error ? getFriendlyError(query.error) : undefined} />
        {query.isLoading ? (
          <div className="ticket-loading-state">
            <Loader2 size={18} className="spin-icon" />
            Loading appointments...
          </div>
        ) : (
          <>
            <div className="ticket-results-summary">
              <span><CalendarClock size={15} />{query.data?.total ?? 0} appointments found</span>
              <span><Filter size={14} />{appliedFilterCount ? `${appliedFilterCount} filters applied` : "Showing the default schedule"}</span>
            </div>
            {query.data?.items.length ? (
              <>
                <table className="ticket-table appointment-table">
                  <thead>
                    <tr>
                      <th><span className="ticket-th-label"><CalendarClock size={13} />Appointment</span></th>
                      <th><span className="ticket-th-label"><TicketIcon size={13} />Ticket</span></th>
                      <th><span className="ticket-th-label"><CircleDot size={13} />Status</span></th>
                      <th><span className="ticket-th-label"><UserRound size={13} />Resource</span></th>
                      <th><span className="ticket-th-label"><MapPin size={13} />Address</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.items.map((item) => {
                      const ticketTitle = item.ticketTitle || item.title || "Untitled ticket";
                      const resourceLabel = item.resourceUserName || compactId(item.resourceUserId);
                      return (
                        <tr key={item.id}>
                          <td>
                            <Link className="appointment-time-link" to={`/appointments/${item.id}`} title={formatAppointmentWindow(item.startAt, item.endAt)}>
                              <CalendarClock size={14} />
                              <span>{formatAppointmentWindow(item.startAt, item.endAt)}</span>
                            </Link>
                          </td>
                          <td className="ticket-title-cell">
                            {item.ticketId ? (
                              <Link className="ticket-title-link" to={`/tickets/${item.ticketId}`} title={ticketTitle}>{ticketTitle}</Link>
                            ) : (
                              <span className="ticket-title-link muted">No ticket</span>
                            )}
                          </td>
                          <td><StatusBadge value={item.status} /></td>
                          <td className="ticket-person-cell">
                            {staff ? (
                              <Link className="person-inline-link" to={`/members/${item.resourceUserId}`}>{resourceLabel}</Link>
                            ) : (
                              resourceLabel
                            )}
                          </td>
                          <td className="ticket-person-cell">{item.addressText || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <ListPagination
                  page={filters.page ?? 0}
                  size={filters.size ?? DEFAULT_LIST_PAGE_SIZE}
                  total={query.data.total}
                  isFetching={query.isFetching}
                  onPageChange={onPageChange}
                />
              </>
            ) : (
              <div className="empty-state ticket-empty-state">
                <Inbox size={22} />
                <span>No appointments match the current filters.</span>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
