/**
 * THE MEDIA WORKBENCH — the creator's upload popup, fully local: pick a
 * photo or video, preview the exact 9:16 crop (with playback), and add
 * it with the slot's length taken from the clip's own duration
 * ("40.3s clip → 40.3s slot" — every number computed, never typed),
 * capped by the remaining total budget (MAX_TOTAL_SEC). No network, no services.
 * The viewer slot-filler keeps its own pick-a-window dialog.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { MediaSlot } from "@/core/model/types";
import { MAX_TOTAL_SEC } from "@/core/model/types";
import { mediaWarnings, type ProbedMedia } from "@/lib/mediaUtils";
import { ingestWithToast } from "@/lib/ingest";
import { fmtSec } from "@/lib/format";
import { cn } from "@/lib/utils";

type Busy = null | "read" | "convert";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: MediaSlot;
  /** the slot's current length in seconds (photo copy) */
  currentSec: number;
  /** how many seconds this slot may grow to (remaining total budget) */
  maxSec: number;
  existing?: ProbedMedia;
  /** sec = null keeps the slot's current length (photos) */
  onAdd: (m: ProbedMedia, sec: number | null) => void;
}

export function MediaWorkbench({
  open,
  onOpenChange,
  slot,
  currentSec,
  maxSec,
  existing,
  onAdd,
}: Props) {
  const [picked, setPicked] = useState<ProbedMedia | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPicked(existing ?? null);
      setBusy(null);
    }
  }, [open, existing]);

  // the slot's length derives from the clip — budget-capped, plain seconds
  const rawSec = picked?.isVideo ? picked.duration : 0;
  const videoSec = picked?.isVideo
    ? Math.min(rawSec, Math.max(1, maxSec))
    : 0;

  const accept =
    slot.accepts.includes("photo") && slot.accepts.includes("video")
      ? "image/*,video/*"
      : slot.accepts.includes("video")
        ? "video/*"
        : "image/*";

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy("read");
    try {
      /* probes; a video the browser refuses is converted on-device */
      const m = await ingestWithToast(file, () => setBusy("convert"));
      const ok =
        (m.isVideo && slot.accepts.includes("video")) ||
        (!m.isVideo && slot.accepts.includes("photo"));
      if (!ok) {
        toast.error(`This slot takes ${slot.accepts.join(" and ")} only.`);
        return;
      }
      setPicked(m);
    } catch {
      /* the ingest bridge already showed the honest error */
    } finally {
      setBusy(null);
    }
  }

  function handleAdd() {
    if (!picked || busy) return;
    if (!picked.isVideo) {
      onAdd(picked, null);
      toast.success(`Photo added — slot stays at ${fmtSec(currentSec)}.`);
      return;
    }
    onAdd(picked, videoSec);
    toast.success(`Slot is now ${fmtSec(videoSec)}.`);
  }

  const warnings = picked
    ? mediaWarnings(picked, picked.isVideo ? videoSec : 0)
    : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && busy !== null) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Media for slot {slot.id.replace("s", "#")}</DialogTitle>
          <DialogDescription>
            {!picked
              ? "Pick a photo or video — you'll preview it before it goes in."
              : picked.isVideo
                ? "The slot takes your clip's length."
                : "Photo — the slot keeps its current length."}
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />

        {!picked ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFiles(e.dataTransfer.files);
            }}
            className={cn(
              "flex aspect-[9/16] max-h-72 w-full mx-auto flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors",
              dragging
                ? "border-primary bg-primary/10"
                : "border-border bg-secondary/40 hover:border-primary/50",
            )}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {busy === "convert"
                ? "Converting on your device…"
                : busy === "read"
                  ? "Reading…"
                  : "Drop a file or click to browse"}
            </span>
            <span className="text-xs text-muted-foreground">
              {slot.accepts.join(" and ")} · previewed in 9:16
            </span>
          </button>
        ) : (
          <div className="space-y-4 sm:grid sm:grid-cols-[10.5rem_1fr] sm:items-start sm:gap-x-4 sm:gap-y-0">
            {/* exact crop preview */}
            <div className="mx-auto aspect-[9/16] w-48 overflow-hidden rounded-xl border border-border bg-black sm:w-full">
              {picked.isVideo ? (
                <video
                  src={picked.url}
                  playsInline
                  controls
                  className="h-full w-full object-cover"
                />
              ) : (
                <img
                  src={picked.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
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

              {picked.isVideo ? (
                <div className="space-y-2">
                  {/* live math — the slot's length, derived from the clip */}
                  <div className="rounded-lg bg-secondary/70 px-3 py-2 text-xs leading-relaxed text-secondary-foreground">
                    Clip{" "}
                    <span className="font-semibold tabular-nums text-primary">
                      {fmtSec(picked.duration)}
                    </span>{" "}
                    → slot{" "}
                    <span className="font-semibold tabular-nums text-primary">
                      {fmtSec(videoSec)}
                    </span>
                  </div>
                  {rawSec > videoSec ? (
                    <p className="text-[11px] text-muted-foreground">
                      Capped by the {MAX_TOTAL_SEC}s total budget — shorten
                      another slot first if you need more.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="rounded-lg bg-secondary/70 px-3 py-2 text-xs text-secondary-foreground">
                  Photo fills the 9:16 crop · the slot keeps its{" "}
                  <span className="font-semibold tabular-nums text-primary">
                    {fmtSec(currentSec)}
                  </span>{" "}
                  length.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => fileRef.current?.click()}
                >
                  {busy !== null ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Change file
                </Button>
                <div className="flex-1" />
                <Button
                  size="sm"
                  disabled={busy !== null}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={handleAdd}
                >
                  {picked.isVideo ? `Add ${fmtSec(videoSec)}` : "Add to slot"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
