import type { ReactNode } from "react";
import type { FreshnessStatus } from "../../shared/types";

/**
 * The day dot — freshflip's freshness language, borrowed from the colored
 * day-dot stickers on deli containers in restaurant kitchens. The number is
 * days left; color is the only place the UI uses color at all.
 */
export function DayDot({
  daysLeft,
  status,
  size = "md",
}: {
  daysLeft: number | null;
  status: FreshnessStatus;
  size?: "sm" | "md";
}) {
  const label =
    daysLeft === null
      ? "No expiry date"
      : daysLeft < 0
        ? `Expired ${-daysLeft} day${daysLeft === -1 ? "" : "s"} ago`
        : daysLeft === 0
          ? "Expires today"
          : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
  const text = daysLeft === null ? "∞" : daysLeft < 0 ? "✕" : String(daysLeft);
  return (
    <span
      className={`dot dot-${status} dot-${size}${daysLeft === null ? " dot-none" : ""}`}
      title={label}
      aria-label={label}
    >
      {text}
    </span>
  );
}

/** Masking-tape label — the kitchen's own typography for "deal with this now". */
export function Tape({ children }: { children: ReactNode }) {
  return <span className="tape">{children}</span>;
}

export function statusFromDays(daysLeft: number | null): FreshnessStatus {
  if (daysLeft === null) return "fresh";
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 1) return "critical";
  if (daysLeft <= 3) return "soon";
  if (daysLeft <= 7) return "watch";
  return "fresh";
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtQty(qty: number, unit: string): string {
  const rounded = Math.round(qty * 100) / 100;
  return `${rounded} ${unit}`;
}
