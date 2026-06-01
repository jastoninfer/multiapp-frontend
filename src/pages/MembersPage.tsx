import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Check,
  ChevronDown,
  CircleDot,
  Filter,
  Mail,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserPlus,
  UserRound,
  Users,
  type LucideIcon
} from "lucide-react";
import { addMember, listMembers, type MemberFilters } from "../api/members";
import { getFriendlyError } from "../api/client";
import { cleanQueryParam } from "../api/params";
import { isAdmin, isAgentOrAdmin, isPlatformAdmin } from "../auth/authorization";
import { ErrorMessage } from "../components/ErrorMessage";
import { ForbiddenMessage } from "../components/ForbiddenMessage";
import { DEFAULT_LIST_PAGE_SIZE, ListPagination } from "../components/ListPagination";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../auth/AuthContext";
import { useCurrentTenant } from "../hooks/useCurrentTenant";
import { queryKeys } from "../queryKeys";
import { TenantRole } from "../types";
import { compactId, formatDate } from "../ui/format";

const initialAddForm = { userId: "", role: "CUSTOMER" as TenantRole };
const roleOptions = [
  { value: "", label: "Any role", detail: "Show every tenant role" },
  { value: "CUSTOMER", label: "Customer", detail: "Requester access" },
  { value: "AGENT", label: "Agent", detail: "Staff queue access" },
  { value: "ADMIN", label: "Admin", detail: "Tenant administration" },
  { value: "RESOURCE_USER", label: "Resource user", detail: "Bookable work resource" }
];
const addRoleOptions = roleOptions.filter((option) => option.value);

function MemberFilterLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="ticket-filter-label">
      <Icon size={14} />
      {children}
    </span>
  );
}

function MemberFilterDropdown({
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
    <div className="ticket-filter-field member-role-filter-field" ref={dropdownRef}>
      <MemberFilterLabel icon={Icon}>{label}</MemberFilterLabel>
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

export function MembersPage() {
  const { tenantId } = useAuth();
  const { profile, currentTenant, tenants } = useCurrentTenant();
  const authz = { me: profile, tenant: currentTenant };
  const platformAdmin = isPlatformAdmin(profile, tenants);
  const canView = isAgentOrAdmin(authz);
  const canManage = isAdmin(authz) || platformAdmin;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ q: "", role: "" });
  const [filters, setFilters] = useState<MemberFilters>({ q: null, role: undefined, page: 0, size: DEFAULT_LIST_PAGE_SIZE });
  const [form, setForm] = useState(initialAddForm);
  const [showAdd, setShowAdd] = useState(false);
  const members = useQuery({
    queryKey: queryKeys.members(tenantId, filters),
    queryFn: () => listMembers(filters),
    enabled: Boolean(tenantId && canView)
  });
  const add = useMutation({
    mutationFn: () => addMember({ userId: form.userId.trim(), role: form.role, isDefault: false }),
    onSuccess: () => {
      setForm(initialAddForm);
      setShowAdd(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.members(tenantId, filters) });
    }
  });
  const total = members.data?.total ?? 0;
  const appliedFilterCount = [filters.q, filters.role].filter(Boolean).length;

  if (!canView) return <ForbiddenMessage message="Members are visible to tenant admins, agents, and platform admins." />;

  function onAdd(event: FormEvent) {
    event.preventDefault();
    add.mutate();
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setFilters({ q: cleanQueryParam(draft.q), role: draft.role ? draft.role as TenantRole : undefined, page: 0, size: DEFAULT_LIST_PAGE_SIZE });
  }

  function resetFilters() {
    setDraft({ q: "", role: "" });
    setFilters({ q: null, role: undefined, page: 0, size: DEFAULT_LIST_PAGE_SIZE });
  }

  function onPageChange(page: number) {
    setFilters((current) => ({ ...current, page, size: DEFAULT_LIST_PAGE_SIZE }));
  }

  return (
    <div className="stack members-page">
      <section className="panel">
        <div className="section-heading">
          <div>
            <h1>Members</h1>
            <p className="muted">View tenant members and manage membership changes from each member profile.</p>
          </div>
          {canManage && !showAdd && (
            <button type="button" className="secondary" onClick={() => setShowAdd(true)}>
              <UserPlus size={16} />
              Add member
            </button>
          )}
        </div>

        {showAdd && canManage ? (
          <form className="filter-panel ticket-filter-panel member-filter-panel" onSubmit={onAdd}>
            <div className="ticket-filter-header">
              <div>
                <h2><UserPlus size={16} />Add member</h2>
                <p>Add an existing user to this tenant with a tenant-specific role.</p>
              </div>
            </div>
            <div className="member-add-grid">
              <label>
                <span>User ID</span>
                <input required value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })} />
              </label>
              <MemberFilterDropdown
                label="Role"
                icon={Users}
                value={form.role}
                options={addRoleOptions}
                onChange={(role) => setForm({ ...form, role: role as TenantRole })}
              />
            </div>
            <div className="filter-actions ticket-filter-actions">
              <button type="button" className="ticket-reset-button" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="ticket-apply-button" disabled={add.isPending}>
                <UserPlus size={15} />
                Confirm
              </button>
            </div>
            <ErrorMessage message={add.error ? getFriendlyError(add.error) : undefined} />
          </form>
        ) : (
          <form className="filter-panel ticket-filter-panel member-filter-panel" onSubmit={onSearch}>
          <div className="ticket-filter-header">
            <div>
              <h2><SlidersHorizontal size={16} />Filters</h2>
              <p>Find tenant members by name, email, or role.</p>
            </div>
            <span className="ticket-filter-count">
              <Users size={14} />
              {members.data?.total ?? members.data?.items.length ?? 0} members
            </span>
          </div>
          <div className="member-filter-grid">
            <label className="ticket-filter-field">
              <MemberFilterLabel icon={Search}>Search members</MemberFilterLabel>
              <span className="ticket-filter-control">
                <Search size={16} />
                <input placeholder="Name or email" value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} />
              </span>
            </label>
            <MemberFilterDropdown
              label="Role"
              icon={Users}
              value={draft.role}
              options={roleOptions}
              onChange={(role) => setDraft({ ...draft, role })}
            />
          </div>
          <div className="filter-actions ticket-filter-actions">
            <button type="button" className="ticket-reset-button" onClick={resetFilters}><RotateCcw size={15} />Reset</button>
            <button type="submit" className="ticket-apply-button"><Filter size={15} />Apply filters</button>
          </div>
          </form>
        )}

        <ErrorMessage message={members.error ? getFriendlyError(members.error) : undefined} />
        {members.isLoading ? (
          <div className="ticket-loading-state">Loading members...</div>
        ) : (
          <>
            <div className="ticket-results-summary">
              <span><Users size={15} />{total} members found</span>
              <span><Filter size={14} />{appliedFilterCount ? `${appliedFilterCount} filters applied` : "Showing all members"}</span>
            </div>
            {!members.data?.items.length ? (
              <div className="empty-state member-empty-state">
                <Users size={22} />
                <span>No members match these filters.</span>
              </div>
            ) : (
              <>
                <div className="member-table-wrap">
                  <table className="member-table">
                    <thead>
                      <tr>
                        <th><span className="ticket-th-label"><UserRound size={13} />Name</span></th>
                        <th><span className="ticket-th-label"><Mail size={13} />Email</span></th>
                        <th><span className="ticket-th-label"><Users size={13} />Role</span></th>
                        <th><span className="ticket-th-label"><CircleDot size={13} />Status</span></th>
                        <th><span className="ticket-th-label"><CalendarClock size={13} />Created</span></th>
                        <th><span className="ticket-th-label"><Check size={13} />Default tenant</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.data.items.map((member) => (
                        <tr key={member.userId}>
                          <td>
                            <Link className="member-name-link" to={`/members/${member.userId}`}>
                              {member.displayName || compactId(member.userId)}
                            </Link>
                          </td>
                          <td className="member-table-muted">{member.email}</td>
                          <td><StatusBadge value={member.role} /></td>
                          <td><StatusBadge value={member.status} /></td>
                          <td className="member-table-muted">{formatDate(member.createdAt)}</td>
                          <td className="member-table-strong">{member.isDefault ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ListPagination
                  page={filters.page ?? 0}
                  size={filters.size ?? DEFAULT_LIST_PAGE_SIZE}
                  total={members.data.total}
                  isFetching={members.isFetching}
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
