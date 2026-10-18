/**
 * TimelineStrip — the CapCut-style chain timeline for the builder (Step 2).
 * Every slot is drawn to scale in plain seconds, lime grips sit on each
 * cut (drag = ripple-trim between the two neighbouring slots) and on the
 * end of the chain (drag = grow/shrink the total inside the budget).
 * The ruler scrubs the preview, the playhead follows the player every
 * frame via direct DOM writes, and every number derives from the draft.
 */

import { memo, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as RKeyboardEvent, PointerEvent as RPointerEvent } from "react";
import { MAX_TOTAL_SEC } from "@/core/model/types";
import { fmtSec } from "@/lib/format";
import { timelineStarts, trimAtBoundary } from "@/lib/timeline";

export interface StripSlot {
  uid: string;
  /** slot length in seconds */
  dur: number;
  /** test-media thumbnail (builder preview only, never ships) */
  thumb?: string;
}

interface Props {
  slots: StripSlot[];
  selected: string | null;
  onSelect: (uid: string) => void;
  /** new lengths for the slots that changed (already clamped to 0.1s) */
  onDurs: (next: { uid: string; dur: number }[]) => void;
  /** live playhead — omit for a static, read-only strip */
  getTime?: () => number;
  /** scrub target — omit to disable scrubbing */
  onSeek?: (sec: number) => void;
}

/** ruler tick spacing: the first step that keeps the labels readable */
const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300];
const r10 = (v: number): number => Math.round(v * 10) / 10;

/* memoized: the builder feeds value-stable props, so edits that don't
   touch the chain (typing text, music, look) skip this whole subtree —
   one of the "don't re-render the world" wins of the perf round */
export const TimelineStrip = memo(function TimelineStrip({
  slots,
  selected,
  onSelect,
  onDurs,
  getTime,
  onSeek,
}: Props) {
  const total = slots.reduce((a, s) => a + s.dur, 0);
  const starts = timelineStarts(slots.map((s) => s.dur));
  const n = slots.length;

  const headRef = useRef<HTMLDivElement | null>(null);
  /** the boundary being dragged (or nudged with arrow keys) */
  const activeRef = useRef<number | null>(null);
  const scrubbingRef = useRef(false);
  const [drag, setDrag] = useState<{ b: number; sec: number } | null>(null);

  /* playhead — one rAF loop, direct style writes, no React re-render */
  useEffect(() => {
    if (!getTime || total <= 0) return;
    let raf = 0;
    const tick = () => {
      const head = headRef.current;
      if (head) {
        const t = getTime();
        const pct = Math.min(100, Math.max(0, (t / total) * 100));
        head.style.left = `${pct}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getTime, total]);

  /* pointer position → seconds along the chain */
  const secAt = (el: HTMLElement, clientX: number): number => {
    const r = el.getBoundingClientRect();
    const f = r.width > 0 ? (clientX - r.left) / r.width : 0;
    return Math.min(total, Math.max(0, f * total));
  };

  /** move a boundary; returns its clamped position (the live readout) */
  const applyBoundary = (b: number, rawSec: number): number => {
    const res = trimAtBoundary(
      slots.map((s) => s.dur),
      b,
      rawSec,
    );
    const next: { uid: string; dur: number }[] = [];
    res.durs.forEach((d, i) => {
      if (Math.abs(d - slots[i].dur) > 1e-9)
        next.push({ uid: slots[i].uid, dur: d });
    });
    if (next.length) onDurs(next);
    return res.pos;
  };

  /* boundary position in seconds: cuts live at starts[b], the end at total */
  const posOf = (b: number): number => (b >= n ? total : starts[b]);

  const handleDown = (b: number) => (ev: RPointerEvent<HTMLDivElement>) => {
    ev.stopPropagation();
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    activeRef.current = b;
    setDrag({ b, sec: applyBoundary(b, secAt(ev.currentTarget, ev.clientX)) });
  };
  const handleMove = (b: number) => (ev: RPointerEvent<HTMLDivElement>) => {
    if (activeRef.current !== b) return;
    setDrag({ b, sec: applyBoundary(b, secAt(ev.currentTarget, ev.clientX)) });
  };
  const endBoundaryDrag = () => {
    if (activeRef.current === null) return;
    activeRef.current = null;
    setDrag(null);
  };
  /* keyboard trim: ±0.5s per press, same clamp as the pointer */
  const handleKey = (b: number) => (ev: RKeyboardEvent<HTMLDivElement>) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    ev.preventDefault();
    const dir = ev.key === "ArrowLeft" ? -0.5 : 0.5;
    setDrag({ b, sec: applyBoundary(b, posOf(b) + dir) });
  };

  /* ruler scrubbing */
  const scrubDown = (ev: RPointerEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    scrubbingRef.current = true;
    onSeek(secAt(ev.currentTarget, ev.clientX));
  };
  const scrubMove = (ev: RPointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current || !onSeek) return;
    onSeek(secAt(ev.currentTarget, ev.clientX));
  };
  const scrubEnd = () => {
    scrubbingRef.current = false;
  };

  if (n === 0 || total <= 0) return null;

  const step = TICK_STEPS.find((s) => total / s <= 13) ?? 60;
  const ticks: number[] = [];
  for (let k = 0; k * step <= total + 1e-9; k++) ticks.push(r10(k * step));
  const atCap = total >= MAX_TOTAL_SEC - 1e-6;

  return (
    <div className="space-y-1.5 select-none">
      {/* ruler + track share one coordinate system (ruler doubles as the
          scrub bar — dragging it moves the preview playhead) */}
      <div className="relative overflow-hidden rounded-lg border border-border bg-secondary/40">
        <div
          className={`relative h-7 touch-none overflow-hidden border-b border-border/60 bg-secondary/60 ${
            onSeek ? "cursor-ew-resize" : ""
          }`}
          onPointerDown={scrubDown}
          onPointerMove={scrubMove}
          onPointerUp={scrubEnd}
          onPointerCancel={scrubEnd}
          role={onSeek ? "slider" : undefined}
          aria-label={onSeek ? "Playhead — drag to scrub the preview" : undefined}
          aria-valuemin={onSeek ? 0 : undefined}
          aria-valuemax={onSeek ? r10(total) : undefined}
        >
          {ticks.map((t) => {
            const pct = (t / total) * 100;
            const pos =
              t <= 0
                ? "left-0.5"
                : pct > 90
                  ? "right-0.5"
                  : "left-0 -translate-x-1/2";
            return (
              <div key={t} className="absolute inset-y-0" style={{ left: `${pct}%` }}>
                <div className="absolute left-0 top-0 h-2 w-px bg-muted-foreground/40" />
                <span
                  className={`absolute top-1/2 -translate-y-1/2 text-[9px] tabular-nums text-muted-foreground ${pos}`}
                >
                  {fmtSec(t)}
                </span>
              </div>
            );
          })}
        </div>

        {/* the chain — blocks drawn to scale */}
        <div className="relative h-16">
          {slots.map((s, i) => {
            const isSel = selected === s.uid;
            const showLabel = s.dur / total >= 0.1;
            return (
              <button
                key={s.uid}
                type="button"
                onClick={() => onSelect(s.uid)}
                aria-pressed={isSel}
                aria-label={`Slot ${i + 1}, ${fmtSec(s.dur)}, ${fmtSec(starts[i])} to ${fmtSec(starts[i] + s.dur)}`}
                title={`Slot ${i + 1} · ${fmtSec(s.dur)} · ${fmtSec(starts[i])}–${fmtSec(starts[i] + s.dur)}`}
                style={{
                  left: `${(starts[i] / total) * 100}%`,
                  width: `${(s.dur / total) * 100}%`,
                }}
                className={`absolute inset-y-1 overflow-hidden rounded-md border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isSel
                    ? "border-primary/80 bg-primary/15"
                    : "border-border/70 bg-secondary/70 hover:border-border"
                }`}
              >
                {s.thumb ? (
                  <span
                    aria-hidden
                    className="absolute inset-0 bg-cover bg-center opacity-40"
                    style={{ backgroundImage: `url(${s.thumb})` }}
                  />
                ) : null}
                {showLabel ? (
                  <span className="relative flex h-full flex-col justify-between p-1 text-[9px] font-medium leading-none text-foreground/90">
                    <span className="tabular-nums">S{i + 1}</span>
                    <span className="tabular-nums">{fmtSec(s.dur)}</span>
                  </span>
                ) : null}
              </button>
            );
          })}

          {/* boundary grips: cuts 1..n-1 between slots, n at the end */}
          {Array.from({ length: n }, (_, idx) => idx + 1).map((b) => {
            const isEnd = b >= n;
            const pos = posOf(b);
            return (
              <div
                key={`h${b}`}
                role="slider"
                tabIndex={0}
                aria-label={
                  isEnd
                    ? "End of the chain — drag to change the total length"
                    : `Cut between slot ${b} and slot ${b + 1} — drag to move the cut`
                }
                aria-valuemin={0}
                aria-valuemax={r10(total)}
                aria-valuenow={r10(pos)}
                aria-valuetext={fmtSec(pos)}
                style={{ left: `${(pos / total) * 100}%` }}
                className="group absolute inset-y-0 z-20 -ml-2.5 flex w-5 cursor-ew-resize touch-none items-center justify-center focus-visible:outline-none"
                onPointerDown={handleDown(b)}
                onPointerMove={handleMove(b)}
                onPointerUp={endBoundaryDrag}
                onPointerCancel={endBoundaryDrag}
                onLostPointerCapture={endBoundaryDrag}
                onKeyDown={handleKey(b)}
                onKeyUp={() =>
                  setDrag((d) => (d && d.b === b ? null : d))
                }
              >
                <span
                  aria-hidden
                  className={`h-7 w-0.5 rounded-full transition-colors ${
                    drag?.b === b
                      ? "bg-primary"
                      : "bg-primary/50 group-hover:bg-primary"
                  }`}
                />
                {drag?.b === b ? (
                  <span className="pointer-events-none absolute -top-5 left-1/2 z-30 -translate-x-1/2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary-foreground shadow">
                    {fmtSec(drag.sec)}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* playhead — spans ruler + track, moved by rAF (z below grips) */}
        {getTime ? (
          <div
            ref={headRef}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-10 w-px bg-primary"
            style={{ left: "0%" }}
          >
            <span className="absolute -left-[3px] top-0 h-1.5 w-1.5 rounded-full bg-primary" />
          </div>
        ) : null}
      </div>

      {/* computed summary — never a hardcoded number */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span
          className={`font-semibold tabular-nums ${atCap ? "text-destructive" : "text-muted-foreground"}`}
        >
          {fmtSec(total)} / {MAX_TOTAL_SEC}s
        </span>
        <span className="text-muted-foreground">
          {n} slot{n === 1 ? "" : "s"} · {n - 1} cut{n - 1 === 1 ? "" : "s"} ·
          drag grips to trim
        </span>
      </div>
    </div>
  );
});
