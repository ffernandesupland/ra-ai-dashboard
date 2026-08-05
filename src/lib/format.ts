/**
 * Shared by server components and client components alike, so it must not live
 * in a "use client" module — a server component cannot call a client function.
 */
export function formatPct(value: number): string {
  return value < 10 ? `${value.toFixed(1)}%` : `${Math.round(value)}%`;
}

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
