import { apiRequest, parseContentDispositionFilename } from "./client";
import { AttachmentResponse, UUID } from "../types";

export async function uploadAttachment(ticketId: UUID, file: File) {
  const form = new FormData();
  form.append("file", file);

  return apiRequest<AttachmentResponse>(`/tickets/${ticketId}/attachments`, {
    method: "POST",
    body: form
  });
}

export async function downloadAttachment(ticketId: UUID, attachmentId: UUID, fallbackName?: string) {
  const { data, response } = await apiRequest<Blob>(
    `/tickets/${ticketId}/attachments/${attachmentId}/download`,
    { parseAs: "blob" }
  );
  const filename = parseContentDispositionFilename(response.headers.get("Content-Disposition")) || fallbackName || "download";
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
