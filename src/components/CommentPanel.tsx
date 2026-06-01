import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, MessageSquare, Send } from "lucide-react";
import { createComment, listComments } from "../api/comments";
import { getFriendlyError } from "../api/client";
import { CommentResponse, CommentVisibility, UUID } from "../types";
import { ErrorMessage } from "./ErrorMessage";
import { useAuth } from "../auth/AuthContext";
import { compactId, formatRelativeTime } from "../ui/format";
import { invalidateTicketData } from "../cache/invalidation";
import { queryKeys } from "../queryKeys";

const COMMENT_LIMIT = 4000;
const COMMENT_PAGE_SIZE = 10;

interface CommentPanelProps {
  ticketId: UUID;
  canComment: boolean;
  canPostInternal: boolean;
  ownerUserId?: UUID | null;
  requesterUserId?: UUID | null;
  linkActors?: boolean;
}

function commentActorId(comment: CommentResponse) {
  return comment.authorId || comment.actorUserId;
}

function commentRole(comment: CommentResponse, ownerUserId?: UUID | null, requesterUserId?: UUID | null) {
  const actorId = commentActorId(comment);
  const role = (comment.role || comment.authorRole || "").toUpperCase();
  if (ownerUserId && actorId === ownerUserId) return { label: "Owner", tone: "owner" };
  if (requesterUserId && actorId === requesterUserId) return { label: "Requester", tone: "requester" };
  if (role === "ADMIN") return { label: "Admin", tone: "admin" };
  if (role === "AGENT") return { label: "Agent", tone: "agent" };
  if (role === "CUSTOMER") return { label: "Requester", tone: "requester" };
  if (role === "RESOURCE_USER") return { label: "Resource", tone: "resource" };
  return { label: "Member", tone: "neutral" };
}

export function CommentPanel({ ticketId, canComment, canPostInternal, ownerUserId, requesterUserId, linkActors = false }: CommentPanelProps) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [page, setPage] = useState(0);
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  const commentsQuery = useQuery({
    queryKey: queryKeys.ticketComments(tenantId, ticketId, page),
    queryFn: () => listComments(ticketId, page, COMMENT_PAGE_SIZE)
  });
  const total = commentsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / COMMENT_PAGE_SIZE));
  const comments = commentsQuery.data?.items ?? [];

  const mutation = useMutation({
    mutationFn: () => createComment(ticketId, { visibility: (internal ? "INTERNAL" : "PUBLIC") as CommentVisibility, body }),
    onSuccess: async () => {
      const lastPage = Math.max(0, Math.ceil((total + 1) / COMMENT_PAGE_SIZE) - 1);
      setBody("");
      setInternal(false);
      setPage(lastPage);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ticket-comments", tenantId, ticketId] }),
        invalidateTicketData(queryClient, tenantId, ticketId)
      ]);
    }
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <section className="panel ticket-detail-module">
      <div className="ticket-detail-section-title">
        <span><MessageSquare size={17} /></span>
        <div>
          <h2>Comments</h2>
          <p>{canComment ? "Follow the conversation and add the next update." : "Review the conversation for this closed ticket."}</p>
        </div>
      </div>
      <ErrorMessage message={commentsQuery.error ? getFriendlyError(commentsQuery.error) : undefined} />
      {!comments.length ? (
        <div className="ticket-detail-empty">No comments yet.</div>
      ) : (
        <div className="ticket-comment-thread">
          {comments.map((comment) => {
            const isInternal = comment.visibility === "INTERNAL";
            const actorId = commentActorId(comment);
            const author = comment.authorName || comment.authorDisplayName || compactId(actorId);
            const role = commentRole(comment, ownerUserId, requesterUserId);
            const authorContent = linkActors && actorId ? (
              <Link className="person-inline-link" to={`/members/${actorId}`}>{author}</Link>
            ) : author;
            return (
              <article key={comment.id} className={isInternal ? "ticket-comment-item internal" : "ticket-comment-item"}>
                <div className="ticket-comment-meta">
                  <div className="ticket-comment-author">
                    <strong>{authorContent}</strong>
                    <span className={`ticket-comment-role ticket-comment-role-${role.tone}`}>{role.label}</span>
                    {isInternal && <span className="ticket-internal-label">Internal</span>}
                  </div>
                  <time dateTime={comment.createdAt}>{formatRelativeTime(comment.createdAt)}</time>
                </div>
                <p>{comment.body}</p>
              </article>
            );
          })}
        </div>
      )}

      {total > COMMENT_PAGE_SIZE && (
        <div className="ticket-comment-pagination">
          <button type="button" className="secondary" disabled={page === 0 || commentsQuery.isFetching} onClick={() => setPage((current) => Math.max(0, current - 1))}>
            <ChevronLeft size={15} />
            Previous
          </button>
          <span>Page {page + 1} of {pageCount}</span>
          <button type="button" className="secondary" disabled={page + 1 >= pageCount || commentsQuery.isFetching} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>
            Next
            <ChevronRight size={15} />
          </button>
        </div>
      )}

      {canComment && (
        <form className="ticket-comment-form" onSubmit={onSubmit}>
          <div className="ticket-comment-composer-head">
            <span>Add comment</span>
            {canPostInternal && (
              <label className="ticket-internal-toggle">
                <input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} />
                Internal note
              </label>
            )}
          </div>
          <label>
            <textarea
              required
              maxLength={COMMENT_LIMIT}
              placeholder="Write a clear update..."
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <small>{body.length}/{COMMENT_LIMIT}</small>
          </label>
          <button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 size={16} className="spin-icon" /> : <Send size={16} />}
            Add comment
          </button>
        </form>
      )}
      <ErrorMessage message={mutation.error ? getFriendlyError(mutation.error) : undefined} />
    </section>
  );
}
