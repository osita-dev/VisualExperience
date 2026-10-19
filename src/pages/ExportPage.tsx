import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { ExportPanel } from "@/components/ExportPanel";
import { useProject } from "@/hooks/useProject";
import { getExportSupport } from "@/exporter/exportVideo";
import { FrameRenderer } from "@/player/frame";
import { fmtSec } from "@/lib/format";

/** Export — encodes the exact preview pipeline (WebCodecs, else ffmpeg.wasm).
 *  The flow itself lives in ExportPanel (D48): the creator studio runs
 *  the identical component, so both pages export the same way. */
const ExportPage = () => {
  const { id } = useParams();
  const project = useProject();
  const template =
    project.template && project.template.id === id ? project.template : null;

  const [result, setResult] = useState<{
    url: string;
    ext: string;
    type: string;
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const support = useMemo(() => getExportSupport(), []);
  const soundOn = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(project.states).map(([k, v]) => [k, v.soundOn]),
      ),
    [project.states],
  );

  // static first-frame preview
  useEffect(() => {
    if (!template || !project.schedule) return;
    const c = canvasRef.current;
    if (!c) return;
    c.width = 315;
    c.height = 560;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const r = new FrameRenderer();
    r.render(ctx, c.width, c.height, project.schedule, project.bindings, 0);
  }, [template, project.schedule, project.bindings]);

  if (!template || !project.schedule) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          icon="🎬"
          title="Nothing to export yet"
          description="Pick media for your template first — then come back and export."
          action={
            <Button asChild>
              <Link to={id ? `/t/${id}/fill` : "/"}>Go to the slot-filler</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const schedule = project.schedule;
  const missing = project.totalMedia - project.filledMedia;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link to={`/t/${template.id}/fill`} aria-label="Back to editing">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-base font-bold text-foreground">Export</h1>
            <p className="text-xs text-muted-foreground tabular-nums">
              {template.title} · {fmtSec(schedule.duration)}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-6 md:grid md:grid-cols-[19rem_1fr] md:items-start lg:grid-cols-[21rem_1fr]">
          {/* preview / result column */}
          <div className="mx-auto w-full max-w-[315px] md:sticky md:top-20 md:mx-0">
            {result ? (
              <video
                key={result.url}
                src={result.url}
                controls
                autoPlay
                loop
                playsInline
                preload="auto"
                className="block aspect-[9/16] w-full rounded-2xl border border-border bg-black"
              />
            ) : (
              <canvas
                ref={canvasRef}
                className="block aspect-[9/16] w-full rounded-2xl border border-border bg-black"
              />
            )}
          </div>

          <div className="min-w-0 space-y-5">
            {!support.ok ? (
              <EmptyState
                icon="🚫"
                title="Export isn't available in this browser"
                description={support.reason}
              />
            ) : (
              <>
                {missing > 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 text-primary" />
                    {missing} slot{missing > 1 ? "s" : ""} still empty —
                    {missing === project.totalMedia
                      ? " add photos or videos to build your video."
                      : " they'll be left out of the export."}
                  </div>
                ) : null}

                <ExportPanel
                  schedule={schedule}
                  bindings={project.bindings}
                  soundOn={soundOn}
                  nameBase={`frame-${template.id}`}
                  title="Export"
                  onResult={setResult}
                />

                {result ? (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {template.music.local
                      ? `Before posting: your video uses the track you imported (${template.music.local.name}) — you're responsible for having the rights to it.`
                      : `Before posting: your video uses the template's tone music — procedural and royalty-free by design, safe to post anywhere.`}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ExportPage;
