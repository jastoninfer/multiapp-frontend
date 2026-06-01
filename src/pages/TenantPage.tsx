import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Building2, CheckCircle2, Loader2, Pencil, Plus, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { createTenant, getTenant, listAdminTenants, transitionTenant, updateTenant } from "../api/tenant";
import { getFriendlyError } from "../api/client";
import { isAdmin, isPlatformAdmin } from "../auth/authorization";
import { ErrorMessage } from "../components/ErrorMessage";
import { ForbiddenMessage } from "../components/ForbiddenMessage";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../auth/AuthContext";
import { useCurrentTenant } from "../hooks/useCurrentTenant";
import { queryKeys } from "../queryKeys";
import { TenantResponse } from "../types";
import { formatDate } from "../ui/format";

type TenantActionMode = "edit" | "create" | null;
const tenantNamePattern = /^[\p{L}\p{N}](?:[\p{L}\p{N} .,&()'\-_/]*[\p{L}\p{N}])?$/u;
const tenantNameHelp = "Use 1-50 characters. Start and end with a letter or number. Spaces and . , & ( ) ' - _ / are allowed.";

function normalizeTenantName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function validateTenantName(value: string) {
  const normalized = normalizeTenantName(value);
  if (!normalized) return "Tenant name is required.";
  if (normalized.length > 50) return "Tenant name must be 50 characters or fewer.";
  if (!tenantNamePattern.test(normalized)) return tenantNameHelp;
  return "";
}

function isProtectedTenant(tenant?: Pick<TenantResponse, "name"> | null) {
  return tenant?.name === "__platform_admin";
}

function TenantStatusChip({ status }: { status: string }) {
  const active = status === "ACTIVE";
  const Icon = active ? ShieldCheck : TriangleAlert;
  return (
    <span className={`tenant-status-chip${active ? "" : " suspended"}`}>
      <Icon size={14} />
      {status}
    </span>
  );
}

export function TenantPage() {
  const { tenantId, updateTenantId } = useAuth();
  const { profile, currentTenant, tenants: memberships } = useCurrentTenant();
  const authz = { me: profile, tenant: currentTenant };
  const queryClient = useQueryClient();
  const platformAdmin = isPlatformAdmin(profile, memberships);
  const platformTenantId = memberships.find((tenantMembership) => tenantMembership.name === "__platform_admin")?.tenantId;
  const selectedPlatformTenant = isProtectedTenant(currentTenant);
  const showTenantList = Boolean(platformAdmin && selectedPlatformTenant && platformTenantId);
  const canManageCurrentTenant = isAdmin(authz) || platformAdmin;
  const [actionMode, setActionMode] = useState<TenantActionMode>(null);
  const [tenantName, setTenantName] = useState("");
  const [newTenantName, setNewTenantName] = useState("");
  const [tenantNameError, setTenantNameError] = useState("");
  const [newTenantNameError, setNewTenantNameError] = useState("");
  const [confirmSuspendTenant, setConfirmSuspendTenant] = useState<TenantResponse | null>(null);

  const tenant = useQuery({
    queryKey: queryKeys.tenant(tenantId),
    queryFn: getTenant,
    enabled: Boolean(tenantId && canManageCurrentTenant && !showTenantList)
  });
  const adminTenants = useQuery({
    queryKey: queryKeys.adminTenants({ page: 0 }),
    queryFn: listAdminTenants,
    enabled: showTenantList
  });

  useEffect(() => {
    if (tenant.data) setTenantName(tenant.data.name);
  }, [tenant.data]);

  const refreshTenantData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.tenant(tenantId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.adminTenants({ page: 0 }) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.me })
    ]);
  };

  const patch = useMutation({
    mutationFn: (nextName: string) => updateTenant({ name: nextName }),
    onSuccess: async () => {
      setActionMode(null);
      await refreshTenantData();
    }
  });
  const tenantTransition = useMutation({
    mutationFn: (payload: { targetTenantId: string; fromStatus: string; toStatus: string }) =>
      transitionTenant({
        fromStatus: payload.fromStatus,
        toStatus: payload.toStatus,
        requestTenantId: platformTenantId,
        targetTenantId: payload.targetTenantId
      }),
    onSuccess: async () => {
      setConfirmSuspendTenant(null);
      await refreshTenantData();
    }
  });
  const create = useMutation({
    mutationFn: (nextName: string) => createTenant(nextName),
    onSuccess: async () => {
      setNewTenantName("");
      setActionMode(null);
      await refreshTenantData();
    }
  });

  if (!canManageCurrentTenant) {
    return <ForbiddenMessage message="Tenant settings are visible to tenant admins and platform admins." />;
  }

  function openEdit() {
    setTenantName(tenant.data?.name ?? "");
    setNewTenantName("");
    setActionMode("edit");
    setTenantNameError("");
  }

  function openCreate() {
    setTenantName(tenant.data?.name ?? "");
    setNewTenantName("");
    setConfirmSuspendTenant(null);
    setNewTenantNameError("");
    setActionMode("create");
  }

  function closeActionPanel() {
    setTenantName(tenant.data?.name ?? "");
    setNewTenantName("");
    setTenantNameError("");
    setNewTenantNameError("");
    setActionMode(null);
  }

  function onUpdateTenant(event: FormEvent) {
    event.preventDefault();
    const validationError = validateTenantName(tenantName);
    if (validationError) {
      setTenantNameError(validationError);
      return;
    }
    const normalized = normalizeTenantName(tenantName);
    setTenantName(normalized);
    patch.mutate(normalized);
  }

  function onCreateTenant(event: FormEvent) {
    event.preventDefault();
    const validationError = validateTenantName(newTenantName);
    if (validationError) {
      setNewTenantNameError(validationError);
      return;
    }
    const normalized = normalizeTenantName(newTenantName);
    setNewTenantName(normalized);
    create.mutate(normalized);
  }

  function onSelectTenant(nextTenantId: string) {
    closeActionPanel();
    setConfirmSuspendTenant(null);
    updateTenantId(nextTenantId);
    queryClient.invalidateQueries();
  }

  function onTenantTransition(item: TenantResponse, toStatus: string) {
    tenantTransition.mutate({ targetTenantId: item.id, fromStatus: item.status, toStatus });
  }

  return (
    <div className="stack tenant-page">
      {!showTenantList && (
        <section className="panel">
          <div className="section-heading tenant-page-heading">
            <div>
              <h1>Tenant</h1>
              <p className="muted">Review the current tenant and keep its display name up to date.</p>
            </div>
          </div>
          <ErrorMessage message={tenant.error ? getFriendlyError(tenant.error) : undefined} />
          {tenant.isLoading ? (
            <div className="ticket-loading-state">
              <Loader2 size={18} className="spin-icon" />
              Loading tenant...
            </div>
          ) : tenant.data && (
            <div className="tenant-summary-card">
              <div className="ticket-detail-section-title compact tenant-summary-title">
                <span><Building2 size={17} /></span>
                <div>
                  <h2>{tenant.data.name}</h2>
                  <p>Current tenant settings and account status.</p>
                  <small className="tenant-created-text">Created {formatDate(tenant.data.createdAt)}</small>
                </div>
              </div>
              <div className="tenant-summary-actions">
                <TenantStatusChip status={tenant.data.status} />
                {!actionMode && (
                  <button type="button" className="secondary" onClick={openEdit}>
                    <Pencil size={15} />
                    Rename tenant
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {actionMode && (!showTenantList || actionMode === "create") && (
        <section className="filter-panel ticket-filter-panel tenant-action-panel">
          {actionMode === "edit" ? (
            <form onSubmit={onUpdateTenant}>
              <div className="ticket-filter-header">
                <div>
                  <h2><Pencil size={16} />Rename tenant</h2>
                  <p>Give the current tenant a new display name.</p>
                </div>
              </div>
              <label className="ticket-filter-field">
                <span className="ticket-filter-label"><Building2 size={14} />Tenant name</span>
                <span className="ticket-filter-control tenant-name-control">
                  <input
                    required
                    maxLength={50}
                    aria-invalid={Boolean(tenantNameError)}
                    value={tenantName}
                    onChange={(event) => {
                      setTenantName(event.target.value);
                      if (tenantNameError) setTenantNameError("");
                    }}
                  />
                </span>
                <small className={tenantNameError ? "tenant-name-error" : "tenant-name-help"}>
                  {tenantNameError || tenantNameHelp}
                </small>
              </label>
              <div className="filter-actions ticket-filter-actions">
                <button type="button" className="ticket-reset-button" onClick={closeActionPanel}>
                  <RotateCcw size={15} />
                  Cancel
                </button>
                <button type="submit" className="ticket-apply-button" disabled={patch.isPending || !tenantName.trim()}>
                  {patch.isPending ? <Loader2 size={15} className="spin-icon" /> : <CheckCircle2 size={15} />}
                  Save
                </button>
              </div>
              <ErrorMessage message={patch.error ? getFriendlyError(patch.error) : undefined} />
            </form>
          ) : (
            <form onSubmit={onCreateTenant}>
              <div className="ticket-filter-header">
                <div>
                  <h2><Plus size={16} />Add tenant</h2>
                  <p>Create a new tenant record and add it to the tenant list.</p>
                </div>
              </div>
              <label className="ticket-filter-field">
                <span className="ticket-filter-label"><Building2 size={14} />Tenant name</span>
                <span className="ticket-filter-control tenant-name-control">
                  <input
                    required
                    maxLength={50}
                    aria-invalid={Boolean(newTenantNameError)}
                    value={newTenantName}
                    onChange={(event) => {
                      setNewTenantName(event.target.value);
                      if (newTenantNameError) setNewTenantNameError("");
                    }}
                    placeholder="Tenant name"
                  />
                </span>
                <small className={newTenantNameError ? "tenant-name-error" : "tenant-name-help"}>
                  {newTenantNameError || tenantNameHelp}
                </small>
              </label>
              <div className="filter-actions ticket-filter-actions">
                <button type="button" className="ticket-reset-button" onClick={closeActionPanel}>
                  <RotateCcw size={15} />
                  Cancel
                </button>
                <button type="submit" className="ticket-apply-button" disabled={create.isPending || !newTenantName.trim()}>
                  {create.isPending ? <Loader2 size={15} className="spin-icon" /> : <Plus size={15} />}
                  Create
                </button>
              </div>
              <ErrorMessage message={create.error ? getFriendlyError(create.error) : undefined} />
            </form>
          )}
        </section>
      )}

      {showTenantList && (
        <section className="panel tenant-list-panel">
          <div className="section-heading">
            <div>
              <h1>Tenants</h1>
              <p className="muted">Manage tenant records from the protected platform workspace.</p>
            </div>
            <button type="button" className="secondary" onClick={openCreate}>
              <Plus size={16} />
              Add tenant
            </button>
          </div>
          <ErrorMessage message={adminTenants.error ? getFriendlyError(adminTenants.error) : undefined} />
          <ErrorMessage message={tenantTransition.error ? getFriendlyError(tenantTransition.error) : undefined} />
          {adminTenants.isLoading ? (
            <div className="ticket-loading-state">
              <Loader2 size={18} className="spin-icon" />
              Loading tenants...
            </div>
          ) : !adminTenants.data?.items.length ? (
            <div className="empty-state member-empty-state">
              <Building2 size={22} />
              <span>No tenants found.</span>
            </div>
          ) : (
            <div className="member-table-wrap">
              <table className="member-table tenant-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th className="tenant-action-th">Tenant action</th>
                  </tr>
                </thead>
                <tbody>
                  {adminTenants.data.items.map((item) => {
                    const protectedTenant = isProtectedTenant(item);
                    const nextStatus = item.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
                    const pending = tenantTransition.isPending && tenantTransition.variables?.targetTenantId === item.id;
                    const canOpenTenant = !protectedTenant && item.status !== "SUSPENDED";
                    return (
                      <tr key={item.id} className={protectedTenant ? "tenant-protected-row" : undefined}>
                        <td>
                          <span className="tenant-name-cell">
                            {canOpenTenant ? (
                              <button type="button" className="tenant-name-link" onClick={() => onSelectTenant(item.id)}>
                                {item.name}
                              </button>
                            ) : (
                              <span className={protectedTenant ? "tenant-protected-name" : "tenant-readonly-name"}>
                                {item.name}
                              </span>
                            )}
                            {protectedTenant && (
                              <span className="tenant-protected-badge">
                                <ShieldCheck size={13} />
                                Protected tenant
                              </span>
                            )}
                          </span>
                        </td>
                        <td><StatusBadge value={item.status} /></td>
                        <td className="member-table-muted">{formatDate(item.createdAt)}</td>
                        <td className="tenant-action-cell">
                          {!protectedTenant && (
                            <span className="tenant-row-actions">
                              {nextStatus === "ACTIVE" ? (
                                <button
                                  type="button"
                                  className="secondary"
                                  disabled={pending}
                                  onClick={() => onTenantTransition(item, "ACTIVE")}
                                >
                                  {pending ? <Loader2 size={15} className="spin-icon" /> : <CheckCircle2 size={15} />}
                                  Activate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="tenant-suspend-button"
                                  disabled={tenantTransition.isPending}
                                  onClick={() => setConfirmSuspendTenant(item)}
                                >
                                  <Ban size={15} />
                                  Suspend
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {confirmSuspendTenant && (
        <div className="tenant-dialog-backdrop" role="presentation">
          <section className="tenant-dialog" role="dialog" aria-modal="true" aria-labelledby="tenant-suspend-title">
            <div className="ticket-detail-section-title compact">
              <span><Ban size={17} /></span>
              <div>
                <h2 id="tenant-suspend-title">Suspend tenant?</h2>
                <p>{confirmSuspendTenant.name} will no longer be available for normal workspace reads.</p>
              </div>
            </div>
            <div className="tenant-dialog-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setConfirmSuspendTenant(null)}
                disabled={tenantTransition.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="member-danger-button"
                disabled={tenantTransition.isPending}
                onClick={() => onTenantTransition(confirmSuspendTenant, "SUSPENDED")}
              >
                {tenantTransition.isPending ? <Loader2 size={15} className="spin-icon" /> : <Ban size={15} />}
                Confirm suspend
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
