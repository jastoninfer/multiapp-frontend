import { type ChangeEvent, useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, FileUp, Loader2, Paperclip, Upload, UserRound } from "lucide-react";
import { downloadAttachment, uploadAttachment } from "../api/attachments";
import { getFriendlyError } from "../api/client";
import { AttachmentSummary, UUID } from "../types";
import { ErrorMessage } from "./ErrorMessage";
import { useAuth } from "../auth/AuthContext";
import { invalidateTicketData } from "../cache/invalidation";
import { queryKeys } from "../queryKeys";
import { compactId, formatFileSize, formatRelativeTime } from "../ui/format";
import { useToast } from "./ToastProvider";

const DEFAULT_VISIBLE_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = ["image/png", "image/jpeg", "application/pdf"];
const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_TYPES.join(",");
const ATTACHMENT_HELP_TEXT = "PNG, JPG, or PDF up to 20 MB.";

function validateAttachmentFile(file: File | null) {
  if (!file) return "Choose a file first.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_ATTACHMENT_BYTES) return "Files must be 20 MB or smaller.";
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) return "Only PNG, JPG, and PDF files can be uploaded.";
  return "";
}

export function AttachmentList({ ticketId, items, canUpload }: { ticketId: UUID; items?: AttachmentSummary[]; canUpload: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [expanded, setExpanded] = useState(false);
  const fileInputId = useId();
  const { tenantId } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const visibleItems = expanded ? items ?? [] : (items ?? []).slice(0, DEFAULT_VISIBLE_ATTACHMENTS);
  const hasMore = (items?.length ?? 0) > DEFAULT_VISIBLE_ATTACHMENTS;

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Choose a file first.");
      const validationMessage = validateAttachmentFile(file);
      if (validationMessage) throw new Error(validationMessage);
      return uploadAttachment(ticketId, file);
    },
    onSuccess: async () => {
      notify("Attachment uploaded.");
      setFile(null);
      await Promise.all([
        invalidateTicketData(queryClient, tenantId, ticketId),
        queryClient.invalidateQueries({ queryKey: queryKeys.ticketAttachments(tenantId, ticketId) })
      ]);
    }
  });

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    const validationMessage = validateAttachmentFile(selected);
    if (validationMessage && selected) {
      setFile(null);
      notify(validationMessage);
      event.target.value = "";
      return;
    }
    setFile(selected);
  }

  return (
    <section className="panel ticket-detail-module">
      <div className="ticket-detail-section-title">
        <span><Paperclip size={17} /></span>
        <div>
          <h2>Attachments</h2>
          <p>{canUpload ? "Open files or upload supporting documents." : "Open files attached to this closed ticket."}</p>
        </div>
      </div>
      {!items?.length ? (
        <div className="ticket-detail-empty">No attachments.</div>
      ) : (
        <ul className="ticket-file-list">
          {visibleItems.map((item) => {
            const id = item.id || item.attachmentId;
            const uploader = item.uploadedByUserName || item.uploadedByName || compactId(item.uploadedByUserId);
            const uploadedAt = formatRelativeTime(item.createdAt);
            return (
              <li key={id || item.filename}>
                {id ? (
                  <button className="ticket-file-button" type="button" onClick={() => downloadAttachment(ticketId, id, item.filename)}>
                    <span className="ticket-file-copy">
                      <span className="ticket-file-name"><FileUp size={16} />{item.filename}</span>
                      <span className="ticket-file-meta"><UserRound size={13} />{uploader} · {uploadedAt}</span>
                    </span>
                    <span className="ticket-file-size">{formatFileSize(item.sizeBytes)}</span>
                  </button>
                ) : (
                  <div className="ticket-file-static">
                    <span className="ticket-file-copy">
                      <span className="ticket-file-name"><FileUp size={16} />{item.filename}</span>
                      <span className="ticket-file-meta"><UserRound size={13} />{uploader} · {uploadedAt}</span>
                    </span>
                    <span className="ticket-file-size">{formatFileSize(item.sizeBytes)}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {hasMore && (
        <button type="button" className="secondary ticket-list-toggle" onClick={() => setExpanded((open) => !open)}>
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          {expanded ? "Show fewer" : `Show all ${items?.length ?? 0}`}
        </button>
      )}

      {canUpload && (
        <div className="ticket-upload-row">
          <input
            id={fileInputId}
            className="ticket-file-input"
            type="file"
            accept={ATTACHMENT_ACCEPT}
            onChange={onFileChange}
          />
          <label className="ticket-file-picker" htmlFor={fileInputId}>
            <FileUp size={16} />
            <span>{file ? file.name : "Choose file"}</span>
          </label>
          <button type="button" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>
            {upload.isPending ? <Loader2 size={16} className="spin-icon" /> : <Upload size={16} />}
            Upload
          </button>
          <p className="ticket-upload-help">{ATTACHMENT_HELP_TEXT}</p>
        </div>
      )}
      <ErrorMessage message={upload.error ? getFriendlyError(upload.error) : undefined} />
    </section>
  );
}
