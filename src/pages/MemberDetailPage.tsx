import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Loader2,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserRound,
  Users,
  XCircle
} from "lucide-react";
import { getFriendlyError } from "../api/client";
import { getMember, removeMember, updateMember } from "../api/members";
import { transitionUser } from "../api/tenant";
import { isAdmin, isAgentOrAdmin, isPlatformAdmin } from "../auth/authorization";
import { useAuth } from "../auth/AuthContext";
import { ErrorMessage } from "../components/ErrorMessage";
import { ForbiddenMessage } from "../components/ForbiddenMessage";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ToastProvider";
import { useCurrentTenant } from "../hooks/useCurrentTenant";
import { queryKeys } from "../queryKeys";
import { TenantRole } from "../types";
import { compactId, formatDate } from "../ui/format";

const roleOptions = [
  { value: "CUSTOMER", label: "Customer", detail: "Requester access" },
  { value: "AGENT", label: "Agent", detail: "Staff queue access" },
  { value: "ADMIN", label: "Admin", detail: "Tenant administration" },
  { value: "RESOURCE_USER", label: "Resource user", detail: "Bookable work resource" }
];

function MemberRoleDropdown({
  value,
  onChange
}: {
  value: TenantRole;
  onChange: (value: TenantRole) => void;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const selected = roleOptions.find((option) => option.value === value) ?? roleOptions[0];

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
    <div className={`ticket-dropdown member-role-dropdown${open ? " open" : ""}`} ref={dropdownRef}>
      <button
        type="button"
        className="ticket-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="ticket-dropdown-trigger-main">
          <Users size={16} />
          <span>{selected.label}</span>
        </span>
        <ChevronDown size={16} className="ticket-dropdown-chevron" />
      </button>
      {open && (
        <div className="ticket-dropdown-menu" role="listbox" aria-label="New role">
          {roleOptions.map((option) => {
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
  );
}

export function MemberDetailPage() {
  const { userId = "" } = useParams();
  const { tenantId } = useAuth();
  const { profile, currentTenant, tenants } = useCurrentTenant();
  const authz = { me: profile, tenant: currentTenant };
  const platformAdmin = isPlatformAdmin(profile, tenants);
  const canView = isAgentOrAdmin(authz);
  const canManageRole = isAdmin(authz) || platformAdmin;
  const canRemoveMember = isAdmin(authz) || platformAdmin;
  const canTransitionUser = platformAdmin;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [roleDraft, setRoleDraft] = useState<TenantRole>("CUSTOMER");
  const [confirmTransition, setConfirmTransition] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [copiedUserId, setCopiedUserId] = useState(false);

  const memberQuery = useQuery({
    queryKey: queryKeys.member(tenantId, userId),
    queryFn: () => getMember(userId),
    enabled: Boolean(tenantId && userId && canView)
  });
  const member = memberQuery.data?.data;
  const viewingSelf = Boolean(profile?.userId && member?.userId === profile.userId);
  const nextStatus = member?.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
  const transitionLabel = nextStatus === "DISABLED" ? "Disable user" : "Enable user";

  useEffect(() => {
    if (member?.role) setRoleDraft(member.role);
  }, [member?.role]);

  const invalidateMember = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.member(tenantId, userId) }),
      queryClient.invalidateQueries({ queryKey: ["members", tenantId] })
    ]);
  };

  const updateRole = useMutation({
    mutationFn: () => {
      if (!member) throw new Error("Member is not loaded.");
      return updateMember(member.userId, `"${member.version}"`, roleDraft);
    },
    onSuccess: async () => {
      notify("Member role updated.");
      await invalidateMember();
    }
  });

  const userTransition = useMutation({
    mutationFn: () => {
      if (!member) throw new Error("Member is not loaded.");
      return transitionUser(member.userId, member.status, nextStatus);
    },
    onSuccess: async () => {
      notify(nextStatus === "DISABLED" ? "User disabled." : "User enabled.");
      setConfirmTransition(false);
      await invalidateMember();
    }
  });

  const remove = useMutation({
    mutationFn: () => {
      if (!member) throw new Error("Member is not loaded.");
      return removeMember(member.userId, member.version);
    },
    onSuccess: async () => {
      notify("Member removed from tenant.");
      await queryClient.invalidateQueries({ queryKey: ["members", tenantId] });
      navigate("/members");
    }
  });

  if (!canView) return <ForbiddenMessage message="Members are visible to tenant admins, agents, and platform admins." />;

  function onRoleSubmit(event: FormEvent) {
    event.preventDefault();
    updateRole.mutate();
  }

  async function copyUserId() {
    if (!member?.userId) return;
    try {
      await navigator.clipboard.writeText(member.userId);
      setCopiedUserId(true);
      notify("User ID copied.");
      window.setTimeout(() => setCopiedUserId(false), 1400);
    } catch {
      notify("Could not copy User ID.");
    }
  }

  return (
    <div className="stack member-detail-page">
      <section className="dashboard-hero ticket-detail-hero member-detail-hero">
        <div>
          <Link className="chart-link member-back-link" to="/members">
            <ArrowLeft size={14} />
            Members
          </Link>
          <h1>{member?.displayName || "Member profile"}</h1>
          <p className="muted">{member?.email || "Tenant member details and access controls."}</p>
        </div>
        {member && (
          <div className="ticket-detail-badges">
            <span className="ticket-hero-chip"><Users size={14} />{member.role}</span>
            <span className="ticket-hero-chip"><ShieldCheck size={14} />{member.status}</span>
          </div>
        )}
      </section>

      <ErrorMessage message={memberQuery.error ? getFriendlyError(memberQuery.error) : undefined} />
      {memberQuery.isLoading ? (
        <div className="ticket-loading-state">
          <Loader2 size={18} className="spin-icon" />
          Loading member...
        </div>
      ) : member && (
        <div className="ticket-detail-layout member-detail-layout">
          <main className="ticket-detail-main">
            <section className="panel">
              <div className="ticket-detail-section-title compact">
                <span><UserRound size={17} /></span>
                <div>
                  <h2>Member details</h2>
                  <p>Core identity and tenant membership information.</p>
                </div>
              </div>
              <div className="member-detail-grid">
                <div className="member-detail-item">
                  <small>Name</small>
                  <strong>{member.displayName || "-"}</strong>
                </div>
                <div className="member-detail-item">
                  <small>Email</small>
                  <strong>{member.email || "-"}</strong>
                </div>
                <div className="member-detail-item">
                  <small>User ID</small>
                  <span className="member-id-row">
                    <strong title={member.userId}>{compactId(member.userId)}</strong>
                    <button type="button" className="secondary member-copy-id-button" onClick={copyUserId}>
                      {copiedUserId ? <Check size={13} /> : <Copy size={13} />}
                      {copiedUserId ? "Copied" : "Copy"}
                    </button>
                  </span>
                </div>
                <div className="member-detail-item">
                  <small>Created</small>
                  <strong>{formatDate(member.createdAt)}</strong>
                </div>
                <div className="member-detail-item">
                  <small>Default tenant</small>
                  <strong>{member.isDefault ? "Yes" : "No"}</strong>
                </div>
              </div>
            </section>
          </main>

          <aside className="ticket-detail-sidebar">
            <section className="panel ticket-detail-side-card">
              <div className="ticket-detail-section-title compact">
                <span><Users size={17} /></span>
                <div>
                  <h2>Tenant role</h2>
                  <p>{canManageRole ? "Update this member's tenant role." : "Current role in this tenant."}</p>
                </div>
              </div>
              <div className="member-status-stack">
                <span><small>Current role</small><StatusBadge value={member.role} /></span>
                {viewingSelf ? (
                  <p className="member-self-protection-note">You cannot change your own tenant role.</p>
                ) : canManageRole ? (
                  <form className="member-role-form" onSubmit={onRoleSubmit}>
                    <label>
                      <span>New role</span>
                      <MemberRoleDropdown value={roleDraft} onChange={setRoleDraft} />
                    </label>
                    <button type="submit" disabled={updateRole.isPending || roleDraft === member.role}>
                      {updateRole.isPending ? <Loader2 size={16} className="spin-icon" /> : <CheckCircle2 size={16} />}
                      Save role
                    </button>
                  </form>
                ) : null}
              </div>
              <ErrorMessage message={updateRole.error ? getFriendlyError(updateRole.error, "This member was modified by someone else. Refresh and retry.") : undefined} />
            </section>

            <section className="panel ticket-detail-side-card">
              <div className="ticket-detail-section-title compact">
                <span><ShieldOff size={17} /></span>
                <div>
                  <h2>User access</h2>
                  <p>{canTransitionUser ? "Manage this user's account access." : "Current account access."}</p>
                </div>
              </div>
              <div className="member-status-stack">
                <span><small>Current status</small><StatusBadge value={member.status} /></span>
                {canTransitionUser ? (
                  viewingSelf ? (
                    <p className="member-self-protection-note">You cannot change your own account access.</p>
                  ) : nextStatus === "DISABLED" && confirmTransition ? (
                      <div className="member-confirm-panel">
                        <p>{transitionLabel} for this user account?</p>
                        <div>
                          <button type="button" className="member-danger-button" disabled={userTransition.isPending} onClick={() => userTransition.mutate()}>
                            {userTransition.isPending ? <Loader2 size={16} className="spin-icon" /> : <XCircle size={16} />}
                            Confirm
                          </button>
                          <button type="button" className="secondary" onClick={() => setConfirmTransition(false)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={`secondary ticket-transition-button${nextStatus === "ACTIVE" ? " member-enable-access-button" : ""}`}
                        disabled={userTransition.isPending}
                        onClick={() => nextStatus === "DISABLED" ? setConfirmTransition(true) : userTransition.mutate()}
                      >
                        {userTransition.isPending ? (
                          <Loader2 size={16} className="spin-icon" />
                        ) : nextStatus === "DISABLED" ? (
                          <ShieldOff size={16} />
                        ) : (
                          <ShieldCheck size={16} />
                        )}
                        <span>
                          <strong>{transitionLabel}</strong>
                          <small>{nextStatus === "DISABLED" ? "Prevent this user from accessing the product." : "Restore access for this user."}</small>
                        </span>
                      </button>
                    )
                ) : null}
              </div>
              <ErrorMessage message={userTransition.error ? getFriendlyError(userTransition.error) : undefined} />
            </section>

            {canRemoveMember && (
              <section className="panel ticket-detail-side-card">
                <div className="ticket-detail-section-title compact">
                  <span><Trash2 size={17} /></span>
                  <div>
                    <h2>Tenant membership</h2>
                    <p>Remove this user from the current tenant.</p>
                  </div>
                </div>
                {viewingSelf ? (
                  <p className="member-self-protection-note">You cannot remove yourself from this tenant.</p>
                ) : confirmRemove ? (
                  <div className="member-confirm-panel">
                    <p>Remove this member from the tenant?</p>
                    <div>
                      <button type="button" className="member-danger-button" disabled={remove.isPending} onClick={() => remove.mutate()}>
                        {remove.isPending ? <Loader2 size={16} className="spin-icon" /> : <Trash2 size={16} />}
                        Confirm
                      </button>
                      <button type="button" className="secondary" onClick={() => setConfirmRemove(false)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="member-remove-membership-button" onClick={() => setConfirmRemove(true)}>
                    <Trash2 size={16} />
                    Remove from tenant
                  </button>
                )}
                <ErrorMessage message={remove.error ? getFriendlyError(remove.error) : undefined} />
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
