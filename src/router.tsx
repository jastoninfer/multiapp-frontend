import { Navigate, createBrowserRouter } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { AppointmentDetailPage } from "./pages/AppointmentDetailPage";
import { AppointmentsPage } from "./pages/AppointmentsPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TicketDetailPage } from "./pages/TicketDetailPage";
import { TicketsPage } from "./pages/TicketsPage";
import { AvailabilityPage } from "./pages/AvailabilityPage";
import { SignedOutPage } from "./pages/SignedOutPage";
import { SessionExpiredPage } from "./pages/SessionExpiredPage";
import { NewTicketPage } from "./pages/NewTicketPage";
import { MePage } from "./pages/MePage";
import { ContactsPage } from "./pages/ContactsPage";
import { ContactDetailPage } from "./pages/ContactDetailPage";
import { ContactClaimPage } from "./pages/ContactClaimPage";
import { MembersPage } from "./pages/MembersPage";
import { MemberDetailPage } from "./pages/MemberDetailPage";
import { TenantPage } from "./pages/TenantPage";
import { ResourcesPage } from "./pages/ResourcesPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { path: "auth/callback", element: <AuthCallbackPage /> },
      { path: "signed-out", element: <SignedOutPage /> },
      { path: "session-expired", element: <SessionExpiredPage /> },
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: "dashboard", element: <DashboardPage /> },
          { path: "me", element: <MePage /> },
          { path: "tickets", element: <TicketsPage /> },
          { path: "tickets/new", element: <NewTicketPage /> },
          { path: "tickets/:id", element: <TicketDetailPage /> },
          { path: "appointments", element: <AppointmentsPage /> },
          { path: "appointments/:id", element: <AppointmentDetailPage /> },
          { path: "contacts", element: <ContactsPage /> },
          { path: "contacts/claim", element: <ContactClaimPage /> },
          { path: "contacts/:contactId", element: <ContactDetailPage /> },
          { path: "members", element: <MembersPage /> },
          { path: "members/:userId", element: <MemberDetailPage /> },
          { path: "tenant", element: <TenantPage /> },
          { path: "admin/tenants", element: <Navigate to="/tenant" replace /> },
          { path: "resources", element: <ResourcesPage /> },
          { path: "resources/:resourceUserId/availability", element: <AvailabilityPage /> },
          { path: "notifications", element: <NotificationsPage /> },
          { path: "audit-logs", element: <AuditLogsPage /> }
        ]
      },
      { path: "*", element: <Navigate to="/dashboard" replace /> }
    ]
  }
]);
