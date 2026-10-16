import { useEffect, useRef } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Schedule } from "@/core/model/types";
import type { Bindings } from "@/player/frame";
import { usePlayer, type PlayerHandle } from "@/hooks/usePlayer";
import { fmtClock } from "@/lib/format";

interface Props {
  schedule: Schedule;
  bindings: Bindings;
  soundOn: Record<string, boolean>;
  /** any string change forces a re-render of the paused frame */
  dirtyKey?: string;
  controls?: boolean;
  onReady?: (handle: PlayerHandle) => void;
  className?: string;
  /** overlay drag targets (D46) — normalized centre + width fraction */
  dragOverlays?: { id: string; x: number; y: number; size: number }[];
  /** fired while dragging an overlay (paused preview only) */
  onOverlayDrag?: (id: string, x: number, y: number) => void;
  /** fired the moment an overlay is picked up (paused preview only) */
  onOverlayPick?: (id: string) => void;
}

/**
 * The preview surface — canvas + transport. Uses the exact renderer and
 * audio engine the exporter records, so what you see is the file you get.
 */
export function PreviewCanvas({
  schedule,
  bindings,
  soundOn,
  dirtyKey,
  controls = true,
  onReady,
  className,
  dragOverlays,
  onOverlayDrag,
  onOverlayPick,
}: Props) {
  const { canvasRef, time, playing, handle } = usePlayer({
    schedule,
    bindings,
    soundOn,
    dirtyKey,
  });
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  useEffect(() => {
    readyRef.current?.(handle);
    // handle is stable (all callbacks use empty deps) — wire once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* overlay dragging (D46) — paused preview only. The gesture lives on
     invisible per-overlay handles (they carry touch-none), NOT on the
     canvas: the whole canvas used to be touch-none, which told the browser
     "never scroll a gesture that starts here" and swallowed thumb scrolling
     across the entire preview. Now only the small text/sticker regions
     block scroll (so a drag never turns into a page scroll) — a thumb
     anywhere else on the preview scrolls the page normally. */
  const dragIdRef = useRef<string | null>(null);
  const dragPropsRef = useRef({ dragOverlays, onOverlayDrag, onOverlayPick, playing });
  dragPropsRef.current = { dragOverlays, onOverlayDrag, onOverlayPick, playing };

  /* clientX/Y → normalized canvas position (the handles sit on top of the
     canvas, so the rect always comes from the canvas itself) */
  const toNorm = (clientX: number, clientY: number) => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return { x: 0, y: 0 };
    return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
  };

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-2xl border border-border bg-black shadow-lg">
        <canvas ref={canvasRef} className="block aspect-[9/16] w-full" />
        {/* drag handles (D46) — exactly the overlay boxes, nothing else.
            touch-none here keeps a drag from being hijacked as a page
            scroll; the rest of the canvas stays touchable/scrollable.
            Topmost overlay wins by DOM order (same as the old hit-test).
            While playing they don't render → touches pass through. */}
        {!playing && dragOverlays?.length
          ? dragOverlays.map((o) => {
              const wPct = o.size * 100;
              const hPct = o.size * (9 / 16) * 100;
              return (
                <div
                  key={o.id}
                  className="absolute touch-none"
                  style={{
                    left: `${o.x * 100 - wPct / 2}%`,
                    top: `${o.y * 100 - hPct / 2}%`,
                    width: `${wPct}%`,
                    height: `${hPct}%`,
                  }}
                  onPointerDown={(ev) => {
                    if (dragPropsRef.current.playing) return;
                    ev.currentTarget.setPointerCapture(ev.pointerId);
                    dragIdRef.current = o.id;
                    dragPropsRef.current.onOverlayPick?.(o.id);
                  }}
                  onPointerMove={(ev) => {
                    if (dragIdRef.current !== o.id) return;
                    const { x, y } = toNorm(ev.clientX, ev.clientY);
                    dragPropsRef.current.onOverlayDrag?.(
                      o.id,
                      Math.min(1, Math.max(0, x)),
                      Math.min(1, Math.max(0, y)),
                    );
                  }}
                  onPointerUp={() => {
                    dragIdRef.current = null;
                  }}
                  onPointerCancel={() => {
                    dragIdRef.current = null;
                  }}
                />
              );
            })
          : null}
        {controls ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-3 pb-2.5 pt-10">
            <div className="flex items-center gap-1.5">
              <Button
                size="icon"
                variant="secondary"
                className="h-11 w-11 rounded-full bg-white/90 text-black hover:bg-white md:h-10 md:w-10"
                onClick={handle.toggle}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-11 w-11 rounded-full text-white hover:bg-white/15 hover:text-white md:h-10 md:w-10"
                onClick={handle.restart}
                aria-label="Restart"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
            <span className="text-xs font-semibold tabular-nums text-white/90">
              {fmtClock(time)} / {fmtClock(schedule.duration)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
