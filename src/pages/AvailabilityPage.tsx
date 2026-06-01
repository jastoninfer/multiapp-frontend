import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Ban,
  CalendarClock,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Filter,
  Loader2,
  Plus,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { createResourceBlock, deleteResourceBlock, getAvailability, listResourceBlocks, updateWorkingHours } from "../api/resources";
import { getFriendlyError } from "../api/client";
import { isAgentOrAdmin, isResourceUser } from "../auth/authorization";
import { ErrorMessage } from "../components/ErrorMessage";
import { ForbiddenMessage } from "../components/ForbiddenMessage";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ToastProvider";
import { useAuth } from "../auth/AuthContext";
import { useCurrentTenant } from "../hooks/useCurrentTenant";
import { queryKeys } from "../queryKeys";
import { WorkingHoursRule } from "../types";
import { formatDateTime } from "../ui/format";

function toIso(value: string) {
  return value ? new Date(value).toISOString() : "";
}

function toLocalDateTimeInput(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function nextLocalMinuteInput() {
  const nextMinute = new Date(Date.now() + 60_000);
  nextMinute.setSeconds(0, 0);
  return toLocalDateTimeInput(nextMinute);
}

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayNumbers = [1, 2, 3, 4, 5, 6, 7];
const defaultTimezone = "Australia/Adelaide";
const appointmentPreviewLimit = 4;
const blockPreviewLimit = 4;
const unavailableMinDurationMs = 30 * 60 * 1000;
const unavailableMaxDurationMs = 180 * 24 * 60 * 60 * 1000;
const australiaTimezones = [
  { value: "Australia/Adelaide", label: "Adelaide" },
  { value: "Australia/Sydney", label: "Sydney / Canberra" },
  { value: "Australia/Melbourne", label: "Melbourne" },
  { value: "Australia/Brisbane", label: "Brisbane" },
  { value: "Australia/Perth", label: "Perth" },
  { value: "Australia/Darwin", label: "Darwin" },
  { value: "Australia/Hobart", label: "Hobart" },
  { value: "Australia/Broken_Hill", label: "Broken Hill" },
  { value: "Australia/Lord_Howe", label: "Lord Howe" },
  { value: "Australia/Eucla", label: "Eucla" }
];
const defaultRules: WorkingHoursRule[] = dayNumbers.map((dayOfWeek) => ({
  dayOfWeek,
  startLocal: "09:00",
  endLocal: "17:00",
  timezone: defaultTimezone
}));

function dayLabel(dayOfWeek: number) {
  return dayNames[dayOfWeek - 1] ?? `Day ${dayOfWeek}`;
}

function appointmentTitle(item: { ticketTitle?: string | null; title?: string | null }) {
  return item.ticketTitle || item.title || "Untitled appointment";
}

export function AvailabilityPage() {
  const { resourceUserId = "" } = useParams();
  const { tenantId } = useAuth();
  const { profile, currentTenant } = useCurrentTenant();
  const me = profile;
  const authz = { me, tenant: currentTenant };
  const canManage = isAgentOrAdmin(authz) || (isResourceUser(authz) && me?.userId === resourceUserId);
  const canEditHours = canManage;
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [rangeDraft, setRangeDraft] = useState({ from: "", to: "" });
  const [range, setRange] = useState({ from: "", to: "" });
  const [form, setForm] = useState({ startAt: "", endAt: "", reason: "" });
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [rules, setRules] = useState<WorkingHoursRule[]>(defaultRules);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [showHoursEditor, setShowHoursEditor] = useState(false);
  const [showTimezoneOptions, setShowTimezoneOptions] = useState(false);
  const [formError, setFormError] = useState("");
  const [hoursError, setHoursError] = useState("");
  const [futureDateTimeMin, setFutureDateTimeMin] = useState(nextLocalMinuteInput);
  const fromIso = useMemo(() => toIso(range.from), [range.from]);
  const toIsoRange = useMemo(() => toIso(range.to), [range.to]);
  const startTime = form.startAt ? new Date(form.startAt).getTime() : Number.NaN;
  const blockEndMin = Number.isNaN(startTime)
    ? futureDateTimeMin
    : toLocalDateTimeInput(new Date(startTime + unavailableMinDurationMs));
  const blockEndMax = Number.isNaN(startTime)
    ? undefined
    : toLocalDateTimeInput(new Date(startTime + unavailableMaxDurationMs));

  const availabilityQuery = useQuery({
    queryKey: queryKeys.resourceAvailability(tenantId, resourceUserId, "", ""),
    queryFn: () => getAvailability(resourceUserId),
    enabled: Boolean(resourceUserId && canManage)
  });

  const blocksQuery = useQuery({
    queryKey: queryKeys.resourceBlocks(tenantId, resourceUserId, fromIso, toIsoRange),
    queryFn: () => listResourceBlocks(resourceUserId, fromIso, toIsoRange),
    enabled: Boolean(resourceUserId && canManage)
  });

  const allBlocksQuery = useQuery({
    queryKey: queryKeys.resourceBlocks(tenantId, resourceUserId, "", ""),
    queryFn: () => listResourceBlocks(resourceUserId),
    enabled: Boolean(resourceUserId && canManage)
  });

  const workingHours = availabilityQuery.data?.data.workingHours ?? [];
  const appointments = availabilityQuery.data?.data.appointments ?? [];
  const blocks = blocksQuery.data ?? [];
  const allBlocks = allBlocksQuery.data ?? availabilityQuery.data?.data.blocks ?? [];
  const resourceLabel = me?.userId === resourceUserId ? "My availability" : "Resource availability";
  const selectedTimezone = australiaTimezones.find((item) => item.value === timezone) ?? { value: timezone, label: timezone };
  const visibleAppointments = appointments.slice(0, appointmentPreviewLimit);
  const visibleBlocks = blocks.slice(0, blockPreviewLimit);
  const sortedRules = [...workingHours].sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  useEffect(() => {
    if (!workingHours.length) return;
    setRules(workingHours);
    setTimezone(workingHours.find((rule) => rule.timezone)?.timezone || defaultTimezone);
  }, [workingHours]);

  useEffect(() => {
    const timer = window.setInterval(() => setFutureDateTimeMin(nextLocalMinuteInput()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const invalidateAvailability = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.resourceBlocks(tenantId, resourceUserId, fromIso, toIsoRange) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.resourceBlocks(tenantId, resourceUserId, "", "") }),
      queryClient.invalidateQueries({ queryKey: queryKeys.resourceAvailability(tenantId, resourceUserId, "", "") })
    ]);
  };

  const createBlock = useMutation({
    mutationFn: () => createResourceBlock(resourceUserId, {
      startAt: toIso(form.startAt),
      endAt: toIso(form.endAt),
      reason: form.reason.trim()
    }),
    onSuccess: async () => {
      notify("Unavailable time added.");
      setForm({ startAt: "", endAt: "", reason: "" });
      setShowBlockForm(false);
      await invalidateAvailability();
    }
  });

  const deleteBlock = useMutation({
    mutationFn: ({ blockId, version }: { blockId: string; version: number }) =>
      deleteResourceBlock(resourceUserId, blockId, version),
    onSuccess: async () => {
      notify("Unavailable time removed.");
      await invalidateAvailability();
    }
  });

  const saveHours = useMutation({
    mutationFn: () => updateWorkingHours(
      resourceUserId,
      timezone,
      rules
        .slice()
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
        .map((rule) => ({ ...rule, timezone }))
    ),
    onSuccess: async () => {
      notify("Working hours saved.");
      setShowHoursEditor(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.resourceAvailability(tenantId, resourceUserId, "", "") });
    }
  });

  if (!canManage) return <ForbiddenMessage message="You cannot manage availability for this resource." />;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    const start = new Date(form.startAt).getTime();
    const end = new Date(form.endAt).getTime();
    if (!form.startAt || !form.endAt || Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      setFormError("Choose a valid unavailable time range.");
      return;
    }
    if (start < Date.now()) {
      setFormError("Unavailable time must start in the future.");
      return;
    }
    const duration = end - start;
    if (duration < unavailableMinDurationMs || duration > unavailableMaxDurationMs) {
      setFormError("Unavailable time must be between 30 minutes and 180 days.");
      return;
    }
    if (allBlocksQuery.isLoading && !allBlocksQuery.data) {
      notify("Existing unavailable time is still loading. Try again in a moment.");
      return;
    }
    if (allBlocksQuery.isError) {
      notify("Could not check existing unavailable time. Try again.");
      return;
    }
    const overlapsExisting = allBlocks.some((block) => {
      const existingStart = new Date(block.startAt).getTime();
      const existingEnd = new Date(block.endAt).getTime();
      return !Number.isNaN(existingStart) && !Number.isNaN(existingEnd) && start < existingEnd && end > existingStart;
    });
    if (overlapsExisting) {
      notify("This unavailable time overlaps an existing unavailable time.");
      return;
    }
    createBlock.mutate();
  }

  function onRangeSubmit(event: FormEvent) {
    event.preventDefault();
    setRange(rangeDraft);
  }

  function resetRange() {
    const emptyRange = { from: "", to: "" };
    setRangeDraft(emptyRange);
    setRange(emptyRange);
  }

  function ruleForDay(dayOfWeek: number) {
    return rules.find((rule) => rule.dayOfWeek === dayOfWeek);
  }

  function toggleWorkingDay(dayOfWeek: number, enabled: boolean) {
    setHoursError("");
    if (!enabled) {
      setRules((current) => current.filter((rule) => rule.dayOfWeek !== dayOfWeek));
      return;
    }
    setRules((current) => [
      ...current,
      { dayOfWeek, startLocal: "09:00", endLocal: "17:00", timezone }
    ].sort((a, b) => a.dayOfWeek - b.dayOfWeek));
  }

  function updateWorkingDay(dayOfWeek: number, patch: Partial<WorkingHoursRule>) {
    setHoursError("");
    setRules((current) => {
      const exists = current.some((rule) => rule.dayOfWeek === dayOfWeek);
      if (!exists) {
        return [
          ...current,
          { dayOfWeek, startLocal: "09:00", endLocal: "17:00", timezone, ...patch }
        ].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
      }
      return current.map((rule) => rule.dayOfWeek === dayOfWeek ? { ...rule, ...patch } : rule);
    });
  }

  function onSaveHours() {
    const invalidRule = rules.find((rule) => !rule.startLocal || !rule.endLocal || rule.endLocal <= rule.startLocal);
    if (!rules.length) {
      setHoursError("Choose at least one working day.");
      return;
    }
    if (invalidRule) {
      setHoursError("Each working day needs a valid start and end time.");
      return;
    }
    setHoursError("");
    saveHours.mutate();
  }

  function selectTimezone(nextTimezone: string) {
    setTimezone(nextTimezone);
    setRules((current) => current.map((rule) => ({ ...rule, timezone: nextTimezone })));
    setShowTimezoneOptions(false);
  }

  return (
    <div className="stack availability-page">
      <section className="dashboard-hero availability-hero">
        <div>
          <h1>{resourceLabel}</h1>
          <p className="muted">Set weekly bookable hours and keep unavailable time out of the schedule.</p>
        </div>
      </section>

      <ErrorMessage message={availabilityQuery.error ? getFriendlyError(availabilityQuery.error) : undefined} />
      <ErrorMessage message={blocksQuery.error ? getFriendlyError(blocksQuery.error) : undefined} />

      <div className="availability-layout">
        <main className="availability-main">
          <section className="panel availability-section">
            <div className="chart-title availability-section-head">
              <div>
                <h2>Working hours</h2>
                <span className="inline-muted">{timezone} time used in your working hours.</span>
              </div>
              {canEditHours && (
                <button type="button" className="secondary" onClick={() => setShowHoursEditor((value) => !value)}>
                  <Settings size={15} />
                  {showHoursEditor ? "Close editor" : "Edit hours"}
                </button>
              )}
            </div>
            {showHoursEditor ? (
              <div className="working-hours-editor">
                <label className="working-hours-timezone">
                  <span>Timezone</span>
                  <span
                    className="availability-select-wrap"
                    onBlur={(event) => {
                      const nextTarget = event.relatedTarget;
                      if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                        setShowTimezoneOptions(false);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setShowTimezoneOptions(false);
                    }}
                  >
                    <button
                      type="button"
                      className="availability-timezone-trigger"
                      aria-expanded={showTimezoneOptions}
                      onClick={() => setShowTimezoneOptions((open) => !open)}
                    >
                      <span>
                        <strong>{selectedTimezone.label}</strong>
                        <small>{selectedTimezone.value}</small>
                      </span>
                      <ChevronDown size={15} />
                    </button>
                    {showTimezoneOptions && (
                      <div className="availability-timezone-menu">
                        {australiaTimezones.map((item) => (
                          <button
                            type="button"
                            key={item.value}
                            className={item.value === timezone ? "selected" : ""}
                            onClick={() => selectTimezone(item.value)}
                          >
                            <span>
                              <strong>{item.label}</strong>
                              <small>{item.value}</small>
                            </span>
                            {item.value === timezone && <Check size={14} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                </label>
                <div className="working-hours-editor-grid">
                  {dayNumbers.map((dayOfWeek) => {
                    const rule = ruleForDay(dayOfWeek);
                    const enabled = Boolean(rule);
                    return (
                      <div className="working-hours-editor-row" key={dayOfWeek}>
                        <label className="working-hours-day-toggle">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(event) => toggleWorkingDay(dayOfWeek, event.target.checked)}
                          />
                          <span>{dayLabel(dayOfWeek)}</span>
                        </label>
                        <input
                          type="time"
                          disabled={!enabled}
                          value={rule?.startLocal ?? "09:00"}
                          onChange={(event) => updateWorkingDay(dayOfWeek, { startLocal: event.target.value })}
                        />
                        <input
                          type="time"
                          disabled={!enabled}
                          value={rule?.endLocal ?? "17:00"}
                          onChange={(event) => updateWorkingDay(dayOfWeek, { endLocal: event.target.value })}
                        />
                      </div>
                    );
                  })}
                </div>
                <button type="button" disabled={saveHours.isPending} onClick={onSaveHours}>
                  {saveHours.isPending ? <Loader2 size={16} className="spin-icon" /> : <CheckCircle2 size={16} />}
                  Save working hours
                </button>
              </div>
            ) : !workingHours.length ? (
              <div className="ticket-detail-empty">No working hours returned.</div>
            ) : (
              <div className="working-hours-grid">
                {sortedRules.map((rule) => (
                  <div className="working-hour-card" key={`${rule.dayOfWeek}-${rule.startLocal}-${rule.endLocal}`}>
                    <span>{dayLabel(rule.dayOfWeek)}</span>
                    <strong>{rule.startLocal} - {rule.endLocal}</strong>
                  </div>
                ))}
              </div>
            )}
            <ErrorMessage message={hoursError || (saveHours.error ? getFriendlyError(saveHours.error) : undefined)} />
          </section>

          <section className="panel availability-section">
            <div className="ticket-detail-section-title compact">
              <span><Ban size={17} /></span>
              <div>
                <h2>Unavailable time</h2>
                <p>Filter applies to unavailable time only.</p>
              </div>
            </div>

            <div className="availability-block-panel">
              {showBlockForm ? (
                <form className="availability-block-form" onSubmit={onSubmit}>
                  <div className="availability-block-form-header">
                    <div>
                      <strong>Add unavailable time</strong>
                      <span>Mark a period that should not be scheduled.</span>
                    </div>
                    <button type="button" className="secondary" onClick={() => setShowBlockForm(false)}>
                      <X size={15} />
                      Close
                    </button>
                  </div>
                  <p className="availability-block-rule">Choose a future period from 30 minutes to 180 days.</p>
                  <label>
                    <span>Start</span>
                    <input required type="datetime-local" min={futureDateTimeMin} value={form.startAt} onChange={(event) => setForm({ ...form, startAt: event.target.value })} />
                  </label>
                  <label>
                    <span>End</span>
                    <input required type="datetime-local" min={blockEndMin} max={blockEndMax} value={form.endAt} onChange={(event) => setForm({ ...form, endAt: event.target.value })} />
                  </label>
                  <label>
                    <span>Reason</span>
                    <input required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
                  </label>
                  <button type="submit" disabled={createBlock.isPending}>
                    {createBlock.isPending ? <Loader2 size={16} className="spin-icon" /> : <CheckCircle2 size={16} />}
                    Confirm
                  </button>
                </form>
              ) : (
                <>
                  <div className="ticket-filter-header availability-filter-header">
                    <div>
                      <h2><SlidersHorizontal size={16} />Filters</h2>
                      <p>Refine unavailable time by start and end window.</p>
                    </div>
                    <button type="button" className="secondary availability-add-block" onClick={() => setShowBlockForm(true)}>
                      <Plus size={15} />
                      Add unavailable time
                    </button>
                  </div>
                  <div className="availability-block-controls">
                    <form className="availability-filter-form" onSubmit={onRangeSubmit}>
                      <label>
                        <span><CalendarRange size={14} />From</span>
                        <input type="datetime-local" value={rangeDraft.from} onChange={(event) => setRangeDraft({ ...rangeDraft, from: event.target.value })} />
                      </label>
                      <label>
                        <span><Clock3 size={14} />To</span>
                        <input type="datetime-local" value={rangeDraft.to} onChange={(event) => setRangeDraft({ ...rangeDraft, to: event.target.value })} />
                      </label>
                      <div className="availability-filter-actions">
                        <button type="button" className="ticket-reset-button" onClick={resetRange}><RotateCcw size={15} />Reset</button>
                        <button type="submit" className="ticket-apply-button"><Filter size={15} />Apply</button>
                      </div>
                    </form>
                  </div>
                </>
              )}
            </div>
            <ErrorMessage message={formError || (createBlock.error ? getFriendlyError(createBlock.error) : undefined)} />
            <ErrorMessage message={deleteBlock.error ? getFriendlyError(deleteBlock.error) : undefined} />
            {!blocks.length ? (
              <div className="ticket-detail-empty">No unavailable time in this window.</div>
            ) : (
              <div className="availability-block-list">
                {visibleBlocks.map((block) => (
                  <div className="availability-block-item" key={block.id}>
                    <div>
                      <strong>{formatDateTime(block.startAt)}</strong>
                      <small>{formatDateTime(block.endAt)}</small>
                      <span>{block.reason || "Unavailable time"}</span>
                    </div>
                    <button
                      type="button"
                      className="availability-delete-block"
                      aria-label="Delete unavailable time"
                      title="Delete unavailable time"
                      disabled={deleteBlock.isPending}
                      onClick={() => deleteBlock.mutate({ blockId: block.id, version: block.version })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>

        <aside className="availability-sidebar">
          <section className="panel availability-section">
            <div className="ticket-detail-section-title compact">
              <span><CalendarClock size={17} /></span>
              <div>
                <h2>Upcoming appointments</h2>
                <p>Next scheduled work for this resource.</p>
              </div>
            </div>
            {!appointments.length ? (
              <div className="ticket-detail-empty">No upcoming appointments.</div>
            ) : (
              <div className="availability-appointment-list">
                {visibleAppointments.map((item) => (
                  <Link className="availability-appointment-item" to={`/appointments/${item.id}`} key={item.id}>
                    <span>
                      <strong>{formatDateTime(item.startAt)}</strong>
                      <small>{appointmentTitle(item)}</small>
                    </span>
                    <StatusBadge value={item.status} />
                  </Link>
                ))}
              </div>
            )}
            <Link className="chart-link availability-sidebar-link" to="/appointments">
              Open schedule <ArrowRight size={14} />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
