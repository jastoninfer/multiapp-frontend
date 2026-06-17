import { Fragment, FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  Database,
  Fingerprint,
  Filter,
  Inbox,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserRound,
  type LucideIcon
} from "lucide-react";
import { listAuditLogs, type AuditLogFilters } from "../api/auditLogs";
import { getFriendlyError } from "../api/client";
import { cleanQueryParam } from "../api/params";
import { isAdmin } from "../auth/authorization";
import { ErrorMessage } from "../components/ErrorMessage";
import { ForbiddenMessage } from "../components/ForbiddenMessage";
import { DEFAULT_LIST_PAGE_SIZE, ListPagination } from "../components/ListPagination";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ToastProvider";
import { useAuth } from "../auth/AuthContext";
import { useCurrentTenant } from "../hooks/useCurrentTenant";
import { queryKeys } from "../queryKeys";
import { AuditEntityType, AuditLogResponse } from "../types";
import { compactId, formatDateTimeWithZone, titleCase } from "../ui/format";

interface AuditDraft {
  entityType: string;
  entityId: string;
  action: string;
  requestId: string;
}

const initialDraft: AuditDraft = {
  entityType: "",
  entityId: "",
  action: "",
  requestId: ""
};

const entityTypeOptions = [
  { value: "", label: "Any entity", detail: "Show all audited records" },
  { value: "TICKET", label: "Ticket", detail: "Ticket workflow and field changes" },
  { value: "APPOINTMENT", label: "Appointment", detail: "Scheduling changes" },
  { value: "CONTACT", label: "Contact", detail: "External contact changes" },
  { value: "CONTACT_CLAIM", label: "Contact claim", detail: "Claim code activity" },
  { value: "MEMBERSHIP", label: "Membership", detail: "Tenant member changes" },
  { value: "TENANT", label: "Tenant", detail: "Tenant profile and status changes" },
  { value: "RESOURCE_BLOCK", label: "Unavailable time", detail: "Resource schedule blocks" },
  { value: "RESOURCE_WORKING_HOURS", label: "Working hours", detail: "Recurring availability changes" },
  { value: "COMMENT", label: "Comment", detail: "Ticket comment activity" },
  { value: "ATTACHMENT", label: "Attachment", detail: "File activity" },
  { value: "USER", label: "User", detail: "User access changes" }
];

function toFilters(draft: AuditDraft, page = 0): AuditLogFilters {
  return {
    entityType: draft.entityType ? draft.entityType as AuditEntityType : undefined,
    entityId: cleanQueryParam(draft.entityId),
    action: cleanQueryParam(draft.action)?.toUpperCase(),
    requestId: cleanQueryParam(draft.requestId),
    page,
    size: DEFAULT_LIST_PAGE_SIZE
  };
}

function AuditFilterLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="ticket-filter-label">
      <Icon size={14} />
      {children}
    </span>
  );
}

function AuditDropdown({
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
      <AuditFilterLabel icon={Icon}>{label}</AuditFilterLabel>
      <div className={`ticket-dropdown${open ? " open" : ""}`}>
        <button
          type="button"
          className="ticket-dropdown-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="ticket-dropdown-trigger-main">
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

function appliedCount(filters: AuditLogFilters) {
  return [filters.entityType, filters.entityId, filters.action, filters.requestId].filter(Boolean).length;
}

function payloadCopyText(value: unknown) {
  if (!value) return "No payload";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Payload unavailable";
  }
}

function AuditTime({ value }: { value?: string | null }) {
  const formatted = formatDateTimeWithZone(value);
  return (
    <time className="ticket-created-time" dateTime={value ?? undefined}>
      {formatted.date}, {formatted.time}
    </time>
  );
}

function AuditDetailValue({
  label,
  value,
  onCopy,
  copyable = true
}: {
  label: string;
  value?: string | null;
  onCopy: (value: string, label: string) => void;
  copyable?: boolean;
}) {
  const displayValue = value || "-";
  return (
    <div className="audit-detail-value">
      <span>{label}</span>
      <div>
        <code>{displayValue}</code>
        {value && copyable && (
          <button type="button" className="audit-copy-button" onClick={() => onCopy(value, label)}>
            <Copy size={13} />
            Copy
          </button>
        )}
      </div>
    </div>
  );
}

function hasPayload(item: AuditLogResponse) {
  return item.diffJson !== undefined && item.diffJson !== null;
}

export function AuditLogsPage() {
  const { tenantId, isTenantSelected } = useAuth();
  const { profile, currentTenant } = useCurrentTenant();
  const { notify } = useToast();
  const authz = { me: profile, tenant: currentTenant };
  const canView = isAdmin(authz);
  const [draft, setDraft] = useState<AuditDraft>(initialDraft);
  const [filters, setFilters] = useState<AuditLogFilters>(() => toFilters(initialDraft));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const activeFilters = appliedCount(filters);
  const auditLogs = useQuery({
    queryKey: queryKeys.auditLogs(tenantId, filters),
    queryFn: () => listAuditLogs(filters),
    enabled: Boolean(isTenantSelected && canView)
  });

  if (!canView) return <ForbiddenMessage message="Audit logs are visible to tenant admins." />;

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
    setExpandedId(null);
  }

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label} copied.`);
    } catch {
      notify(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  async function copyPayload(item: AuditLogResponse) {
    await copyValue(payloadCopyText(item.diffJson), "Payload");
  }

  return (
    <div className="stack audit-page">
      <section className="panel">
        <div className="section-heading">
          <div>
            <h1>Audit logs</h1>
            <p className="muted">Review tenant activity across tickets, members, contacts, resources, and tenant settings.</p>
          </div>
        </div>

        <form className="filter-panel ticket-filter-panel audit-filter-panel" onSubmit={onFilter}>
          <div className="ticket-filter-header">
            <div>
              <h2><SlidersHorizontal size={16} />Filters</h2>
              <p>Refine audit history by entity, action, record ID, or request ID.</p>
            </div>
            <span className="ticket-filter-count">
              <Filter size={14} />
              {activeFilters ? `${activeFilters} active` : "No filters"}
            </span>
          </div>
          <div className="audit-filter-grid">
            <AuditDropdown
              label="Entity"
              icon={Database}
              value={draft.entityType}
              options={entityTypeOptions}
              onChange={(entityType) => setDraft({ ...draft, entityType })}
            />
            <label className="ticket-filter-field">
              <AuditFilterLabel icon={Fingerprint}>Record ID</AuditFilterLabel>
              <span className="ticket-filter-control">
                <input placeholder="Entity UUID" value={draft.entityId} onChange={(event) => setDraft({ ...draft, entityId: event.target.value })} />
              </span>
            </label>
            <label className="ticket-filter-field">
              <AuditFilterLabel icon={Activity}>Action</AuditFilterLabel>
              <span className="ticket-filter-control">
                <input placeholder="TICKET_UPDATED" value={draft.action} onChange={(event) => setDraft({ ...draft, action: event.target.value })} />
              </span>
            </label>
            <label className="ticket-filter-field">
              <AuditFilterLabel icon={Search}>Request ID</AuditFilterLabel>
              <span className="ticket-filter-control">
                <input placeholder="Request trace ID" value={draft.requestId} onChange={(event) => setDraft({ ...draft, requestId: event.target.value })} />
              </span>
            </label>
          </div>
          <div className="filter-actions ticket-filter-actions">
            <button type="button" className="ticket-reset-button" onClick={resetFilters}><RotateCcw size={15} />Reset</button>
            <button type="submit" className="ticket-apply-button"><Filter size={15} />Apply filters</button>
          </div>
        </form>

        <ErrorMessage message={auditLogs.error ? getFriendlyError(auditLogs.error) : undefined} />
        {!isTenantSelected ? (
          <div className="empty-state ticket-empty-state">
            <Inbox size={22} />
            <span>Select a tenant before loading audit logs.</span>
          </div>
        ) : auditLogs.isLoading ? (
          <div className="ticket-loading-state">
            <Loader2 size={18} className="spin-icon" />
            Loading audit logs...
          </div>
        ) : (
          <>
            <div className="ticket-results-summary">
              <span><ClipboardList size={15} />{auditLogs.data?.total ?? 0} audit events found</span>
              <span><Filter size={14} />{activeFilters ? `${activeFilters} filters applied` : "Showing recent events"}</span>
            </div>
            {!auditLogs.data?.items.length ? (
              <div className="empty-state member-empty-state">
                <ClipboardList size={22} />
                <span>No audit events match these filters.</span>
              </div>
            ) : (
              <>
                <div className="member-table-wrap">
                  <table className="member-table audit-table">
                    <thead>
                      <tr>
                        <th><span className="ticket-th-label"> </span></th>
                        <th><span className="ticket-th-label"><Activity size={13} />Action</span></th>
                        <th><span className="ticket-th-label"><Database size={13} />Entity</span></th>
                        <th><span className="ticket-th-label"><UserRound size={13} />Actor</span></th>
                        <th><span className="ticket-th-label"><Search size={13} />Request</span></th>
                        <th><span className="ticket-th-label"><CalendarClock size={13} />Created</span></th>
                        <th><span className="ticket-th-label"><ClipboardList size={13} />Payload</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.data.items.map((item) => {
                        const expanded = expandedId === item.auditLogId;
                        return (
                          <Fragment key={item.auditLogId}>
                            <tr className={`audit-main-row${expanded ? " audit-row-expanded" : ""}`}>
                              <td className="audit-expand-cell">
                                <button
                                  type="button"
                                  className="audit-expand-button"
                                  aria-label={expanded ? "Collapse audit log" : "Expand audit log"}
                                  aria-expanded={expanded}
                                  onClick={() => setExpandedId(expanded ? null : item.auditLogId)}
                                >
                                  <ChevronDown size={15} />
                                </button>
                              </td>
                              <td>
                                <span className="audit-action">{titleCase(item.action)}</span>
                              </td>
                              <td className="audit-entity-cell">
                                <span className="audit-entity-content">
                                  <StatusBadge value={item.entityType} />
                                </span>
                              </td>
                              <td className="member-table-muted audit-id-cell"><span title={item.actorUserId ?? "System"}>{item.actorUserId ? compactId(item.actorUserId) : "System"}</span></td>
                              <td className="member-table-muted audit-id-cell"><span title={item.requestId ?? ""}>{compactId(item.requestId)}</span></td>
                              <td className="member-table-muted"><AuditTime value={item.createdAt} /></td>
                              <td>
                                <button
                                  type="button"
                                  className="audit-copy-button"
                                  disabled={!hasPayload(item)}
                                  onClick={() => copyPayload(item)}
                                >
                                  <Copy size={13} />
                                  {hasPayload(item) ? "Copy payload" : "No payload"}
                                </button>
                              </td>
                            </tr>
                            {expanded && (
                              <tr className="audit-expanded-row">
                                <td colSpan={7}>
                                  <div className="audit-expanded-panel">
                                    <AuditDetailValue label="Audit log ID" value={item.auditLogId} onCopy={copyValue} />
                                    <AuditDetailValue label="Entity ID" value={item.entityId} onCopy={copyValue} />
                                    <AuditDetailValue label="Actor user ID" value={item.actorUserId ?? "System"} onCopy={copyValue} copyable={Boolean(item.actorUserId)} />
                                    <AuditDetailValue label="Request ID" value={item.requestId} onCopy={copyValue} />
                                    <AuditDetailValue label="Tenant ID" value={item.tenantId} onCopy={copyValue} />
                                    <AuditDetailValue label="Action" value={item.action} onCopy={copyValue} />
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <ListPagination
                  page={filters.page ?? 0}
                  size={filters.size ?? DEFAULT_LIST_PAGE_SIZE}
                  total={auditLogs.data.total}
                  isFetching={auditLogs.isFetching}
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
