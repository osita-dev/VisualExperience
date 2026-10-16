/**
 * SONG WINDOW PICKER (D50).
 *
 * An imported song used to play from its own 0:00 — whatever sat at the
 * beginning was what you got. This shows the whole track as a real waveform
 * (peaks computed from the decoded buffer — never invented) with a movable
 * window that always covers the video's length: slide it anywhere and the
 * video plays exactly that part, in preview and in the export.
 *
 * Commit-on-release: dragging moves the window visually; the draft (and with
 * it the playing source) updates when you let go, so the audio re-anchors once
 * per gesture instead of stuttering on every pointer move.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { audio } from "@/player/audio";

const BAR_COUNT = 160;
/** peak-sample retries while the decode/registration settles (restore path) */
const GRAB_TRIES = 20;
const GRAB_RETRY_MS = 200;

interface SongWindowPickerProps {
  /** the `local:<fileId>` track whose decoded buffer draws the waveform */
  track: string;
  /** full song length, seconds */
  songDur: number;
  /** the video's total length — the window always covers this much */
  videoDur: number;
  /** committed window start, seconds into the song */
  start: number;
  /** fired once per gesture (pointer release / keyboard step) */
  onCommit: (start: number) => void;
  /** time formatter — reused from the builder so every label matches */
  format: (sec: number) => string;
}

export function SongWindowPicker({
  track,
  songDur,
  videoDur,
  start,
  onCommit,
  format,
}: SongWindowPickerProps) {
  const [drag, setDrag] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  /* the window follows the video — a song shorter than the video just
     loops, so there is nothing to choose in that case */
  const maxStart = Math.max(0, songDur - videoDur);
  const draggable = maxStart > 0.05;
  const cur = Math.max(0, Math.min(drag ?? start, maxStart));

  /* real peaks from the decoded buffer; the buffer lands a beat after the
     draft flips on restore, so retry briefly rather than show nothing.
     State is keyed by track, so switching songs self-resets with no
     synchronous setState inside the effect. */
  const [peakState, setPeakState] = useState<{
    track: string;
    peaks: number[];
  } | null>(null);
  const peaks = peakState && peakState.track === track ? peakState.peaks : null;
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const grab = () => {
      if (cancelled) return;
      const buf = audio.getTrack(track);
      if (!buf) {
        if (tries < GRAB_TRIES) {
          tries += 1;
          window.setTimeout(grab, GRAB_RETRY_MS);
        }
        return;
      }
      const data = buf.getChannelData(0);
      const step = Math.max(1, Math.floor(data.length / BAR_COUNT));
      const sample = Math.max(1, Math.floor(step / 64));
      const raw: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        let peak = 0;
        const base = i * step;
        for (let j = 0; j < step; j += sample) {
          const v = Math.abs(data[base + j] ?? 0);
          if (v > peak) peak = v;
        }
        raw.push(peak);
      }
      let max = 0;
      for (const p of raw) if (p > max) max = p;
      const norm = max > 0.0001 ? max : 1;
      setPeakState({ track, peaks: raw.map((p) => p / norm) });
    };
    const timer = window.setTimeout(grab, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [track]);

  const posToStart = useCallback(
    (clientX: number): number | null => {
      const el = trackRef.current;
      if (!el || maxStart <= 0) return null;
      const r = el.getBoundingClientRect();
      if (r.width <= 0) return null;
      // the window centers under the pointer — CapCut-style scrubbing
      const frac = (clientX - r.left) / r.width;
      return Math.max(0, Math.min(frac * songDur - videoDur / 2, maxStart));
    },
    [maxStart, songDur, videoDur],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const s = posToStart(e.clientX);
    if (s !== null) setDrag(s);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const s = posToStart(e.clientX);
    if (s !== null) setDrag(s);
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const s = posToStart(e.clientX) ?? drag;
    setDrag(null);
    onCommit(s);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!draggable) return;
    const step = e.shiftKey ? 2 : 0.5;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const next = Math.max(
        0,
        Math.min(cur + (e.key === "ArrowRight" ? step : -step), maxStart),
      );
      onCommit(next);
    }
  };

  const leftPct = (cur / songDur) * 100;
  const widthPct = (Math.min(videoDur, songDur - cur) / songDur) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-foreground">
          {draggable ? "Which part plays" : "Plays the whole song"}
        </p>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {draggable
            ? `${format(cur)} → ${format(cur + videoDur)}`
            : `${format(0)} → ${format(songDur)} · loops to fill the video`}
        </span>
      </div>
      <div
        ref={trackRef}
        role={draggable ? "slider" : undefined}
        aria-label="Song segment start"
        aria-valuemin={draggable ? 0 : undefined}
        aria-valuemax={draggable ? Math.round(maxStart * 10) / 10 : undefined}
        aria-valuenow={draggable ? Math.round(cur * 10) / 10 : undefined}
        aria-valuetext={draggable ? format(cur) : undefined}
        tabIndex={draggable ? 0 : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={`relative flex h-10 w-full items-center gap-px overflow-hidden rounded-md border border-border bg-secondary/40 px-1 ${
          draggable ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""
        }`}
      >
        {peaks
          ? peaks.map((p, i) => (
              <span
                key={i}
                className="min-w-0 flex-1 rounded-full bg-primary/35"
                style={{ height: `${Math.max(8, p * 100)}%` }}
              />
            ))
          : /* buffer still decoding — a neutral track, never invented peaks */
            Array.from({ length: 48 }, (_, i) => (
              <span
                key={i}
                className="min-w-0 flex-1 rounded-full bg-primary/15"
                style={{ height: "12%" }}
              />
            ))}
        {draggable ? (
          <div
            className="pointer-events-none absolute inset-y-0 rounded-md border-2 border-primary bg-primary/15"
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          >
            <span className="absolute left-1/2 top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/80" />
          </div>
        ) : null}
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>{format(0)}</span>
        <span>{format(songDur)}</span>
      </div>
    </div>
  );
}
