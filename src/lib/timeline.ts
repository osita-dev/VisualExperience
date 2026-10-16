/**
 * Timeline-trim math for the builder's strip (Step 2). The chain is
 * contiguous — dragging the cut between two slots ripples the seconds
 * from one to the other (total untouched); dragging the end of the chain
 * grows or shrinks it inside the 1..60s budget. Pure: covered by
 * scripts/verify-core.ts, no DOM, no React.
 *
 * Boundary numbering: 1..durs.length (1 = first cut … n = end of chain).
 * Boundary 0 has no handle — the chain always begins at 0 — and is
 * treated as boundary 1 for robustness.
 */

import { MAX_TOTAL_SEC, MIN_SLOT_SEC } from "@/core/model/types";

/** 12.34 → 12.3 (the strip shows and stores tenths). */
const r10 = (v: number): number => Math.round(v * 10) / 10;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** Cumulative start second of every slot (chain is gap-free). */
export function timelineStarts(durs: number[]): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const d of durs) {
    starts.push(acc);
    acc += d;
  }
  return starts;
}

/**
 * Move boundary `boundary` to `rawSec` (the pointer position in seconds),
 * clamped so every slot keeps at least MIN_SLOT_SEC and the chain never
 * exceeds MAX_TOTAL_SEC. Returns the whole new duration array plus the
 * boundary's final position — callers diff it against current state.
 */
export function trimAtBoundary(
  durs: number[],
  boundary: number,
  rawSec: number,
): { durs: number[]; pos: number } {
  const n = durs.length;
  if (n === 0) return { durs: [...durs], pos: 0 };

  const b = Math.max(1, Math.min(n, Math.round(boundary)));
  const starts = timelineStarts(durs);
  /* boundary positions: starts + the exact closing end of the chain */
  const bounds = [...starts, durs.reduce((a, d) => a + d, 0)];
  const next = durs.slice();

  if (b >= n) {
    /* the end of the chain: only the last slot's length changes */
    const i = n - 1;
    const others = bounds[i];
    const maxDur = Math.max(MIN_SLOT_SEC, MAX_TOTAL_SEC - others);
    const dur = clamp(r10(rawSec - bounds[i]), MIN_SLOT_SEC, maxDur);
    next[i] = dur;
    return { durs: next, pos: r10(bounds[i] + dur) };
  }

  /* an interior cut: ripple — left slot grows, right slot shrinks */
  const lo = r10(bounds[b - 1] + MIN_SLOT_SEC);
  const hi = r10(bounds[b + 1] - MIN_SLOT_SEC);
  const pos = clamp(r10(rawSec), lo, Math.max(lo, hi));
  next[b - 1] = r10(pos - bounds[b - 1]);
  next[b] = r10(bounds[b + 1] - pos);
  return { durs: next, pos };
}
