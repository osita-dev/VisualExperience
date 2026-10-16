/** Small pure display helpers. */

/** 7.5 → "7.5s", 12 → "12s" */
export function fmtSec(s: number): string {
  const rounded = Math.round(s * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}s`;
}

/** 75.4 → "01:15" */
export function fmtClock(s: number): string {
  const total = Math.max(0, Math.floor(s));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Deterministic hue from a string — used for badges when needed. */
export function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
