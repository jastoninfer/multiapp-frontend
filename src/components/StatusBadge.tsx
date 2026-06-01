import { titleCase } from "../ui/format";

interface StatusBadgeProps {
  value?: string | null;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}

function inferTone(value?: string | null): StatusBadgeProps["tone"] {
  switch (value) {
    case "ACTIVE":
    case "COMPLETED":
      return "success";
    case "HIGH":
    case "BOOKED":
    case "RESCHEDULED":
      return "warning";
    case "URGENT":
    case "SUSPENDED":
    case "DISABLED":
    case "CANCELLED":
      return "danger";
    case "NEW":
    case "IN_PROGRESS":
    case "AGENT":
      return "info";
    case "ADMIN":
      return "warning";
    case "RESOURCE_USER":
      return "success";
    default:
      return "neutral";
  }
}

export function StatusBadge({ value, tone }: StatusBadgeProps) {
  const valueClass = value ? value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") : "empty";
  return <span className={`badge badge-${tone ?? inferTone(value)} badge-value-${valueClass}`}>{titleCase(value)}</span>;
}
