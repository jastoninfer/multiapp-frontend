import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  Copy,
  Headset,
  History,
  KeyRound,
  Layers3,
  Link2,
  ListChecks,
  Paperclip,
  ServerCog,
  ShieldCheck,
  Shuffle,
  Ticket,
  UserRound,
  Wrench
} from "lucide-react";
import { LOGOUT_IN_PROGRESS_KEY, useAuth } from "../auth/AuthContext";
import { clearOidcTransientState, startKeycloakLogin } from "../auth/oidc";
import { useToast } from "../components/ToastProvider";

const demoPassword = "Demo123!";
const githubUrl = "https://github.com/jastoninfer/multiapp-backend";

const primaryAccounts = [
  {
    label: "Tenant admin",
    email: "tenant.admin@acme.demo",
    role: "Admin",
    tenant: "Acme Facilities",
    description: "Tenant settings, members, contacts, tickets, appointments, and audit logs.",
    icon: ShieldCheck
  },
  {
    label: "Agent",
    email: "agent@acme.demo",
    role: "Agent",
    tenant: "Acme Facilities",
    description: "Queue triage, assignment, internal notes, contact updates, and scheduling.",
    icon: Headset
  },
  {
    label: "Resource user",
    email: "resource@acme.demo",
    role: "Resource",
    tenant: "Acme Facilities",
    description: "Assigned appointments, weekly working hours, and unavailable time blocks.",
    icon: CalendarClock
  },
  {
    label: "Customer",
    email: "customer@acme.demo",
    role: "Customer",
    tenant: "Acme Facilities",
    description: "Service requests, ticket follow-up, and external contact claim flow.",
    icon: UserRound
  },
  {
    label: "Cross-tenant user",
    email: "multi.member@demo.com",
    role: "Acme agent / Beta customer",
    tenant: "Acme + Beta",
    description: "Tenant switching with different roles, access rules, and scoped data.",
    icon: Shuffle
  }
];

const extraAccounts = [
  ["Acme admin 2", "acme.admin2@demo.com", "Admin"],
  ["Acme agent 2", "acme.agent2@demo.com", "Agent"],
  ["Acme resource 2", "acme.resource2@demo.com", "Resource"],
  ["Acme customer 2", "acme.customer2@demo.com", "Customer"],
  ["Beta admin", "beta.admin@demo.com", "Admin"],
  ["Beta agent", "beta.agent@demo.com", "Agent"],
  ["Beta resource", "beta.resource@demo.com", "Resource"],
  ["Beta customer", "beta.customer@demo.com", "Customer"]
];

const demoTracks = [
  {
    label: "Ticket control",
    metric: "36",
    detail: "active service requests",
    icon: Ticket
  },
  {
    label: "Resource schedule",
    metric: "23",
    detail: "booked appointments",
    icon: Wrench
  },
  {
    label: "Tenant governance",
    metric: "17",
    detail: "managed contacts",
    icon: Building2
  }
];

const featureHighlights = [
  { label: "Role-aware workflows", detail: "Ticket visibility, assignment, comments, and transitions.", icon: ListChecks },
  { label: "Calendar operations", detail: "Resource availability, appointments, and blocked time.", icon: CalendarClock },
  { label: "Tenant boundaries", detail: "Memberships, contacts, claim codes, audit events.", icon: Layers3 },
  { label: "Audit trail", detail: "Tenant actions record actor, request context, event type, and timestamps.", icon: History },
  { label: "Contact claiming", detail: "External contacts can be linked through claim codes and scoped ownership.", icon: Link2 },
  { label: "Attachments", detail: "Ticket files use guarded upload, download, visibility, and metadata handling.", icon: Paperclip }
];

const stackItems = ["Spring Boot", "PostgreSQL", "Keycloak OIDC", "Docker Compose", "Caddy", "React + TypeScript"];

function GithubMark() {
  return (
    <svg className="demo-github-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 .5A11.5 11.5 0 0 0 8.36 22.9c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.38-3.88-1.38-.53-1.33-1.29-1.69-1.29-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.04 1.76 2.71 1.25 3.37.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.27-5.23-5.66 0-1.25.45-2.27 1.19-3.07-.12-.29-.52-1.46.11-3.03 0 0 .98-.31 3.18 1.17A11 11 0 0 1 12 6.2c.98 0 1.96.13 2.88.4 2.2-1.48 3.17-1.17 3.17-1.17.64 1.57.24 2.74.12 3.03.74.8 1.18 1.82 1.18 3.07 0 4.4-2.69 5.37-5.25 5.65.42.36.78 1.06.78 2.14v3.02c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"
      />
    </svg>
  );
}

export function PublicDemoPage() {
  const { config, clearSessionStorage, clearAuthIssue } = useAuth();
  const { notify } = useToast();
  const [startingEmail, setStartingEmail] = useState("");

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(demoPassword);
      notify("Demo password copied.");
    } catch {
      notify("Could not copy the demo password.");
    }
  }

  async function openDemo(email?: string) {
    setStartingEmail(email ?? "app");
    clearSessionStorage();
    clearAuthIssue();
    clearOidcTransientState();
    sessionStorage.removeItem(LOGOUT_IN_PROGRESS_KEY);
    try {
      await startKeycloakLogin(config, "/dashboard", email ? { prompt: "login", loginHint: email } : {});
    } catch (err) {
      setStartingEmail("");
      notify(err instanceof Error ? err.message : "Unable to start the demo sign-in.");
    }
  }

  return (
    <div className="demo-page">
      <section className="demo-hero" aria-labelledby="demo-hero-title">
        <img className="demo-hero-image" src="/og/multiapp-dashboard.png" alt="" />
        <div className="demo-hero-shade" aria-hidden="true" />
        <div className="demo-hero-content">
          <div className="demo-brand-line">
            Multiapp demo
          </div>
          <h1 id="demo-hero-title">Multiapp is a service desk SaaS for tickets and scheduling.</h1>
          <p>
            Try a seeded workspace with role-based ticket queues, resource calendars, contacts, tenant members, and audit history.
          </p>
          <div className="demo-hero-actions">
            <a className="demo-primary-action" href="#demo-roles">
              Choose a demo role
              <ArrowRight size={16} />
            </a>
            <a className="demo-secondary-action" href={githubUrl} target="_blank" rel="noreferrer">
              <GithubMark />
              GitHub
              <ArrowUpRight size={15} />
            </a>
          </div>
        </div>
        <div className="demo-hero-metrics" aria-label="Demo data snapshot">
          {demoTracks.map((track) => {
            const Icon = track.icon;
            return (
              <div className="demo-hero-metric" key={track.label}>
                <Icon size={15} />
                <span>{track.label}</span>
                <strong>{track.metric}</strong>
                <small>{track.detail}</small>
              </div>
            );
          })}
        </div>
      </section>

      <section className="demo-launcher" id="demo-roles" aria-labelledby="demo-launcher-title">
        <div className="demo-section-heading">
          <div>
            <span className="demo-section-kicker"><KeyRound size={14} />Demo sign-in</span>
            <h2 id="demo-launcher-title">Pick the role you want to see first.</h2>
            <p>Each role has its own password button next to the sign-in action, so the credential is always where you need it.</p>
          </div>
        </div>

        <div className="demo-account-grid">
          {primaryAccounts.map((account) => {
            const Icon = account.icon;
            return (
              <article className="demo-account-card" key={account.email}>
                <div className="demo-account-topline">
                  <span className="demo-account-icon"><Icon size={19} /></span>
                  <span className="demo-role-pill">{account.role}</span>
                </div>
                <h3>{account.label}</h3>
                <p className="demo-account-email">{account.email}</p>
                <p className="demo-account-description">{account.description}</p>
                <p className="demo-account-tenant">{account.tenant}</p>
                <div className="demo-account-footer">
                  <button type="button" className="demo-password-action" onClick={copyPassword}>
                    <Copy size={14} />
                    Copy password
                  </button>
                  <button
                    type="button"
                    className="demo-card-launch"
                    disabled={Boolean(startingEmail)}
                    onClick={() => openDemo(account.email)}
                    aria-label={`Open demo as ${account.label}`}
                  >
                    {startingEmail === account.email ? "Opening..." : "Sign in"}
                    <ArrowRight size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="demo-detail-layout" aria-label="Demo reference">
        <div className="demo-feature-panel">
          <div className="demo-section-heading compact">
            <div>
              <span className="demo-section-kicker"><BadgeCheck size={14} />Coverage</span>
              <h2>Where the demo has depth</h2>
            </div>
          </div>
          <div className="demo-feature-grid">
            {featureHighlights.map((item) => {
              const Icon = item.icon;
              return (
                <div className="demo-feature-item" key={item.label}>
                  <Icon size={18} />
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
              );
            })}
          </div>
        </div>

        <section className="demo-support-panel">
          <div className="demo-support-stack">
            <h2><ServerCog size={16} />Stack</h2>
            <div className="demo-stack-list">
              {stackItems.map((item) => <span key={item}>{item}</span>)}
            </div>
          </div>
          <div className="demo-support-users">
            <div className="demo-reference-header">
              <h2><UserRound size={16} />More seeded users</h2>
              <button type="button" className="demo-reference-copy" onClick={copyPassword}>
              <Copy size={14} />
                Copy shared password
              </button>
            </div>
            <div className="demo-extra-account-list">
              {extraAccounts.map(([label, email]) => (
                <button
                  type="button"
                  className="demo-extra-account-row"
                  key={email}
                  onClick={() => openDemo(email)}
                  disabled={Boolean(startingEmail)}
                >
                  <span>
                    <strong>{label}</strong>
                    <small>{email}</small>
                  </span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}
