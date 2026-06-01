# Multiapp Frontend

React frontend for the Multiapp IT service management SaaS demo. The UI is built as a mature business application for tenant admins, agents, resource users, and customers to manage tickets, appointments, contacts, members, tenants, availability, and audit logs.

This repository is the frontend/UI side of the demo. It talks to a Spring Boot backend and uses Keycloak authorization-code login with PKCE.

## Highlights

- Role-aware navigation and action visibility.
- Multi-tenant workspace selection.
- Ticket list/detail workflow with comments, attachments, scheduling, owner/requester links, and write-permission gating.
- Appointment, resource availability, member, contact, tenant, profile, and audit-log pages.
- Consistent dashboard-style UI system with neutral button hierarchy, compact filters, paginated tables, tags, side panels, and detail views.
- Refresh-token session extension for a smoother demo experience.

## Stack

- React 18
- TypeScript
- Vite
- React Router
- TanStack Query
- Lucide React
- Plain CSS design system in `src/styles.css`

## Environment

Create a local env file from the example:

```bash
cp .env.example .env.local
```

Required variables:

```env
VITE_API_BASE_URL=http://api.localhost
VITE_KEYCLOAK_URL=http://auth.localhost
VITE_KEYCLOAK_REALM=multiapp
VITE_KEYCLOAK_CLIENT_ID=multiapp-web
```

Vite embeds these values at build time. If an API/Auth URL changes, rebuild the frontend.

## Run Locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

For the local Caddy-backed demo build:

```bash
npm run build -- --mode caddy-local
```

The static output is written to:

```text
dist/
```

## Main Routes

```text
/                       Dashboard
/auth/callback          Keycloak callback
/tickets                Ticket queue
/tickets/:id            Ticket detail
/appointments           Appointment list
/appointments/:id       Appointment detail
/availability           My availability
/resources              Resource list
/members                Tenant members
/members/:userId        Member detail
/contacts               External contacts
/contacts/:contactId    Contact detail
/tenants                Tenant management
/audit-log              Admin audit log
/profile                Account profile
```

## Build

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Deployment

The frontend is a static Vite app and can be hosted on Cloudflare Pages, Vercel, Netlify, or any static host.

Recommended build settings:

```text
Build command: npm run build
Output directory: dist
```

Set the `VITE_*` variables in the hosting provider dashboard before building. The backend `APP_CORS_ALLOWED_ORIGINS` and Keycloak client redirect/web origins must include the final frontend origin.

## Backend Pairing

This frontend expects the backend API to provide:

- OIDC-protected `/me` and tenant-selection endpoints
- Tenant-scoped ticket, appointment, contact, member, resource, tenant, and audit APIs
- `Authorization: Bearer <access_token>`
- `X-Tenant-Id` for tenant-scoped business endpoints
- `ETag` / `If-Match` on update flows where required

See the backend repository for Docker Compose and Keycloak setup.
