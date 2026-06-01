import { PropsWithChildren, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  Check,
  Clock3,
  Contact,
  Loader2,
  LogOut,
  Menu,
  MoreHorizontal,
  Star,
  Ticket,
  Users,
  Wrench
} from "lucide-react";
import { setDefaultTenant } from "../api/me";
import { LOGOUT_IN_PROGRESS_KEY, useAuth } from "../auth/AuthContext";
import { isAdmin, isAgentOrAdmin, isCustomer, isPlatformAdmin, isResourceUser } from "../auth/authorization";
import { keycloakLogoutUrl } from "../auth/oidc";
import { useCurrentTenant } from "../hooks/useCurrentTenant";
import { queryKeys } from "../queryKeys";
import { getTimeZoneLabel } from "../ui/format";
import multiappLogoUrl from "../assets/multiapp-logo.svg";
import { ErrorMessage } from "./ErrorMessage";

export function Layout({ children }: PropsWithChildren) {
  const { isAuthenticated, tenantId, idToken, updateTenantId, clearSessionStorage, clearAuthIssue, config } = useAuth();
  const { tenantsQuery, profile, currentTenant, tenants } = useCurrentTenant();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const headerRef = useRef<HTMLElement | null>(null);
  const brandRef = useRef<HTMLAnchorElement | null>(null);
  const tenantMenuRef = useRef<HTMLDivElement | null>(null);
  const tenantSwitcherRef = useRef<HTMLDivElement | null>(null);
  const compactNavRef = useRef<HTMLDivElement | null>(null);
  const primaryNavRef = useRef<HTMLElement | null>(null);
  const navContentWidthRef = useRef(0);
  const [tenantMenuOpen, setTenantMenuOpen] = useState(false);
  const [compactNavOpen, setCompactNavOpen] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const me = profile;
  const userId = me?.userId;
  const authz = { me, tenant: currentTenant };
  const platformAdmin = isPlatformAdmin(me, tenants);
  const canViewTickets = isCustomer(authz) || isResourceUser(authz) || isAgentOrAdmin(authz);
  const canViewAppointments = isAgentOrAdmin(authz) || isResourceUser(authz);
  const canViewContacts = isAgentOrAdmin(authz);
  const canViewResources = isAgentOrAdmin(authz);
  const canViewMembers = isAgentOrAdmin(authz);
  const canViewAvailability = isResourceUser(authz) && Boolean(userId);
  const canViewTenant = isAdmin(authz) || platformAdmin;
  const canViewAuditLogs = isAdmin(authz);
  const availabilityPath = userId ? `/resources/${userId}/availability` : "/resources";
  const canCreateTicket = canViewTickets;
  const profileLabel = me?.displayName || me?.email || userId || "Profile";
  const profileInitial = profileLabel.trim().charAt(0).toUpperCase() || "U";
  const hasMoreItems = canViewContacts || canViewMembers || canViewTenant || canViewAuditLogs;
  const selectedTenant = currentTenant ?? tenants.find((tenant) => tenant.tenantId === tenantId);
  const otherTenants = tenants.filter((tenant) => tenant.tenantId !== selectedTenant?.tenantId);
  const timeZoneLabel = getTimeZoneLabel();
  const defaultTenantMutation = useMutation({
    mutationFn: (nextTenantId: string) => {
      if (!me?.userId) throw new Error("Profile is not loaded.");
      return setDefaultTenant(me.userId, nextTenantId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
    }
  });

  function onTenantChange(nextTenantId: string) {
    updateTenantId(nextTenantId);
    queryClient.invalidateQueries();
    navigate("/dashboard");
    setTenantMenuOpen(false);
    setCompactNavOpen(false);
  }

  function onMakeDefault(nextTenantId: string) {
    defaultTenantMutation.mutate(nextTenantId);
  }

  useEffect(() => {
    if (!isAuthenticated || tenantsQuery.isLoading || !tenants.length) return;
    const storedTenantIsValid = tenants.some((tenant) => tenant.tenantId === tenantId);
    if (!tenantId || !storedTenantIsValid) {
      const fallback = tenants.find((tenant) => tenant.isDefault) ?? tenants[0];
      updateTenantId(fallback.tenantId);
    }
  }, [isAuthenticated, tenantId, tenants, tenantsQuery.isLoading, updateTenantId]);

  useEffect(() => {
    if (!tenantMenuOpen && !compactNavOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!tenantMenuRef.current?.contains(event.target as Node)) {
        setTenantMenuOpen(false);
      }
      if (!compactNavRef.current?.contains(event.target as Node)) {
        setCompactNavOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [compactNavOpen, tenantMenuOpen]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const measure = () => {
      const headerWidth = headerRef.current?.clientWidth ?? 0;
      const brandWidth = brandRef.current?.offsetWidth ?? 0;
      const tenantWidth = tenantSwitcherRef.current?.offsetWidth ?? 0;
      const navWidth = primaryNavRef.current?.scrollWidth ?? 0;
      if (navWidth > 0) {
        navContentWidthRef.current = navWidth;
      }
      const requiredWidth = brandWidth + tenantWidth + Math.max(navContentWidthRef.current, navWidth) + 72;
      const shouldCompact = headerWidth > 0 && requiredWidth > headerWidth;
      setCompactMode(shouldCompact);
      if (shouldCompact) {
        setActiveMenu(null);
      }
      if (!shouldCompact) {
        setCompactNavOpen(false);
      }
    };

    const observer = new ResizeObserver(() => measure());
    if (headerRef.current) observer.observe(headerRef.current);
    if (tenantSwitcherRef.current) observer.observe(tenantSwitcherRef.current);
    window.addEventListener("resize", measure);
    measure();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isAuthenticated, tenants.length, selectedTenant?.name, selectedTenant?.role]);

  function onLogout() {
    const logoutUrl = keycloakLogoutUrl(config, idToken);
    sessionStorage.setItem(LOGOUT_IN_PROGRESS_KEY, "1");
    clearAuthIssue();
    clearSessionStorage();
    queryClient.clear();
    window.location.replace(logoutUrl);
  }

  function closeNavMenu() {
    setActiveMenu(null);
    setCompactNavOpen(false);
  }

  function toggleMoreMenu() {
    setActiveMenu((current) => current === "more" ? null : "more");
  }

  return (
    <div>
      <header className={`topbar${compactMode ? " compact" : ""}`} ref={headerRef}>
        <Link to="/dashboard" className="brand" aria-label="Go to dashboard" ref={brandRef}>
          <span className="brand-mark" aria-hidden="true">
            <img src={multiappLogoUrl} alt="" />
          </span>
          <span>Multiapp</span>
        </Link>
        {isAuthenticated && (
          <div className="compact-nav" ref={compactNavRef}>
            <button
              type="button"
              className="compact-nav-trigger"
              aria-label="Open navigation"
              aria-expanded={compactNavOpen}
              onClick={() => setCompactNavOpen((open) => !open)}
            >
              <Menu size={18} />
            </button>
            {compactNavOpen && (
              <div className="compact-nav-popover">
                {canViewTickets && <NavLink to="/tickets" onClick={closeNavMenu}><Ticket size={16} />Tickets</NavLink>}
                {canViewAppointments && <NavLink to="/appointments" onClick={closeNavMenu}><CalendarDays size={16} />Appointments</NavLink>}
                {canViewResources && <NavLink to="/resources" onClick={closeNavMenu}><Wrench size={16} />Resources</NavLink>}
                {canViewAvailability && <NavLink to={availabilityPath} onClick={closeNavMenu}><Clock3 size={16} />Availability</NavLink>}
                {canViewContacts && <NavLink to="/contacts" onClick={closeNavMenu}><Contact size={16} />Contacts</NavLink>}
                {canViewMembers && <NavLink to="/members" onClick={closeNavMenu}><Users size={16} />Members</NavLink>}
                {canViewTenant && <NavLink to="/tenant" onClick={closeNavMenu}><Building2 size={16} />Tenant</NavLink>}
                {canViewAuditLogs && <NavLink to="/audit-logs" onClick={closeNavMenu}><ClipboardList size={16} />Audit logs</NavLink>}
              </div>
            )}
          </div>
        )}

        {isAuthenticated && (
          <div className="primary-nav-wrap">
            <nav className={`primary-nav${activeMenu ? " has-open-menu" : ""}`} aria-label="Primary navigation" ref={primaryNavRef}>
              {canViewTickets && (
                <div
                  className={`nav-menu nav-cluster${activeMenu === "tickets" ? " menu-open" : ""}`}
                  onMouseEnter={() => setActiveMenu("tickets")}
                  onMouseLeave={closeNavMenu}
                >
                  <NavLink to="/tickets" onClick={closeNavMenu}><Ticket size={16} />Tickets</NavLink>
                  {activeMenu === "tickets" && <div className="menu-popover">
                    <Link to="/tickets" onClick={closeNavMenu}><Ticket size={16} />All tickets</Link>
                    {canCreateTicket && <Link to="/tickets/new" onClick={closeNavMenu}><Ticket size={16} />Create ticket</Link>}
                  </div>
                  }
                </div>
              )}
              {canViewAppointments && (
                <div
                  className={`nav-menu nav-cluster${activeMenu === "appointments" ? " menu-open" : ""}`}
                  onMouseEnter={() => setActiveMenu("appointments")}
                  onMouseLeave={closeNavMenu}
                >
                  <NavLink to="/appointments" onClick={closeNavMenu}><CalendarDays size={16} />Appointments</NavLink>
                  {activeMenu === "appointments" && <div className="menu-popover">
                    <Link to="/appointments" onClick={closeNavMenu}><CalendarDays size={16} />Schedule</Link>
                    <Link to="/tickets" onClick={closeNavMenu}><Ticket size={16} />Book from ticket</Link>
                  </div>}
                </div>
              )}
              {canViewResources && (
                <div
                  className={`nav-menu nav-cluster${activeMenu === "resources" ? " menu-open" : ""}`}
                  onMouseEnter={() => setActiveMenu("resources")}
                  onMouseLeave={closeNavMenu}
                >
                  <NavLink to="/resources" onClick={closeNavMenu}><Wrench size={16} />Resources</NavLink>
                  {activeMenu === "resources" && <div className="menu-popover">
                    <Link to="/resources" onClick={closeNavMenu}><Wrench size={16} />Resource list</Link>
                  </div>}
                </div>
              )}
              {canViewAvailability && (
                <NavLink to={availabilityPath} onClick={closeNavMenu}><Clock3 size={16} />Availability</NavLink>
              )}
            {hasMoreItems && (
              <div
                className={`nav-menu${activeMenu === "more" ? " menu-open" : ""}`}
                onMouseEnter={() => setActiveMenu("more")}
                onMouseLeave={closeNavMenu}
              >
                <button
                  type="button"
                  className="nav-trigger"
                  aria-label="More navigation"
                  aria-expanded={activeMenu === "more"}
                  onClick={toggleMoreMenu}
                >
                  <MoreHorizontal size={18} />
                  <span>More</span>
                </button>
                {activeMenu === "more" && <div className="menu-popover">
                  {canViewContacts && <NavLink to="/contacts" onClick={closeNavMenu}><Contact size={16} />Contacts</NavLink>}
                  {canViewMembers && <NavLink to="/members" onClick={closeNavMenu}><Users size={16} />Members</NavLink>}
                    {canViewTenant && <NavLink to="/tenant" onClick={closeNavMenu}><Building2 size={16} />Tenant</NavLink>}
                    {canViewAuditLogs && <NavLink to="/audit-logs" onClick={closeNavMenu}><ClipboardList size={16} />Audit logs</NavLink>}
                  </div>}
                </div>
              )}
            </nav>
          </div>
        )}

        {isAuthenticated && (
          <div className="tenant-switcher" ref={tenantSwitcherRef}>
            <div className="tenant-menu" ref={tenantMenuRef}>
              <button
                type="button"
                className="tenant-current"
                aria-haspopup="menu"
                aria-expanded={tenantMenuOpen}
                disabled={!tenants.length || tenantsQuery.isLoading}
                onClick={() => setTenantMenuOpen((open) => !open)}
              >
                <span className="tenant-current-main">
                  <span className="tenant-name">{selectedTenant?.name ?? "No tenant"}</span>
                </span>
                <span className="tenant-role">{selectedTenant?.role ?? "No role"}</span>
                <ChevronDown size={15} />
              </button>
              {tenantMenuOpen && (
                <div className="tenant-popover" role="menu">
                  {!tenants.length && <div className="tenant-empty">No tenant memberships</div>}
                  {selectedTenant && (
                    <div className="tenant-popover-current">
                      <span className="tenant-caption">Current workspace</span>
                      <div className="tenant-current-card">
                        <div className="tenant-option-main">
                          <span className="tenant-option-name">{selectedTenant.name}</span>
                          {selectedTenant.isDefault && <span className="tenant-default">Default</span>}
                        </div>
                        <span className="tenant-role">{selectedTenant.role}</span>
                      </div>
                      <div className="tenant-timezone-row">
                        <Clock3 size={14} />
                        <span>Times shown in {timeZoneLabel}</span>
                      </div>
                      <button
                        type="button"
                        className="tenant-default-action"
                        disabled={selectedTenant.isDefault || defaultTenantMutation.isPending}
                        onClick={() => onMakeDefault(selectedTenant.tenantId)}
                      >
                        {defaultTenantMutation.isPending && defaultTenantMutation.variables === selectedTenant.tenantId ? (
                          <Loader2 size={14} />
                        ) : selectedTenant.isDefault ? (
                          <Check size={14} />
                        ) : (
                          <Star size={14} />
                        )}
                        {defaultTenantMutation.isPending && defaultTenantMutation.variables === selectedTenant.tenantId
                          ? "Saving default..."
                          : selectedTenant.isDefault
                            ? "Default workspace"
                            : "Make this my default"}
                      </button>
                    </div>
                  )}
                  {otherTenants.length > 0 && (
                    <div className="tenant-popover-section">
                      <span className="tenant-caption">Switch workspace</span>
                      {otherTenants.map((tenant) => (
                        <div className="tenant-option-row" key={tenant.tenantId}>
                          <button
                            type="button"
                            className="tenant-option"
                            role="menuitem"
                            onClick={() => onTenantChange(tenant.tenantId)}
                          >
                            <span className="tenant-option-main">
                              <span className="tenant-option-name">{tenant.name}</span>
                              {tenant.isDefault && <span className="tenant-default">Default</span>}
                            </span>
                            <span className="tenant-role">{tenant.role}</span>
                          </button>
                          <button
                            type="button"
                            className="tenant-default-icon has-tooltip"
                            data-tooltip={tenant.isDefault ? "Default workspace" : "Make default"}
                            aria-label={tenant.isDefault ? `${tenant.name} is your default workspace` : `Make ${tenant.name} your default workspace`}
                            disabled={tenant.isDefault || defaultTenantMutation.isPending}
                            onClick={() => onMakeDefault(tenant.tenantId)}
                          >
                            {defaultTenantMutation.isPending && defaultTenantMutation.variables === tenant.tenantId ? (
                              <Loader2 size={14} />
                            ) : tenant.isDefault ? (
                              <Check size={14} />
                            ) : (
                              <Star size={14} />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <ErrorMessage message={defaultTenantMutation.error ? "Could not update your default workspace." : undefined} />
                </div>
              )}
            </div>
            <Link className="icon-button has-tooltip" data-tooltip="Notifications" aria-label="Notifications" to="/notifications"><Bell size={18} /></Link>
            <Link className="user-avatar has-tooltip" data-tooltip={profileLabel} aria-label={profileLabel} to="/me">{profileInitial}</Link>
            <button type="button" className="icon-button logout-button has-tooltip" data-tooltip="Log out" aria-label="Log out" onClick={onLogout}><LogOut size={18} /></button>
          </div>
        )}
      </header>
      <main className="page">{children ?? <Outlet />}</main>
    </div>
  );
}
