import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  Copy,
  Fingerprint,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  Phone,
  RotateCcw,
  ShieldCheck,
  UserRound,
  Users
} from "lucide-react";
import { claimContact } from "../api/contacts";
import { getFriendlyError } from "../api/client";
import { setDefaultTenant } from "../api/me";
import { isPlatformAdmin } from "../auth/authorization";
import { useAuth } from "../auth/AuthContext";
import { ErrorMessage } from "../components/ErrorMessage";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ToastProvider";
import { useCurrentTenant } from "../hooks/useCurrentTenant";
import { queryKeys } from "../queryKeys";

const initialClaimForm = { code: "", email: "", phone: "" };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9]\d{7,14}$/;
const contactMethodHelp = "Provide at least one contact method. Email must be a valid address; phone must use E.164 format, for example +61412345678.";

function validateClaim(form: typeof initialClaimForm) {
  const code = form.code.trim();
  const email = form.email.trim();
  const phone = form.phone.trim();
  if (!code) return "Enter the claim code.";
  if (!email && !phone) return "Provide either email or phone to match the contact.";
  if (email && !emailPattern.test(email)) return "Email must be a valid address.";
  if (phone && !phonePattern.test(phone)) return "Phone must use E.164 format, for example +61412345678.";
  return "";
}

export function MePage() {
  const { tenantId, updateTenantId } = useAuth();
  const { meQuery, tenantsQuery, profile, tenants } = useCurrentTenant();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const me = profile;
  const [claim, setClaim] = useState(initialClaimForm);
  const [showClaim, setShowClaim] = useState(false);
  const [copiedUserId, setCopiedUserId] = useState(false);
  const platformAdmin = isPlatformAdmin(me, tenants);

  const defaultTenant = useMutation({
    mutationFn: (nextTenantId: string) => {
      if (!me?.userId) throw new Error("Profile is not loaded.");
      return setDefaultTenant(me.userId, nextTenantId);
    },
    onSuccess: () => {
      notify("Default workspace updated.");
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
    }
  });

  const claimMutation = useMutation({
    mutationFn: () => claimContact({
      code: claim.code.trim(),
      email: claim.email.trim() || undefined,
      phone: claim.phone.trim() || undefined
    }),
    onSuccess: () => {
      notify("Contact linked.");
      setClaim(initialClaimForm);
      setShowClaim(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["contacts", tenantId] });
    }
  });

  function onClaim(event: FormEvent) {
    event.preventDefault();
    const validationError = validateClaim(claim);
    if (validationError) {
      notify(validationError);
      return;
    }
    claimMutation.mutate();
  }

  function cancelClaim() {
    setClaim(initialClaimForm);
    setShowClaim(false);
  }

  async function copyUserId() {
    if (!me?.userId) return;
    try {
      await navigator.clipboard.writeText(me.userId);
      setCopiedUserId(true);
      notify("User ID copied.");
      window.setTimeout(() => setCopiedUserId(false), 1400);
    } catch {
      notify("Could not copy User ID.");
    }
  }

  return (
    <div className="stack profile-page">
      <section className="dashboard-hero profile-hero">
        <div className="dashboard-hero-main">
          <div>
            <h1>My profile</h1>
            <p className="muted">Review your account details, tenant access, and linked external contacts.</p>
          </div>
        </div>
        {!showClaim && (
          <button type="button" className="secondary profile-claim-entry" onClick={() => setShowClaim(true)}>
            <Link2 size={16} />
            Claim contact
          </button>
        )}
      </section>

      <ErrorMessage message={meQuery.error ? getFriendlyError(meQuery.error) : undefined} />

      {showClaim && (
        <section className="filter-panel ticket-filter-panel profile-claim-panel">
          <form onSubmit={onClaim}>
            <div className="ticket-filter-header">
              <div>
                <h2><Link2 size={16} />Claim contact</h2>
                <p>Link an external contact record to your user account using a claim code.</p>
              </div>
            </div>
            <div className="profile-claim-grid">
              <label className="ticket-filter-field">
                <span className="ticket-filter-label"><KeyRound size={14} />Claim code</span>
                <span className="ticket-filter-control">
                  <input required value={claim.code} onChange={(event) => setClaim({ ...claim, code: event.target.value })} />
                </span>
              </label>
              <label className="ticket-filter-field">
                <span className="ticket-filter-label"><Mail size={14} />Email</span>
                <span className="ticket-filter-control">
                  <input type="email" placeholder="name@example.com" value={claim.email} onChange={(event) => setClaim({ ...claim, email: event.target.value })} />
                </span>
              </label>
              <label className="ticket-filter-field">
                <span className="ticket-filter-label"><Phone size={14} />Phone</span>
                <span className="ticket-filter-control">
                  <input placeholder="+61412345678" value={claim.phone} onChange={(event) => setClaim({ ...claim, phone: event.target.value })} />
                </span>
              </label>
              <p className="profile-claim-help">{contactMethodHelp}</p>
            </div>
            <div className="filter-actions ticket-filter-actions">
              <button type="button" className="ticket-reset-button" onClick={cancelClaim}>
                <RotateCcw size={15} />
                Cancel
              </button>
              <button type="submit" className="ticket-apply-button" disabled={claimMutation.isPending}>
                {claimMutation.isPending ? <Loader2 size={15} className="spin-icon" /> : <CheckCircle2 size={15} />}
                Claim
              </button>
            </div>
            <ErrorMessage message={claimMutation.error ? getFriendlyError(claimMutation.error) : undefined} />
          </form>
        </section>
      )}

      {me && (
        <section className="panel">
          <div className="ticket-detail-section-title compact">
            <span><UserRound size={17} /></span>
            <div>
              <h2>Account details</h2>
              <p>Your signed-in identity and account status.</p>
            </div>
          </div>
          <div className="member-detail-grid profile-detail-grid">
            <div className="member-detail-item">
              <small>Name</small>
              <strong>{me.displayName || "-"}</strong>
            </div>
            <div className="member-detail-item">
              <small>Email</small>
              <strong>{me.email || "-"}</strong>
            </div>
            <div className="member-detail-item">
              <small>Phone</small>
              <strong>{me.phone || "-"}</strong>
            </div>
            <div className="member-detail-item">
              <small>Status</small>
              <span className="profile-status-badge"><StatusBadge value={me.status} /></span>
            </div>
            <div className="member-detail-item profile-user-id-item">
              <small>User ID</small>
              <span className="member-id-row profile-id-row">
                <strong title={me.userId}>{me.userId}</strong>
                <button type="button" className="secondary member-copy-id-button" onClick={copyUserId}>
                  {copiedUserId ? <Check size={13} /> : <Copy size={13} />}
                  {copiedUserId ? "Copied" : "Copy"}
                </button>
              </span>
            </div>
            <div className="member-detail-item">
              <small>Platform access</small>
              <strong>{platformAdmin ? "Platform admin" : "Standard user"}</strong>
            </div>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="ticket-detail-section-title compact">
          <span><Users size={17} /></span>
          <div>
            <h2>Tenant memberships</h2>
            <p>Switch between workspaces or choose your default workspace.</p>
          </div>
        </div>
        <ErrorMessage message={tenantsQuery.error ? getFriendlyError(tenantsQuery.error) : undefined} />
        {!tenants.length ? (
          <div className="empty-state member-empty-state">
            <Users size={22} />
            <span>You have not joined any tenant yet.</span>
          </div>
        ) : (
          <div className="member-table-wrap">
            <table className="member-table profile-tenant-table">
              <thead>
                <tr>
                  <th><span className="ticket-th-label"><Fingerprint size={13} />Tenant</span></th>
                  <th><span className="ticket-th-label"><ShieldCheck size={13} />Role</span></th>
                  <th><span className="ticket-th-label"><CheckCircle2 size={13} />Default</span></th>
                  <th><span className="ticket-th-label"><RotateCcw size={13} />Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr key={tenant.tenantId}>
                    <td>
                      <span className="profile-tenant-name">{tenant.name}</span>
                      <small>{tenant.tenantId}</small>
                    </td>
                    <td><StatusBadge value={tenant.role} /></td>
                    <td className="member-table-strong">{tenant.isDefault ? "Yes" : "No"}</td>
                    <td>
                      <div className="profile-table-actions">
                        <button type="button" className="secondary" disabled={tenant.tenantId === tenantId} onClick={() => updateTenantId(tenant.tenantId)}>
                          Switch
                        </button>
                        <button type="button" disabled={tenant.isDefault || defaultTenant.isPending} onClick={() => defaultTenant.mutate(tenant.tenantId)}>
                          Set default
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ErrorMessage message={defaultTenant.error ? getFriendlyError(defaultTenant.error) : undefined} />
      </section>
    </div>
  );
}
