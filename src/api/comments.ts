import { apiRequest, normalizePage } from "./client";
import { CommentResponse, CommentVisibility, PageResponse, UUID } from "../types";

export async function listComments(ticketId: UUID, page = 0, size = 12): Promise<PageResponse<CommentResponse>> {
  const { data } = await apiRequest<unknown>(`/tickets/${ticketId}/comments?page=${page}&size=${size}`);
  return normalizePage<CommentResponse>(data);
}

export async function createComment(ticketId: UUID, body: { visibility: CommentVisibility; body: string }) {
  return apiRequest<CommentResponse>(`/tickets/${ticketId}/comments`, {
    method: "POST",
    body
  });
}
