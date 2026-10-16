/**
 * ClipCutDialog — cut a picked video for one slot (Step 3): the exact
 * 9:16 preview plus the full-length cut view. Applying lands the in-point
 * on that slot's content — the template structure never changes, and the
 * export records the same window the preview shows.
 */

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { ClipCutter } from "@/components/ClipCutter";
import { mediaWarnings, type ProbedMedia } from "@/lib/mediaUtils";
import { fmtSec } from "@/lib/format";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** shown in the title, e.g. "slot 2" */
  label: string;
  clip: ProbedMedia;
  /** the slot's length — the window is locked to it */
  slotDur: number;
  /** the current cut — read once when the dialog mounts */
  trimStart: number;
  onApply: (trimStart: number) => void;
}

export function ClipCutDialog({
  open,
  onOpenChange,
  label,
  clip,
  slotDur,
  trimStart,
  onApply,
}: Props) {
  /* mount it per cut (open toggles mount) — state starts from the trim */
  const [trim, setTrim] = useState(trimStart);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  /* keep the preview parked on the cut's first frame */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !open) return;
    try {
      v.currentTime = trim;
    } catch {
      /* metadata still loading */
    }
  }, [trim, open]);

  const maxTrim = Math.max(0, clip.duration - slotDur);
  const warnings = mediaWarnings(clip, slotDur);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cut the clip for {label}</DialogTitle>
          <DialogDescription>
            The {fmtSec(slotDur)} window is locked to the slot — slide it to
            cut the part you want.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 sm:grid sm:grid-cols-[9.5rem_1fr] sm:items-start sm:gap-x-4">
          <div className="mx-auto aspect-[9/16] w-48 overflow-hidden rounded-xl border border-border bg-black sm:w-full">
            <video
              ref={videoRef}
              src={clip.url}
              muted
              playsInline
              className="h-full w-full object-cover"
            />
          </div>

          <div className="space-y-3">
            {warnings.length > 0 ? (
              <ul className="space-y-1.5">
                {warnings.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-start gap-2 rounded-lg bg-secondary/70 px-3 py-2 text-xs text-secondary-foreground"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    {w.message}
                  </li>
                ))}
              </ul>
            ) : null}

            <ClipCutter
              clipLen={clip.duration}
              windowLen={slotDur}
              value={trim}
              onChange={setTrim}
              onScrub={(sec) => {
                const v = videoRef.current;
                if (!v) return;
                try {
                  v.currentTime = sec;
                } catch {
                  /* metadata still loading */
                }
              }}
            />

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  onApply(Math.min(trim, maxTrim));
                  onOpenChange(false);
                }}
              >
                Use this cut
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
