import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, ChevronDown, ChevronUp, UserRound } from "lucide-react";
import { AppointmentSummary } from "../types";
import { compactId, formatDateTime } from "../ui/format";
import { StatusBadge } from "./StatusBadge";

const DEFAULT_VISIBLE_APPOINTMENTS = 3;

export function AppointmentList({ title, items, linkResources = false }: { title: string; items?: AppointmentSummary[]; linkResources?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (!items?.length) return null;
  const visibleItems = expanded ? items : items.slice(0, DEFAULT_VISIBLE_APPOINTMENTS);
  const hasMore = items.length > DEFAULT_VISIBLE_APPOINTMENTS;

  return (
    <section className="panel ticket-detail-module ticket-appointment-list">
      <div className="ticket-detail-section-title compact">
        <span><CalendarClock size={17} /></span>
        <div>
          <h2>{title}</h2>
          <p>Scheduled work linked to this ticket.</p>
        </div>
      </div>
      <ul className="ticket-appointment-items">
        {visibleItems.map((item) => (
          <li key={item.id}>
            <div>
              <Link to={`/appointments/${item.id}`}>{formatDateTime(item.startAt)}</Link>
              <span>
                <UserRound size={14} />
                {linkResources ? (
                  <Link className="person-inline-link" to={`/members/${item.resourceUserId}`}>
                    {item.resourceUserName || compactId(item.resourceUserId)}
                  </Link>
                ) : (
                  item.resourceUserName || compactId(item.resourceUserId)
                )}
              </span>
            </div>
            <StatusBadge value={item.status} />
          </li>
        ))}
      </ul>
      {hasMore && (
        <button type="button" className="secondary ticket-list-toggle" onClick={() => setExpanded((open) => !open)}>
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          {expanded ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}
