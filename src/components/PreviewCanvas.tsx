import { useEffect, useRef, type PointerEvent as RPointerEvent } from "react";
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

  /* overlay dragging (D46) — paused preview only, topmost layer first */
  const dragIdRef = useRef<string | null>(null);
  const dragPropsRef = useRef({ dragOverlays, onOverlayDrag, onOverlayPick, playing });
  dragPropsRef.current = { dragOverlays, onOverlayDrag, onOverlayPick, playing };

  const toNorm = (ev: RPointerEvent<HTMLCanvasElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) / r.width,
      y: (ev.clientY - r.top) / r.height,
    };
  };
  const pickOverlay = (x: number, y: number): string | null => {
    const list = dragPropsRef.current.dragOverlays ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      const halfH = (o.size * (9 / 16)) / 2;
      if (Math.abs(x - o.x) <= o.size / 2 && Math.abs(y - o.y) <= halfH)
        return o.id;
    }
    return null;
  };

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-2xl border border-border bg-black shadow-lg">
        <canvas
          ref={canvasRef}
          className="block aspect-[9/16] w-full touch-none"
          onPointerDown={(ev) => {
            if (dragPropsRef.current.playing) return;
            if (!dragPropsRef.current.dragOverlays?.length) return;
            const { x, y } = toNorm(ev);
            const id = pickOverlay(x, y);
            if (!id) return;
            ev.currentTarget.setPointerCapture(ev.pointerId);
            dragIdRef.current = id;
            dragPropsRef.current.onOverlayPick?.(id);
          }}
          onPointerMove={(ev) => {
            if (!dragIdRef.current) return;
            const { x, y } = toNorm(ev);
            dragPropsRef.current.onOverlayDrag?.(
              dragIdRef.current,
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
