import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Music2, Play, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/EmptyState";
import { PreviewCanvas } from "@/components/PreviewCanvas";
import type { PlayerHandle } from "@/hooks/usePlayer";
import { useProject } from "@/hooks/useProject";
import { getPreset } from "@/presets/data";
import { getTone } from "@/core/audio/tones";
import { isToneTrack, toneTrackId } from "@/core/model/types";
import { getTemplateEntry } from "@/templates/library";
import { metrics } from "@/templates/registry";
import { fmtSec } from "@/lib/format";

/** Template detail — computed preview + facts + licensing note + CTA. */
const TemplateDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const project = useProject();
  const entry = id ? getTemplateEntry(id) : undefined;
  const template = entry && entry.issues.length === 0 ? entry.template : undefined;
  const [, setHandle] = useState<PlayerHandle | null>(null);

  useEffect(() => {
    if (template) project.loadTemplate(template);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id]);

  const soundOn = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(project.states).map(([k, v]) => [k, v.soundOn]),
      ),
    [project.states],
  );

  // What's inside — computed from the template's own connections (no typing)
  const inside = useMemo(() => {
    if (!template) return [];
    const names = new Set<string>();
    for (const c of template.connections) {
      const p = getPreset(c.preset, c.version);
      if (p) names.add(p.name);
    }
    return [...names];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id]);

  if (!entry || !template) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          icon="🧩"
          title={entry ? "This template failed to load" : "Template not found"}
          description={
            entry
              ? `Validation issues: ${entry.issues.map((i) => `${i.rule} — ${i.message}`).join("; ")}`
              : "It may have been removed. Head back to the library."
          }
          action={
            <Button asChild variant="outline">
              <Link to="/">Back to library</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const ready = project.template?.id === template.id && project.schedule;
  const m = metrics(template);
  const tone = isToneTrack(template.music.track)
    ? getTone(toneTrackId(template.music.track))
    : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link to="/" aria-label="Back to library">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-foreground">
              {template.title}
            </h1>
            <p className="text-xs text-muted-foreground tabular-nums">
              {fmtSec(m.duration)} · {m.mediaSlots} media + {m.textSlots} text slots
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <div className="mx-auto w-full max-w-xs shrink-0 md:sticky md:top-20 md:mx-0 md:w-72 md:max-w-none lg:w-80">
            {ready ? (
              <PreviewCanvas
                schedule={project.schedule as NonNullable<typeof project.schedule>}
                bindings={project.bindings}
                soundOn={soundOn}
                onReady={setHandle}
                className="w-full"
              />
            ) : (
              <div className="aspect-[9/16] w-full animate-pulse rounded-2xl bg-secondary" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-5">
        <Card className="border-border bg-card">
          <CardContent className="space-y-4 p-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {template.description}
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Length", value: fmtSec(m.duration) },
                { label: "Media slots", value: String(m.mediaSlots) },
                { label: "Cuts", value: String(m.cuts.length) },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-secondary/60 py-2.5">
                  <div className="text-sm font-bold text-foreground tabular-nums">
                    {s.value}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {template.categories.map((c) => (
                <Badge key={c} variant="secondary">
                  {c}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Music2 className="h-4 w-4 text-primary" />
              Music: {tone?.name ?? template.music.local?.name ?? "None"}
            </div>
            <p className="text-xs text-muted-foreground">
              {tone
                ? "A procedural tone motif — royalty-free by design, safe to post anywhere."
                : template.music.local
                  ? "Imported track — decoded on this device, nothing was uploaded."
                  : "No music bed — pure visuals."}
              {" "}Slot lengths are yours: trim each one freely.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              What's inside ({inside.length} presets)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {inside.map((name) => (
                <Badge key={name} variant="outline" className="text-muted-foreground">
                  {name}
                </Badge>
              ))}
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">
              You change what happens inside the slots — never the structure.
            </p>
          </CardContent>
        </Card>

          <Button
            size="lg"
            className="w-full bg-primary text-base font-bold text-primary-foreground hover:bg-primary/90"
            disabled={!ready}
            onClick={() => navigate(`/t/${template.id}/fill`)}
          >
            <Play className="mr-2 h-5 w-5" />
            Use this template
          </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default TemplateDetail;
