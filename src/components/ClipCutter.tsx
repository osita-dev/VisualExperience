/**
 * ClipCutter — the cut view (Step 3): the FULL clip drawn as one track
 * with the slot-locked window on top. The window's length is the slot's
 * (structure); only its in-point moves (content). Drag the window to cut
 * the wanted part, tap the empty track to scrub the preview. The dimmed
 * regions are exactly the parts that won't play — every number derives
 * from the clip and the slot, nothing is typed.
 */

import { useRef, useState } from "react";
import type {
  KeyboardEvent as RKeyboardEvent,
  PointerEvent as RPointerEvent,
} from "react";
import { fmtSec } from "@/lib/format";

interface Props {
  /** the full clip length in seconds */
  clipLen: number;
  /** the slot-locked window length in seconds */
  windowLen: number;
  /** current in-point (trimStart) */
  value: number;
  onChange: (trimStart: number) => void;
  /** pointer on the empty track → seek the preview to that second */
  onScrub?: (sec: number) => void;
}

const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60];
const r10 = (v: number): number => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

export function ClipCutter({
  clipLen,
  windowLen,
  value,
  onChange,
  onScrub,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  /** seconds from the window's start to the grab point (1:1 drag feel) */
  const grabRef = useRef(0);
  const scrubRef = useRef(false);
  const dragRef = useRef(false);
  const [hover, setHover] = useState<number | null>(null);

  const maxTrim = Math.max(0, clipLen - windowLen);
  const whole = maxTrim <= 0.05; // the clip fits the slot — nothing to cut
  const at = clamp(r10(value), 0, r10(maxTrim));

  const secAt = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const f = r.width > 0 ? (clientX - r.left) / r.width : 0;
    return Math.min(clipLen, Math.max(0, f * clipLen));
  };

  /* window drag: slide, keeping the grab point under the finger */
  const winDown = (ev: RPointerEvent<HTMLDivElement>) => {
    ev.stopPropagation();
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    dragRef.current = true;
    grabRef.current = secAt(ev.clientX) - at;
  };
  const winMove = (ev: RPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    onChange(clamp(r10(secAt(ev.clientX) - grabRef.current), 0, maxTrim));
  };
  const winEnd = () => {
    dragRef.current = false;
  };
  /* keyboard cut: ±0.1s per press, same clamp as the pointer */
  const winKey = (ev: RKeyboardEvent<HTMLDivElement>) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    ev.preventDefault();
    const dir = ev.key === "ArrowLeft" ? -0.1 : 0.1;
    onChange(clamp(r10(at + dir), 0, maxTrim));
  };

  /* scrub on the empty track */
  const trackDown = (ev: RPointerEvent<HTMLDivElement>) => {
    if (!onScrub) return;
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    scrubRef.current = true;
    onScrub(secAt(ev.clientX));
  };
  const trackMove = (ev: RPointerEvent<HTMLDivElement>) => {
    setHover(secAt(ev.clientX));
    if (!scrubRef.current || !onScrub) return;
    onScrub(secAt(ev.clientX));
  };
  const trackEnd = () => {
    scrubRef.current = false;
  };

  if (clipLen <= 0 || windowLen <= 0) return null;

  const step = TICK_STEPS.find((s) => clipLen / s <= 13) ?? 60;
  const ticks: number[] = [];
  for (let k = 0; k * step <= clipLen + 1e-9; k++) ticks.push(r10(k * step));
  const leftPct = (at / clipLen) * 100;
  const winPct = ((whole ? clipLen : windowLen) / clipLen) * 100;

  return (
    <div className="space-y-2 select-none">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">Cut the clip</span>
        <span className="tabular-nums text-muted-foreground">
          {whole
            ? `whole ${fmtSec(clipLen)} clip`
            : `${fmtSec(at)} → ${fmtSec(at + windowLen)} of ${fmtSec(clipLen)}`}
        </span>
      </div>

      <div
        ref={trackRef}
        className={`relative h-12 touch-none overflow-hidden rounded-lg border border-border bg-secondary/50 ${
          onScrub && !whole ? "cursor-ew-resize" : ""
        }`}
        onPointerDown={trackDown}
        onPointerMove={trackMove}
        onPointerUp={trackEnd}
        onPointerCancel={trackEnd}
        onPointerLeave={() => setHover(null)}
      >
        {/* ticks over the full clip */}
        {ticks.map((t) => (
          <div
            key={t}
            className="pointer-events-none absolute inset-y-0"
            style={{ left: `${(t / clipLen) * 100}%` }}
          >
            <div className="absolute left-0 top-0 h-1.5 w-px bg-muted-foreground/30" />
            <span className="absolute bottom-0.5 left-0.5 text-[9px] tabular-nums text-muted-foreground/70">
              {fmtSec(t)}
            </span>
          </div>
        ))}

        {/* discarded parts — dimmed, exactly what won't play */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-background/55"
          style={{ width: `${leftPct}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 bg-background/55"
          style={{ width: `${Math.max(0, 100 - leftPct - winPct)}%` }}
        />

        {/* the window — the wanted part */}
        <div
          role="slider"
          tabIndex={whole ? -1 : 0}
          aria-label="Cut position — drag to slide the window, or use arrow keys"
          aria-valuemin={0}
          aria-valuemax={r10(maxTrim)}
          aria-valuenow={at}
          aria-valuetext={`${fmtSec(at)} of ${fmtSec(clipLen)}`}
          style={{ left: `${leftPct}%`, width: `${winPct}%` }}
          className={`absolute inset-y-1 z-10 rounded border-2 border-primary bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            whole ? "" : "cursor-grab active:cursor-grabbing"
          }`}
          onPointerDown={whole ? undefined : winDown}
          onPointerMove={whole ? undefined : winMove}
          onPointerUp={winEnd}
          onPointerCancel={winEnd}
          onKeyDown={whole ? undefined : winKey}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span className="h-4 w-0.5 rounded bg-primary/80" />
          </span>
        </div>

        {/* live scrub readout */}
        {hover !== null && !whole ? (
          <span className="pointer-events-none absolute top-0.5 z-20 -translate-x-1/2 rounded bg-secondary px-1 text-[9px] tabular-nums text-foreground shadow">
            {fmtSec(hover)}
          </span>
        ) : null}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {whole
          ? "This clip fits its slot whole — nothing to cut."
          : "Drag the window to cut the wanted part; tap the track to scrub the preview."}
      </p>
    </div>
  );
}
