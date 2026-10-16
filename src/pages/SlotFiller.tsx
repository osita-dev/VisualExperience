import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Play,
  Save,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/EmptyState";
import { MediaPickerDialog } from "@/components/MediaPickerDialog";
import { PreviewCanvas } from "@/components/PreviewCanvas";
import { SlotCard } from "@/components/SlotCard";
import { TextSlotEditor } from "@/components/TextSlotEditor";
import type { PlayerHandle } from "@/hooks/usePlayer";
import { useProject } from "@/hooks/useProject";
import { mediaWarnings, type ProbedMedia } from "@/lib/mediaUtils";
import { fmtSec } from "@/lib/format";
import { getTemplateEntry } from "@/templates/library";
import { metrics } from "@/templates/registry";
import type { MediaSlot } from "@/core/model/types";

/** The slot-filler: preview → slots → contextual controls. */
const SlotFiller = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const project = useProject();
  const entry = id ? getTemplateEntry(id) : undefined;
  const template = entry && entry.issues.length === 0 ? entry.template : undefined;

  const [selected, setSelected] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<MediaSlot | null>(null);
  const [handle, setHandle] = useState<PlayerHandle | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (template) project.loadTemplate(template);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id]);

  useEffect(() => {
    if (template && !selected) {
      setSelected(template.tracks.media[0]?.id ?? template.tracks.overlay[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id]);

  const ready = Boolean(template && project.template?.id === template.id && project.schedule);

  const soundOnMap = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(project.states).map(([k, v]) => [k, v.soundOn]),
      ),
    [project.states],
  );

  if (!template) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          icon="🧩"
          title="Template unavailable"
          description={
            entry
              ? `Validation issues: ${entry.issues.map((i) => i.message).join("; ")}`
              : "This template doesn't exist."
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

  if (!ready || !project.schedule) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10">
        <div className="h-8 w-44 animate-pulse rounded-lg bg-secondary" />
        <div className="mx-auto aspect-[9/16] max-w-sm animate-pulse rounded-2xl bg-secondary" />
      </div>
    );
  }

  const schedule = project.schedule;
  const m = metrics(template);
  const slotDur = (slotId: string): number =>
    schedule.slots.find((s) => s.id === slotId)?.dur ?? 0;

  const mediaSlot = template.tracks.media.find((s) => s.id === selected) ?? null;
  const textSlot = template.tracks.overlay.find((s) => s.id === selected) ?? null;
  const selectedState = selected ? project.states[selected] : undefined;

  const handleSave = async () => {
    setSaving(true);
    const res = await project.save();
    setSaving(false);
    toast[res.ok ? "success" : "error"](res.message);
  };

  const playAll = () => {
    handle?.restart();
    handle?.play();
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2.5 sm:px-6">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link to={`/t/${template.id}`} aria-label="Back to template">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold text-foreground">
              {template.title}
            </h1>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {fmtSec(m.duration)} · {project.filledMedia}/{project.totalMedia} media ·{" "}
              {m.textSlots} text
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleSave()} disabled={saving}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-4 sm:px-6">
        {project.carryNotice ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-foreground">
            <span>Kept your media from the previous template where it fits.</span>
            <button
              type="button"
              className="font-semibold text-primary"
              onClick={project.clearCarryNotice}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-6 md:grid md:grid-cols-[19rem_1fr] md:items-start lg:grid-cols-[21rem_1fr]">
          {/* preview column — sticks while you fill slots */}
          <div className="space-y-4 md:sticky md:top-20">
            <div className="mx-auto max-w-sm md:max-w-none">
              <PreviewCanvas
                schedule={schedule}
                bindings={project.bindings}
                soundOn={soundOnMap}
                dirtyKey={`${selected}-${selectedState?.trimStart}-${selectedState?.text ?? ""}`}
                onReady={setHandle}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={playAll}>
                <Play className="mr-2 h-4 w-4" />
                Play all
              </Button>
              <Button
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => navigate(`/t/${template.id}/export`)}
              >
                Export
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="min-w-0 space-y-5">
            {/* slots strip */}
            <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Slots
          </h2>
          <div className="flex gap-2.5 overflow-x-auto pb-2">
            {template.tracks.media.map((slot) => {
              const st = project.states[slot.id];
              return (
                <SlotCard
                  key={slot.id}
                  index={schedule.slots.find((s) => s.id === slot.id)?.index ?? 0}
                  kind={
                    slot.accepts.length === 2
                      ? "both"
                      : slot.accepts[0] === "video"
                        ? "video"
                        : "photo"
                  }
                  duration={slotDur(slot.id)}
                  thumb={st?.media?.thumb}
                  filled={Boolean(st?.media)}
                  palette={template.palette}
                  selected={selected === slot.id}
                  onClick={() => setSelected(slot.id)}
                />
              );
            })}
            {template.tracks.overlay.map((slot) => {
              const st = project.states[slot.id];
              return (
                <SlotCard
                  key={slot.id}
                  index={template.tracks.media.length}
                  kind="text"
                  duration={slotDur(slot.id)}
                  filled
                  textPreview={st?.text ?? slot.default}
                  palette={template.palette}
                  selected={selected === slot.id}
                  onClick={() => setSelected(slot.id)}
                />
              );
            })}
          </div>
        </section>

        {/* contextual panel */}
        {mediaSlot ? (
          <Panel title={`Media slot ${mediaSlot.id}`}>
            {selectedState?.media ? (
              <div className="space-y-3">
                <div className="flex gap-3">
                  {selectedState.media.thumb ? (
                    <img
                      src={selectedState.media.thumb}
                      alt=""
                      className="h-24 w-[54px] shrink-0 rounded-lg border border-border object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground">
                      {selectedState.media.isVideo ? "Video" : "Photo"} ·{" "}
                      {slotDur(mediaSlot.id).toFixed(1)}s slot
                    </p>
                    {selectedState.media.isVideo ? (
                      <p className="tabular-nums">
                        Window {selectedState.trimStart.toFixed(1)}s →{" "}
                        {(selectedState.trimStart + slotDur(mediaSlot.id)).toFixed(1)}s of{" "}
                        {fmtSec(selectedState.media.duration)}
                      </p>
                    ) : (
                      <p>Center-cropped to 9:16</p>
                    )}
                    {mediaWarnings(selectedState.media, slotDur(mediaSlot.id)).map((w) => (
                      <p key={w.id} className="flex items-start gap-1.5 text-primary">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        {w.message}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setPickerFor(mediaSlot)}
                  >
                    <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                    Change / trim
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-destructive hover:text-destructive"
                    onClick={() => project.setMedia(mediaSlot.id, null)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Remove
                  </Button>
                </div>
                {project.can(mediaSlot, "toggle_original_sound") ? (
                  <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2">
                    <Label htmlFor={`snd-${mediaSlot.id}`} className="text-xs">
                      Keep original sound
                    </Label>
                    <Switch
                      id={`snd-${mediaSlot.id}`}
                      checked={selectedState.soundOn}
                      disabled={!selectedState.media.isVideo}
                      onCheckedChange={(v) => project.setSoundOn(mediaSlot.id, v)}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full border-dashed"
                onClick={() => setPickerFor(mediaSlot)}
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                Add a {mediaSlot.accepts.join(" or ")}
              </Button>
            )}
          </Panel>
        ) : null}

        {textSlot ? (
          <Panel title="Text slot">
            {project.can(textSlot, "edit_text") &&
            textSlot.allowedControls.includes("value") ? (
              <TextSlotEditor
                value={selectedState?.text ?? textSlot.default}
                defaultText={textSlot.default}
                onChange={(v) => project.setText(textSlot.id, v)}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                This slot's text is locked by the template.
              </p>
            )}
          </Panel>
        ) : null}

        {/* settings — only what the template granted (Stage 06 fix #5) */}
        {project.can(null, "toggle_original_sound") ? (
          <Card className="border-border bg-card">
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold text-foreground">Sound settings</h2>
              {template.tracks.media.map((slot) => {
                const st = project.states[slot.id];
                return (
                  <div key={slot.id} className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      {st?.soundOn ? (
                        <Volume2 className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <VolumeX className="h-3.5 w-3.5" />
                      )}
                      Slot {slot.id.replace("s", "")} original sound
                    </span>
                    <Switch
                      checked={Boolean(st?.soundOn)}
                      disabled={!st?.media?.isVideo}
                      onCheckedChange={(v) => project.setSoundOn(slot.id, v)}
                      aria-label={`Original sound for slot ${slot.id}`}
                    />
                  </div>
                );
              })}
              <Separator />
              <p className="text-[11px] text-muted-foreground">
                Music plays under every slot — swap the tone or import a song
                in the template itself.
              </p>
            </CardContent>
          </Card>
        ) : null}

            {project.filledMedia < project.totalMedia ? (
              <p className="pb-2 text-center text-xs text-muted-foreground">
                {project.totalMedia - project.filledMedia} slot
                {project.totalMedia - project.filledMedia > 1 ? "s" : ""} still empty —
                placeholders will appear in the export.
              </p>
            ) : null}
          </div>
        </div>
      </main>

      <MediaPickerDialog
        open={pickerFor !== null}
        onOpenChange={(o) => {
          if (!o) setPickerFor(null);
        }}
        slot={pickerFor ?? template.tracks.media[0]}
        slotDur={pickerFor ? slotDur(pickerFor.id) : 0}
        existing={
          pickerFor ? project.states[pickerFor.id]?.media : undefined
        }
        trimStart={pickerFor ? (project.states[pickerFor.id]?.trimStart ?? 0) : 0}
        onPick={(m: ProbedMedia, trimStart: number) => {
          if (!pickerFor) return;
          project.setMedia(pickerFor.id, m);
          project.setTrim(pickerFor.id, trimStart);
          toast.success(`Added to slot ${pickerFor.id.replace("s", "")}`);
        }}
      />
    </div>
  );
};

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="space-y-3 p-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}

export default SlotFiller;
