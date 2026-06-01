import { Link } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CalendarClock, Clock, Inbox, PlusCircle, Ticket, TrendingUp } from "lucide-react";
import { listAppointments } from "../api/appointments";
import { getFriendlyError } from "../api/client";
import { listResourceBlocks } from "../api/resources";
import { listTickets } from "../api/tickets";
import { useAuth } from "../auth/AuthContext";
import { isAgentOrAdmin, isCustomer, isResourceUser } from "../auth/authorization";
import { ErrorMessage } from "../components/ErrorMessage";
import { CompactBarChart, StatusFlowChart } from "../components/MiniCharts";
import { StatusBadge } from "../components/StatusBadge";
import { useCurrentTenant } from "../hooks/useCurrentTenant";
import { queryKeys } from "../queryKeys";
import { formatDateTimeWithZone } from "../ui/format";

const DAY_MS = 24 * 60 * 60 * 1000;
const HIGH_PRIORITY_WORK_LIMIT = 5;
const TREND_DAYS = 10;
const priorityColors: Record<string, string> = {
  LOW: "#2563eb",
  MEDIUM: "#0891b2",
  HIGH: "#16a34a",
  URGENT: "#f59e0b"
};
const ticketStatusLabels: Record<string, string> = {
  NEW: "NEW",
  IN_PROGRESS: "IN PROG.",
  CLOSED: "CLOSED",
  REOPENED: "REOPENED"
};
const activeAppointmentStatuses = ["BOOKED", "RESCHEDULED"];
const activeAppointmentStatusColors: Record<string, string> = {
  BOOKED: "#2563eb",
  RESCHEDULED: "#f59e0b"
};

function startOfLocalDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function toLocalInputValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function shortDayLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" }).format(date);
}

function formatRelativeAge(value?: string | null) {
  if (!value) return "No timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No timestamp";
  const diffMs = Date.now() - date.getTime();
  const absMs = Math.abs(diffMs);
  const minutes = Math.max(1, Math.round(absMs / (60 * 1000)));
  if (minutes < 60) return diffMs >= 0 ? `${minutes}m ago` : `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return diffMs >= 0 ? `${hours}h ago` : `in ${hours}h`;
  const days = Math.round(hours / 24);
  return diffMs >= 0 ? `${days}d ago` : `in ${days}d`;
}

function metricValue(isLoading: boolean, value: number | undefined) {
  if (isLoading) return "--";
  return value ?? 0;
}

function dashboardHeroCopy({
  isStaff,
  resourceUser,
  customer
}: {
  isStaff: boolean;
  resourceUser: boolean;
  customer: boolean;
}) {
  if (resourceUser) {
    return {
      title: "Today's field work",
      subtitle: "Upcoming appointments, timing, and availability."
    };
  }
  if (isStaff) {
    return {
      title: "Service desk control",
      subtitle: "Priority queues, intake patterns, and schedule movement."
    };
  }
  if (customer) {
    return {
      title: "Your service requests",
      subtitle: "Track request progress and recent activity."
    };
  }
  return {
    title: "Workspace in focus",
    subtitle: "Tickets and schedule activity."
  };
}

function AppointmentTime({ value }: { value?: string | null }) {
  const formatted = formatDateTimeWithZone(value);
  return (
    <time className="appointment-time" dateTime={value ?? undefined}>
      {formatted.date}, {formatted.time}
    </time>
  );
}

function sameLocalDay(value: string | undefined, day: Date) {
  if (!value) return false;
  return startOfLocalDay(new Date(value)).getTime() === day.getTime();
}

function isActiveAppointment(status?: string | null) {
  return status === "BOOKED" || status === "RESCHEDULED";
}

interface DistributionItem {
  label: string;
  value: number;
  color?: string;
  href?: string;
}

function CompactDistribution({ items }: { items: DistributionItem[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return (
    <div className="distribution-list">
      {items.map((item) => {
        const pct = total ? Math.round((item.value / total) * 100) : 0;
        const content = (
          <>
            <span className="distribution-label">
              <i style={{ background: item.color }} />
              {item.label}
            </span>
            <span className="distribution-track" aria-hidden="true">
              <span className="distribution-fill" style={{ width: `${pct}%`, background: item.color }} />
            </span>
            <strong>{item.value}</strong>
          </>
        );
        return item.href ? (
          <Link className="distribution-row" to={item.href} key={item.label} aria-label={`${item.label}: ${item.value}`}>
            {content}
          </Link>
        ) : (
          <div className="distribution-row" key={item.label}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

export function DashboardPage() {
  const { tenantId, updateTenantId } = useAuth();
  const { meQuery, tenantsQuery, profile, currentTenant, tenants } = useCurrentTenant();
  const me = profile;
  const authz = useMemo(() => ({ me, tenant: currentTenant }), [currentTenant, me]);
  const canViewTickets = isCustomer(authz) || isResourceUser(authz) || isAgentOrAdmin(authz);
  const canViewHighTickets = canViewTickets;
  const canViewUrgentTickets = canViewTickets;
  const canViewAppointments = isAgentOrAdmin(authz) || isResourceUser(authz);
  const canViewBlocks = Boolean(me?.userId && isResourceUser(authz));
  const heroCopy = useMemo(
    () => dashboardHeroCopy({
      isStaff: isAgentOrAdmin(authz),
      resourceUser: isResourceUser(authz),
      customer: isCustomer(authz)
    }),
    [authz]
  );

  useEffect(() => {
    if (!tenantId && currentTenant) updateTenantId(currentTenant.tenantId);
  }, [currentTenant, tenantId, updateTenantId]);

  const today = useMemo(() => startOfLocalDay(new Date()), []);
  const ticketWindowStart = useMemo(() => addDays(today, -(TREND_DAYS - 1)), [today]);
  const ticketWindowEnd = useMemo(() => addDays(today, 1), [today]);
  const appointmentWindowEnd = useMemo(() => addDays(today, TREND_DAYS), [today]);
  const recentTicketFilters = useMemo(() => ({ page: 0, size: 50, sort: "updatedAt,desc" }), []);
  const ticketTrendFilters = useMemo(() => ({
    createdFrom: ticketWindowStart.toISOString(),
    createdTo: ticketWindowEnd.toISOString(),
    page: 0,
    size: 100,
    sort: "createdAt,asc"
  }), [ticketWindowEnd, ticketWindowStart]);
  const highTicketFilters = useMemo(() => ({ ticketPriority: "HIGH", page: 0, size: 12 }), []);
  const urgentTicketFilters = useMemo(() => ({ ticketPriority: "URGENT", page: 0, size: 5 }), []);
  const dashboardFrom = useMemo(() => new Date().toISOString(), []);
  const upcomingFilters = useMemo(() => ({
    resourceUserId: isResourceUser(authz) ? me?.userId : undefined,
    from: dashboardFrom
  }), [authz, dashboardFrom, me?.userId]);
  const appointmentTrendFilters = useMemo(() => ({
    resourceUserId: isResourceUser(authz) ? me?.userId : undefined,
    from: today.toISOString(),
    to: appointmentWindowEnd.toISOString(),
    page: 0,
    size: 100,
    sort: "startAt,asc"
  }), [appointmentWindowEnd, authz, me?.userId, today]);

  const recentTickets = useQuery({
    queryKey: queryKeys.tickets(tenantId, recentTicketFilters),
    queryFn: () => listTickets(recentTicketFilters),
    enabled: Boolean(tenantId && canViewTickets)
  });
  const highTickets = useQuery({
    queryKey: queryKeys.tickets(tenantId, highTicketFilters),
    queryFn: () => listTickets(highTicketFilters),
    enabled: Boolean(tenantId && canViewHighTickets)
  });
  const urgentTickets = useQuery({
    queryKey: queryKeys.tickets(tenantId, urgentTicketFilters),
    queryFn: () => listTickets(urgentTicketFilters),
    enabled: Boolean(tenantId && canViewUrgentTickets)
  });
  const ticketTrend = useQuery({
    queryKey: queryKeys.tickets(tenantId, ticketTrendFilters),
    queryFn: () => listTickets(ticketTrendFilters),
    enabled: Boolean(tenantId && canViewTickets)
  });
  const appointments = useQuery({
    queryKey: queryKeys.appointments(tenantId, upcomingFilters),
    queryFn: () => listAppointments(upcomingFilters),
    enabled: Boolean(tenantId && canViewAppointments)
  });
  const appointmentTrend = useQuery({
    queryKey: queryKeys.appointments(tenantId, appointmentTrendFilters),
    queryFn: () => listAppointments(appointmentTrendFilters),
    enabled: Boolean(tenantId && canViewAppointments)
  });
  const blocks = useQuery({
    queryKey: queryKeys.resourceBlocks(tenantId, me?.userId ?? ""),
    queryFn: () => listResourceBlocks(me?.userId ?? ""),
    enabled: Boolean(tenantId && canViewBlocks)
  });
  const recentTicketItems = recentTickets.data?.items ?? [];
  const appointmentItems = appointments.data?.items ?? [];
  const ticketTrendItems = ticketTrend.data?.items ?? [];
  const appointmentTrendItems = appointmentTrend.data?.items ?? [];
  const activeAppointmentItems = appointmentItems.filter((item) => isActiveAppointment(item.status));
  const activeAppointmentTrendItems = appointmentTrendItems.filter((item) => isActiveAppointment(item.status));
  const latestTicketSampleSize = recentTicketItems.length;
  const unresolvedSampleCount = recentTicketItems.filter((ticket) => ticket.status !== "CLOSED").length;
  const reopenedSampleCount = recentTicketItems.filter((ticket) => ticket.status === "REOPENED").length;
  const highPriorityWorkItems = (highTickets.data?.items ?? [])
    .filter((ticket) => ticket.status !== "CLOSED")
    .slice(0, HIGH_PRIORITY_WORK_LIMIT);
  const nextAppointment = activeAppointmentItems
    .slice()
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0];
  const priorityChart = ["LOW", "MEDIUM", "HIGH", "URGENT"].map((priority) => ({
    label: priority,
    value: recentTicketItems.filter((ticket) => ticket.priority === priority).length,
    href: `/tickets?ticketPriority=${priority}`,
    detail: "Filter tickets by priority",
    color: priorityColors[priority]
  }));
  const statusChart = ["NEW", "IN_PROGRESS", "CLOSED", "REOPENED"].map((status) => ({
    label: ticketStatusLabels[status],
    value: recentTicketItems.filter((ticket) => ticket.status === status).length,
    href: `/tickets?ticketStatus=${status}`,
    detail: "Filter tickets at this stage",
    color: {
      NEW: "#2563eb",
      IN_PROGRESS: "#0891b2",
      CLOSED: "#16a34a",
      REOPENED: "#f59e0b"
    }[status]
  }));
  const appointmentStatusChart = activeAppointmentStatuses.map((status) => ({
    label: status,
    value: activeAppointmentItems.filter((item) => item.status === status).length,
    href: `/appointments?status=${status}`,
    detail: "Filter active upcoming schedule by status",
    color: activeAppointmentStatusColors[status]
  }));
  const ticketVolumeChart = Array.from({ length: TREND_DAYS }, (_, index) => {
    const day = addDays(ticketWindowStart, index);
    const next = addDays(day, 1);
    const value = ticketTrendItems.filter((ticket) => sameLocalDay(ticket.createdAt, day)).length;
    return {
      label: shortDayLabel(day),
      value,
      color: "#2563eb",
      href: `/tickets?createdFrom=${encodeURIComponent(toLocalInputValue(day))}&createdTo=${encodeURIComponent(toLocalInputValue(next))}&sort=createdAt,desc`,
      detail: "Open tickets created that day"
    };
  });
  const appointmentVolumeChart = Array.from({ length: TREND_DAYS }, (_, index) => {
    const day = addDays(today, index);
    const next = addDays(day, 1);
    const value = activeAppointmentTrendItems.filter((item) => sameLocalDay(item.startAt, day)).length;
    return {
      label: shortDayLabel(day),
      value,
      color: "#0891b2",
      href: `/appointments?from=${encodeURIComponent(toLocalInputValue(day))}&to=${encodeURIComponent(toLocalInputValue(next))}&sort=startAt,asc`,
      detail: "Open schedule for this day"
    };
  });
  const todayTicketCount = ticketVolumeChart[ticketVolumeChart.length - 1]?.value ?? 0;
  const upcomingAppointmentCount = activeAppointmentTrendItems.length;

  return (
    <div className="stack dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-main">
          <div>
            <h1>{heroCopy.title}</h1>
            <p className="muted">{heroCopy.subtitle}</p>
          </div>
        </div>
        <div className="dashboard-actions">
          {canViewTickets && (
            <Link className="button-link dashboard-action-primary" to="/tickets/new">
              <PlusCircle size={16} />
              New ticket
            </Link>
          )}
          {canViewAppointments && (
            <Link className="button-link" to="/appointments">
              <CalendarClock size={16} />
              Schedule
            </Link>
          )}
        </div>
        <ErrorMessage message={meQuery.error ? getFriendlyError(meQuery.error) : undefined} />
        <ErrorMessage message={tenantsQuery.error ? getFriendlyError(tenantsQuery.error) : undefined} />
        {meQuery.isLoading && <p className="muted">Loading your profile...</p>}
      </section>

      {me && !tenants.length && (
        <section className="panel">
          <h2>No tenant access</h2>
          <p className="muted">Your account is registered, but it is not a member of any tenant yet. Workspace actions are disabled.</p>
        </section>
      )}

      {currentTenant && (
        <>
          <section className="stats-grid">
            <Link className="stat-card metric-card metric-card-tickets" to="/tickets">
              <span className="metric-top"><span>Total tickets</span><Ticket size={18} /></span>
              <strong>{metricValue(recentTickets.isLoading, recentTickets.data?.total)}</strong>
              <small>{unresolvedSampleCount} open or active</small>
            </Link>
            <Link className="stat-card metric-card metric-card-high" to="/tickets?ticketPriority=HIGH">
              <span className="metric-top"><span>High priority</span><TrendingUp size={18} /></span>
              <strong>{metricValue(highTickets.isLoading, highTickets.data?.total)}</strong>
              <small>{reopenedSampleCount} reopened</small>
            </Link>
            {canViewUrgentTickets && (
              <Link className="stat-card metric-card metric-card-urgent" to="/tickets?ticketPriority=URGENT">
                <span className="metric-top"><span>Urgent</span><AlertTriangle size={18} /></span>
                <strong>{metricValue(urgentTickets.isLoading, urgentTickets.data?.total)}</strong>
                <small>Immediate triage queue</small>
              </Link>
            )}
            {canViewAppointments && (
              <Link className="stat-card metric-card metric-card-appointments" to="/appointments">
                <span className="metric-top"><span>Upcoming appointments</span><CalendarClock size={18} /></span>
                <strong>{metricValue(appointments.isLoading, activeAppointmentItems.length)}</strong>
                <small>{nextAppointment ? <>Next <AppointmentTime value={nextAppointment.startAt} /></> : "No upcoming slot"}</small>
              </Link>
            )}
            {isResourceUser(authz) && (
              <div className="stat-card metric-card metric-card-blocks">
                <span className="metric-top"><span>Resource blocks</span><Clock size={18} /></span>
                <strong>{metricValue(blocks.isLoading, blocks.data?.length)}</strong>
                <small>Unavailable periods</small>
              </div>
            )}
          </section>

          <div className="dashboard-grid">
            <section className="panel dashboard-worklist-panel">
              <div className="chart-title">
                <div>
                  <h2>{isResourceUser(authz) ? "My upcoming appointments" : "Recent high priority tickets"}</h2>
                  <span className="inline-muted">
                    {isResourceUser(authz) ? "Next scheduled work by start time" : `Showing up to ${HIGH_PRIORITY_WORK_LIMIT} active high-priority tickets`}
                  </span>
                </div>
                <Link className="chart-link" to={isResourceUser(authz) ? "/appointments" : "/tickets?ticketPriority=HIGH"}>
                  Open list <ArrowRight size={14} />
                </Link>
              </div>
              {isResourceUser(authz) ? (
                appointments.data?.items.length ? (
                  <div className="worklist-table-wrap">
                    <table className="worklist-table">
                      <thead>
                        <tr>
                          <th>Start</th>
                          <th>Address</th>
                          <th>End</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appointments.data.items.slice(0, 6).map((item) => (
                          <tr key={item.id}>
                            <td><Link to={`/appointments/${item.id}`}><AppointmentTime value={item.startAt} /></Link></td>
                            <td>{item.addressText || "No address"}</td>
                            <td><AppointmentTime value={item.endAt} /></td>
                            <td><StatusBadge value={item.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="dashboard-empty">
                    <CalendarClock size={22} />
                    <span>No upcoming appointments.</span>
                  </div>
                )
              ) : (
                highPriorityWorkItems.length ? (
                  <div className="worklist-table-wrap">
                    <table className="worklist-table">
                      <thead>
                        <tr>
                          <th>Ticket</th>
                          <th>Requester</th>
                          <th>Owner</th>
                          <th>Updated</th>
                          <th>Status</th>
                          <th>Priority</th>
                        </tr>
                      </thead>
                      <tbody>
                        {highPriorityWorkItems.map((ticket) => (
                          <tr key={ticket.id}>
                            <td className="worklist-ticket-cell">
                              <Link to={`/tickets/${ticket.id}`}>{ticket.title}</Link>
                            </td>
                            <td>{ticket.requesterName || "Unknown requester"}</td>
                            <td>{ticket.ownerName || "Unassigned"}</td>
                            <td>{ticket.updatedAt ? formatRelativeAge(ticket.updatedAt) : formatRelativeAge(ticket.createdAt)}</td>
                            <td><StatusBadge value={ticket.status} /></td>
                            <td><StatusBadge value={ticket.priority} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="dashboard-empty">
                    <Inbox size={22} />
                    <span>No high priority tickets right now.</span>
                  </div>
                )
              )}
            </section>

            {canViewTickets && (
              <section className="panel chart-panel distribution-panel">
                <div className="chart-title">
                  <div>
                    <h2>Priority mix</h2>
                    <span className="inline-muted">Latest {latestTicketSampleSize} tickets</span>
                  </div>
                  <Link className="chart-link" to="/tickets">View tickets <ArrowRight size={14} /></Link>
                </div>
                <CompactDistribution items={priorityChart} />
              </section>
            )}
            {canViewTickets && (
              <section className="panel chart-panel flow-panel">
                <div className="chart-title">
                  <div>
                    <h2>Ticket status</h2>
                    <span className="inline-muted">Latest {latestTicketSampleSize} tickets by current state</span>
                  </div>
                </div>
                <StatusFlowChart items={statusChart} />
              </section>
            )}
            {canViewAppointments && (
              <section className="panel chart-panel distribution-panel">
                <div className="chart-title">
                  <div>
                    <h2>Active schedule</h2>
                    <span className="inline-muted">{activeAppointmentItems.length} booked or rescheduled</span>
                  </div>
                  <Link className="chart-link" to="/appointments">Open schedule <ArrowRight size={14} /></Link>
                </div>
                <CompactDistribution items={appointmentStatusChart} />
              </section>
            )}
            {canViewTickets && (
              <section className="panel chart-panel trend-panel">
                <div className="chart-title">
                  <div>
                    <h2>Ticket intake</h2>
                    <span className="inline-muted">Last {TREND_DAYS} days</span>
                  </div>
                  <span className="inline-muted">{todayTicketCount} today / {ticketTrend.data?.total ?? 0} submitted</span>
                </div>
                <CompactBarChart items={ticketVolumeChart} height={104} />
              </section>
            )}
            {canViewAppointments && (
              <section className="panel chart-panel trend-panel">
                <div className="chart-title">
                  <div>
                    <h2>Appointments</h2>
                    <span className="inline-muted">Next {TREND_DAYS} days</span>
                  </div>
                  <span className="inline-muted">{upcomingAppointmentCount} shown / {appointmentTrend.data?.total ?? 0} scheduled</span>
                </div>
                <CompactBarChart items={appointmentVolumeChart} height={104} />
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
