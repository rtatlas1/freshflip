import type { FreshnessStatus } from "../shared/types";

/** Days from `today` until `dateStr` (date-only math, negative = past). */
export function daysUntil(dateStr: string, today: Date = new Date()): number {
  const target = new Date(dateStr + "T00:00:00");
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - base.getTime()) / 86_400_000);
}

export function statusFor(daysLeft: number | null): FreshnessStatus {
  if (daysLeft === null) return "fresh";
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 1) return "critical";
  if (daysLeft <= 3) return "soon";
  if (daysLeft <= 7) return "watch";
  return "fresh";
}

/**
 * Urgency drives recipe ranking: 1.0 = use today, fading linearly to 0 over
 * the "flip window". Expired items score 0 — we don't recommend cooking food
 * that's already gone; the UI flags those for inspection/discard instead.
 */
export const FLIP_WINDOW_DAYS = 10;

export function urgencyFor(daysLeft: number | null): number {
  if (daysLeft === null || daysLeft < 0) return 0;
  if (daysLeft >= FLIP_WINDOW_DAYS) return 0;
  return (FLIP_WINDOW_DAYS - daysLeft) / FLIP_WINDOW_DAYS;
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return isoDate(new Date());
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return isoDate(d);
}
