import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Film,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Schedule } from "@/core/model/types";
import type { Bindings } from "@/player/frame";
import { exportVideo, getExportSupport } from "@/exporter/exportVideo";

type Phase = "idle" | "exporting" | "done" | "error";

interface ExportPanelProps {
  schedule: Schedule;
  bindings: Bindings;
  soundOn: Record<string, boolean>;
  /** download filename base (no extension) */
  nameBase: string;
  /** card heading */
  title?: string;
  /** one-line description in the idle state */
  hint?: string;
  /** inline result player in the done state (card layout) */
  showPreview?: boolean;
  /** mirrors result changes so a page can surface the player itself */
  onResult?: (r: { url: string; ext: string; type: string } | null) => void;
  /** called right before recording starts (e.g. pause the live preview) */
  onStart?: () => void;
  /** cover the screen with progress while recording (blocks stray edits) */
  blocking?: boolean;
  className?: string;
}

/**
 * The ONE export flow (D48) — quality picker, readiness waits, recording,
 * download/share — used by both the template page and the creator studio,
 * so an export is identical no matter where it's started.
 */
export function ExportPanel({
  schedule,
  bindings,
  soundOn,
  nameBase,
  title = "Export video",
  hint,
  showPreview = false,
  onResult,
  onStart,
  blocking = false,
  className,
}: ExportPanelProps) {
  const [resolution, setResolution] = useState<720 | 1080>(720);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    url: string;
    ext: string;
    type: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const cancelRef = useRef({ cancelled: false });
  const support = useMemo(() => getExportSupport(), []);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const setResultBoth = (r: { url: string; ext: string; type: string } | null) => {
    setResult(r);
    onResultRef.current?.(r);
  };

  /* revoke the object URL when it's replaced, reset, or unmounted */
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );

  const startExport = async () => {
    if (!support.ok) {
      setErrorMsg(support.reason ?? "Export isn't supported in this browser.");
      setPhase("error");
      return;
    }
    onStart?.();
    cancelRef.current = { cancelled: false };
    setPhase("exporting");
    setProgress(0);
    setResultBoth(null);
    setErrorMsg("");
    // hidden-but-attached, FULL-SIZE canvas: captureStream needs a live
    // element — a 1px or display:none canvas can lose painted frames
    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:fixed;left:-9999px;top:0;width:720px;height:1280px;pointer-events:none";
    document.body.appendChild(canvas);
    try {
      const out = await exportVideo({
        canvas,
        schedule,
        bindings,
        soundOn,
        width: resolution,
        height: Math.round((resolution * 16) / 9),
        onProgress: (p) => setProgress(Math.round(p * 100)),
        signal: cancelRef.current,
      });
      if (cancelRef.current.cancelled) {
        setPhase("idle");
        setProgress(0);
        return;
      }
      setResultBoth({
        url: URL.createObjectURL(out.blob),
        ext: out.ext,
        type: out.blob.type,
      });
      setPhase("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Export failed.");
      setPhase("error");
    } finally {
      canvas.remove();
    }
  };

  const share = async () => {
    if (!result) return;
    try {
      const blob = await (await fetch(result.url)).blob();
      const file = new File([blob], `visual-experience.${result.ext}`, {
        type: result.type,
      });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Made with Visual Experience",
        });
      } else {
        toast.error("Sharing isn't supported here — use Download instead.");
      }
    } catch {
      /* user dismissed the share sheet */
    }
  };

  const qualities = [
    {
      value: 720 as const,
      title: "720p",
      desc: "Fast export, smaller file — great for stories.",
    },
    {
      value: 1080 as const,
      title: "1080p",
      desc: "Full HD, sharper detail — slower to record.",
    },
  ];

  return (
    <>
      {blocking && phase === "exporting" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-6 backdrop-blur">
          <Card className="w-full max-w-sm border-border bg-card">
            <CardContent className="space-y-4 p-5 text-center">
              <h2 className="text-sm font-semibold text-foreground">
                Exporting video…
              </h2>
              <Progress value={progress} className="w-full" />
              <p className="text-xs tabular-nums text-muted-foreground">
                {progress}% — keep this tab open.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  cancelRef.current.cancelled = true;
                }}
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card className={`border-border bg-card ${className ?? ""}`}>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {result && phase === "done" ? (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                {result.ext} ready
              </span>
            ) : null}
          </div>

          {!support.ok ? (
            <p className="text-xs text-destructive">
              {support.reason ?? "Export isn't supported in this browser."}
            </p>
          ) : null}

          {support.ok && phase === "idle" ? (
            <>
              {hint ? (
                <p className="text-[11px] text-muted-foreground">{hint}</p>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                {qualities.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setResolution(r.value)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      resolution === r.value
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary/40 hover:border-primary/40"
                    }`}
                  >
                    <div className="text-sm font-bold text-foreground">
                      {r.title}
                    </div>
                    <div className="text-xs text-muted-foreground">{r.desc}</div>
                  </button>
                ))}
              </div>
              <Button
                className="w-full bg-primary text-base font-bold text-primary-foreground hover:bg-primary/90"
                onClick={() => void startExport()}
              >
                <Film className="mr-2 h-5 w-5" />
                Export {resolution}p
              </Button>
            </>
          ) : null}

          {phase === "exporting" && !blocking ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                <span>Exporting…</span>
                <span className="tabular-nums text-primary">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                This may take a few moments. Keep the app open — we're recording
                the same pipeline you just previewed.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  cancelRef.current.cancelled = true;
                }}
              >
                Cancel
              </Button>
            </div>
          ) : null}

          {phase === "done" && result ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Your video is ready (.{result.ext})
              </div>
              {showPreview ? (
                <video
                  key={result.url}
                  src={result.url}
                  controls
                  autoPlay
                  loop
                  playsInline
                  preload="auto"
                  className="block aspect-[9/16] w-full rounded-lg border border-border bg-black"
                />
              ) : null}
              <div className="flex gap-2">
                <Button
                  asChild
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <a href={result.url} download={`${nameBase}.${result.ext}`}>
                    <Download className="mr-2 h-4 w-4" />
                    Save video
                  </a>
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => void share()}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                </Button>
              </div>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setResultBoth(null);
                  setPhase("idle");
                  setProgress(0);
                }}
              >
                Make another
              </Button>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                The player is the exact file you'll download. If a downloaded
                file won't open in your device's default player, play it here or
                open it in Chrome — recorded MP4/WebM uses a streaming container
                that some older desktop players don't understand.
              </p>
            </div>
          ) : null}

          {phase === "error" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Export failed
              </div>
              <p className="text-xs text-muted-foreground">{errorMsg}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPhase("idle")}
              >
                Try again
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
