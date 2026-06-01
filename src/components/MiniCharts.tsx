import { CSSProperties, KeyboardEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

interface ChartItem {
  label: string;
  value: number;
  color?: string;
  href?: string;
  detail?: string;
}

const palette = ["#2563eb", "#0891b2", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed"];

function chartColor(item: ChartItem, index: number) {
  return item.color ?? palette[index % palette.length];
}

export function MiniBarChart({ items, height = 150 }: { items: ChartItem[]; height?: number }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="mini-chart" style={{ minHeight: height }}>
      {items.map((item, index) => {
        const barHeight = Math.max(8, (item.value / max) * (height - 64));
        const content = (
          <>
            <div className="mini-bar-track" style={{ height: height - 52 }}>
              <span className="mini-bar" style={{ height: barHeight, background: chartColor(item, index) }} />
            </div>
            <strong>{item.value}</strong>
            <span className="mini-bar-label">{item.label}</span>
          </>
        );
        const tooltip = item.detail ?? `${item.label}: ${item.value}`;
        if (item.href) {
          return (
            <Link
              className="mini-bar-item chart-action"
              data-tooltip={tooltip}
              key={item.label}
              to={item.href}
              aria-label={tooltip}
            >
              {content}
            </Link>
          );
        }
        return (
          <div className="mini-bar-item chart-action" data-tooltip={tooltip} key={item.label} tabIndex={0}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

export function CompactBarChart({ items, height = 118 }: { items: ChartItem[]; height?: number }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  const chartStyle = {
    minHeight: height,
    "--compact-chart-count": items.length
  } as CSSProperties;

  return (
    <div className="compact-chart" style={chartStyle}>
      {items.map((item, index) => {
        const barHeight = Math.max(6, (item.value / max) * (height - 48));
        const [dayName, dayNumber] = compactDateParts(item.label);
        const content = (
          <>
            <div className="compact-bar-stage" style={{ height: height - 42 }}>
              <span className="compact-bar" style={{ height: barHeight, background: chartColor(item, index) }} />
            </div>
            <span className="compact-bar-value">{item.value}</span>
            <span className="compact-bar-label">
              <span>{dayName}</span>
              {dayNumber && <span>{dayNumber}</span>}
            </span>
          </>
        );
        const tooltip = item.detail ?? `${item.label}: ${item.value}`;
        return item.href ? (
          <Link className="compact-bar-item chart-action" data-tooltip={tooltip} key={item.label} to={item.href}>
            {content}
          </Link>
        ) : (
          <div className="compact-bar-item chart-action" data-tooltip={tooltip} key={item.label} tabIndex={0}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

function compactDateParts(label: string) {
  const parts = label.split(" ");
  if (parts.length < 2) return [label, ""] as const;
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]] as const;
}

export function StatusFlowChart({ items }: { items: ChartItem[] }) {
  return (
    <div className="status-flow">
      {items.map((item, index) => {
        const content = (
          <>
            <span className="status-flow-label">{item.label}</span>
            <strong>{item.value}</strong>
          </>
        );
        const tooltip = item.detail ?? `${item.label}: ${item.value}`;
        return item.href ? (
          <Link
            className="status-flow-step chart-action"
            data-tooltip={tooltip}
            key={item.label}
            style={{ "--flow-color": chartColor(item, index) } as CSSProperties}
            to={item.href}
          >
            {content}
          </Link>
        ) : (
          <div
            className="status-flow-step chart-action"
            data-tooltip={tooltip}
            key={item.label}
            style={{ "--flow-color": chartColor(item, index) } as CSSProperties}
            tabIndex={0}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}

export function DonutChart({ items }: { items: ChartItem[] }) {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let offset = 25;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;

  function openItem(item: ChartItem) {
    if (item.href) navigate(item.href);
  }

  function onSegmentKeyDown(event: KeyboardEvent<SVGCircleElement>, item: ChartItem) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openItem(item);
    }
  }

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 100 100" role="img" aria-label="Distribution chart">
        <circle className="donut-base" cx="50" cy="50" r={radius} />
        {items.map((item, index) => {
          const length = total ? (item.value / total) * circumference : 0;
          const strokeDasharray = `${length} ${circumference - length}`;
          const strokeDashoffset = offset;
          const tooltip = item.detail ?? `${item.label}: ${item.value}`;
          offset -= length;
          return (
            <circle
              key={item.label}
              className={`donut-segment ${activeIndex === index ? "donut-segment-active" : ""}`}
              cx="50"
              cy="50"
              r={radius}
              stroke={chartColor(item, index)}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              tabIndex={item.href ? 0 : -1}
              role={item.href ? "link" : "img"}
              aria-label={tooltip}
              onClick={() => openItem(item)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
              onKeyDown={(event) => onSegmentKeyDown(event, item)}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            />
          );
        })}
        <text x="50" y="48" textAnchor="middle" className="donut-number">{total}</text>
        <text x="50" y="61" textAnchor="middle" className="donut-label">total</text>
      </svg>
      <div className="chart-legend">
        {items.map((item, index) => {
          const content = (
            <>
              <i style={{ background: chartColor(item, index) }} />
              {item.label} {item.value}
            </>
          );
          const tooltip = item.detail ?? `${item.label}: ${item.value}`;
          return item.href ? (
            <Link
              className={`chart-legend-item chart-action ${activeIndex === index ? "chart-legend-item-active" : ""}`}
              data-tooltip={tooltip}
              key={item.label}
              onBlur={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(index)}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              to={item.href}
            >
              {content}
            </Link>
          ) : (
            <span
              className={`chart-legend-item chart-action ${activeIndex === index ? "chart-legend-item-active" : ""}`}
              data-tooltip={tooltip}
              key={item.label}
              onBlur={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(index)}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              tabIndex={0}
            >
              {content}
            </span>
          );
        })}
      </div>
    </div>
  );
}
