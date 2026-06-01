import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  Check,
  ChevronDown,
  CircleDot,
  Filter,
  Inbox,
  Mail,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserRound,
  Wrench,
  type LucideIcon
} from "lucide-react";
import { listMembers, type MemberFilters } from "../api/members";
import { getFriendlyError } from "../api/client";
import { cleanQueryParam } from "../api/params";
import { isAgentOrAdmin, isResourceUser } from "../auth/authorization";
import { useAuth } from "../auth/AuthContext";
import { ErrorMessage } from "../components/ErrorMessage";
import { ForbiddenMessage } from "../components/ForbiddenMessage";
import { DEFAULT_LIST_PAGE_SIZE, ListPagination } from "../components/ListPagination";
import { StatusBadge } from "../components/StatusBadge";
import { useCurrentTenant } from "../hooks/useCurrentTenant";
import { queryKeys } from "../queryKeys";
import { compactId, formatDate } from "../ui/format";

const statusOptions = [
  { value: "", label: "Any status", detail: "Show every resource status" },
  { value: "ACTIVE", label: "Active", detail: "Available resource accounts" },
  { value: "SUSPENDED", label: "Suspended", detail: "Accounts currently suspended" },
  { value: "DISABLED", label: "Disabled", detail: "Accounts without active access" }
];

function ResourceFilterLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="ticket-filter-label">
      <Icon size={14} />
      {children}
    </span>
  );
}

function ResourceDropdown({
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
    <div className="ticket-filter-field resource-status-filter-field" ref={dropdownRef}>
      <ResourceFilterLabel icon={Icon}>{label}</ResourceFilterLabel>
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

export function ResourcesPage() {
  const { tenantId } = useAuth();
  const { profile, currentTenant } = useCurrentTenant();
  const me = profile;
  const authz = { me, tenant: currentTenant };
  const staff = isAgentOrAdmin(authz);
  const resourceUser = isResourceUser(authz);
  const [draft, setDraft] = useState({ q: "", status: "" });
  const [filters, setFilters] = useState<MemberFilters>({ role: "RESOURCE_USER", q: null, page: 0, size: DEFAULT_LIST_PAGE_SIZE });
  const resources = useQuery({
    queryKey: queryKeys.members(tenantId, filters),
    queryFn: () => listMembers(filters),
    enabled: Boolean(tenantId && staff)
  });
  const appliedFilterCount = [filters.q, filters.status].filter(Boolean).length;

  if (!staff && !resourceUser) {
    return <ForbiddenMessage message="Resource schedule management is visible to agents, admins, and resource users." />;
  }

  if (resourceUser && !staff && me) {
    return (
      <div className="stack resources-page">
        <section className="dashboard-hero resource-self-hero">
          <div className="dashboard-hero-main">
            <div>
              <h1>My resource schedule</h1>
              <p className="muted">Manage your working hours and unavailable time.</p>
            </div>
          </div>
          <Link className="button-link ticket-create-action" to={`/resources/${me.userId}/availability`}>
            <CalendarClock size={16} />
            Open availability
          </Link>
        </section>
      </div>
    );
  }

  function onFilter(event: FormEvent) {
    event.preventDefault();
    setFilters({ role: "RESOURCE_USER", q: cleanQueryParam(draft.q), status: draft.status || undefined, page: 0, size: DEFAULT_LIST_PAGE_SIZE });
  }

  function resetFilters() {
    setDraft({ q: "", status: "" });
    setFilters({ role: "RESOURCE_USER", q: null, page: 0, size: DEFAULT_LIST_PAGE_SIZE });
  }

  function onPageChange(page: number) {
    setFilters((current) => ({ ...current, page, size: DEFAULT_LIST_PAGE_SIZE }));
  }

  return (
    <div className="stack resources-page">
      <section className="panel">
        <div className="section-heading">
          <div>
            <h1>Resources</h1>
            <p className="muted">Review resource users and open their availability schedule.</p>
          </div>
        </div>

        <form className="filter-panel ticket-filter-panel resource-filter-panel" onSubmit={onFilter}>
          <div className="ticket-filter-header">
            <div>
              <h2><SlidersHorizontal size={16} />Filters</h2>
              <p>Find resource users by name, email, or account status.</p>
            </div>
            <span className="ticket-filter-count">
              <Filter size={14} />
              {appliedFilterCount ? `${appliedFilterCount} active` : "No filters"}
            </span>
          </div>
          <div className="resource-filter-grid">
            <label className="ticket-filter-field resource-search-field">
              <ResourceFilterLabel icon={Search}>Search resources</ResourceFilterLabel>
              <span className="ticket-filter-control">
                <Search size={16} />
                <input placeholder="Name or email" value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} />
              </span>
            </label>
            <ResourceDropdown
              label="Status"
              icon={CircleDot}
              value={draft.status}
              options={statusOptions}
              onChange={(status) => setDraft({ ...draft, status })}
            />
          </div>
          <div className="filter-actions ticket-filter-actions">
            <button type="button" className="ticket-reset-button" onClick={resetFilters}><RotateCcw size={15} />Reset</button>
            <button type="submit" className="ticket-apply-button"><Filter size={15} />Apply filters</button>
          </div>
        </form>

        <ErrorMessage message={resources.error ? getFriendlyError(resources.error) : undefined} />
        {resources.isLoading ? (
          <div className="ticket-loading-state">Loading resources...</div>
        ) : (
          <>
            <div className="ticket-results-summary">
              <span><Wrench size={15} />{resources.data?.total ?? 0} resources found</span>
              <span><Filter size={14} />{appliedFilterCount ? `${appliedFilterCount} filters applied` : "Showing all resources"}</span>
            </div>
            {!resources.data?.items.length ? (
              <div className="empty-state ticket-empty-state">
                <Inbox size={22} />
                <span>No resources match these filters.</span>
              </div>
            ) : (
              <>
                <div className="member-table-wrap">
                  <table className="member-table resource-table">
                    <thead>
                      <tr>
                        <th><span className="ticket-th-label"><UserRound size={13} />Resource</span></th>
                        <th><span className="ticket-th-label"><Mail size={13} />Email</span></th>
                        <th><span className="ticket-th-label"><CircleDot size={13} />Status</span></th>
                        <th><span className="ticket-th-label"><CalendarClock size={13} />Created</span></th>
                        <th><span className="ticket-th-label"><Wrench size={13} />Availability</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {resources.data.items.map((member) => {
                        const label = member.displayName || compactId(member.userId);
                        return (
                          <tr key={member.userId}>
                            <td>
                              <Link className="member-name-link" to={`/members/${member.userId}`}>{label}</Link>
                            </td>
                            <td className="member-table-muted">{member.email}</td>
                            <td><StatusBadge value={member.status} /></td>
                            <td className="member-table-muted">{formatDate(member.createdAt)}</td>
                            <td>
                              <Link className="resource-availability-link" to={`/resources/${member.userId}/availability`}>
                                <CalendarClock size={14} />
                                Open schedule
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <ListPagination
                  page={filters.page ?? 0}
                  size={filters.size ?? DEFAULT_LIST_PAGE_SIZE}
                  total={resources.data.total}
                  isFetching={resources.isFetching}
                  onPageChange={onPageChange}
                />
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
