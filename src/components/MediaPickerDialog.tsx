import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Film, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ClipCutter } from "@/components/ClipCutter";
import { toast } from "sonner";
import type { MediaSlot } from "@/core/model/types";
import {
  mediaWarnings,
  maxTrimStart,
  type ProbedMedia,
} from "@/lib/mediaUtils";
import { ingestWithToast } from "@/lib/ingest";
import { fmtSec } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: MediaSlot;
  /** DERIVED slot length in seconds — the app never asks for it */
  slotDur: number;
  existing?: ProbedMedia;
  /** the slot's current cut — kept when reopening to adjust it */
  trimStart?: number;
  onPick: (m: ProbedMedia, trimStart: number) => void;
}

/**
 * Media picker: choose file → see the exact 9:16 crop → slide the
 * fixed-length window (pick_clip_window). No duration typing anywhere.
 */
export function MediaPickerDialog({
  open,
  onOpenChange,
  slot,
  slotDur,
  existing,
  trimStart,
  onPick,
}: Props) {
  const [picked, setPicked] = useState<ProbedMedia | null>(null);
  const [trim, setTrim] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (open) {
      setPicked(existing ?? null);
      /* reopening keeps the current cut (clamped to this slot's window) */
      const max = existing ? maxTrimStart(existing, slotDur) : 0;
      setTrim(Math.min(trimStart ?? 0, max));
    }
  }, [open, existing, trimStart, slotDur]);

  // live trim preview — scrub the sample frame to the window start
  useEffect(() => {
    const v = previewRef.current;
    if (v && picked?.isVideo) {
      try {
        v.currentTime = trim;
      } catch {
        /* metadata still loading */
      }
    }
  }, [trim, picked]);

  const accept =
    slot.accepts.includes("photo") && slot.accepts.includes("video")
      ? "image/*,video/*"
      : slot.accepts.includes("video")
        ? "video/*"
        : "image/*";

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      /* probes; a video the browser refuses is converted on-device */
      const m = await ingestWithToast(file);
      const ok =
        (m.isVideo && slot.accepts.includes("video")) ||
        (!m.isVideo && slot.accepts.includes("photo"));
      if (!ok) {
        toast.error(`This slot takes ${slot.accepts.join(" and ")} only.`);
        return;
      }
      setPicked(m);
      setTrim(0);
    } catch {
      /* the ingest bridge already showed the honest error */
    } finally {
      setBusy(false);
    }
  }

  const warnings = picked ? mediaWarnings(picked, slotDur) : [];
  const maxTrim = picked ? maxTrimStart(picked, slotDur) : 0;
  const clipLen = picked && !picked.isVideo ? Infinity : picked?.duration ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {slot.accepts.join(" or ")} for slot {slot.id.replace("s", "#")}
          </DialogTitle>
          <DialogDescription>
            The {fmtSec(slotDur)} window is fixed to the template — just pick
            your favourite slice.
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
              {busy ? "Preparing your clip…" : "Drop a file or click to browse"}
            </span>
            <span className="text-xs text-muted-foreground">
              {slot.accepts.join(" or ")} · auto-cropped to 9:16
            </span>
          </button>
        ) : (
          <div className="space-y-4 sm:grid sm:grid-cols-[9.5rem_1fr] sm:items-start sm:gap-x-4 sm:gap-y-0">
            {/* exact crop preview */}
            <div className="mx-auto aspect-[9/16] w-48 overflow-hidden rounded-xl border border-border bg-black sm:w-full">
              {picked.isVideo ? (
                <video
                  ref={previewRef}
                  src={picked.url}
                  muted
                  playsInline
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

            <div className="space-y-4">
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
              <ClipCutter
                clipLen={clipLen}
                windowLen={slotDur}
                value={trim}
                onChange={setTrim}
                onScrub={(sec) => {
                  const v = previewRef.current;
                  if (!v) return;
                  try {
                    v.currentTime = sec;
                  } catch {
                    /* metadata still loading */
                  }
                }}
              />
            ) : null}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => fileRef.current?.click()}
              >
                <Film className="mr-2 h-4 w-4" />
                Change file
              </Button>
              <Button
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={busy}
                onClick={() => {
                  if (!picked) return;
                  onPick(picked, Math.min(trim, maxTrim));
                  onOpenChange(false);
                }}
              >
                Use this {picked.isVideo ? "clip" : "photo"}
              </Button>
            </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
