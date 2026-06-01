import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../queryKeys";

export function invalidateTicketData(queryClient: QueryClient, tenantId: string, ticketId?: string) {
  const tasks = [
    queryClient.invalidateQueries({ queryKey: tenantId ? queryKeys.ticketLists(tenantId) : ["tickets"] })
  ];

  if (ticketId) {
    tasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.ticket(tenantId, ticketId) }));
  }

  return Promise.all(tasks);
}

export function invalidateAppointmentData(queryClient: QueryClient, tenantId: string, appointmentId?: string) {
  const tasks = [
    queryClient.invalidateQueries({ queryKey: tenantId ? ["appointments", tenantId] : ["appointments"] })
  ];

  if (appointmentId) {
    tasks.push(queryClient.invalidateQueries({ queryKey: queryKeys.appointment(tenantId, appointmentId) }));
  }

  return Promise.all(tasks);
}
