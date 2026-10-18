import { useEffect, useMemo, useRef, useState } from "react";
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
import { ingestWithToast } from "@/lib/ingest";
import { fmtSec } from "@/lib/format";
import { cn } from "@/lib/utils";
import { paneCount } from "@/core/media/layouts";
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
  const [pickerFor, setPickerFor] = useState<{
    slot: MediaSlot;
    pane: number;
  } | null>(null);
  const [handle, setHandle] = useState<PlayerHandle | null>(null);
  const [saving, setSaving] = useState(false);
  /* the multi-file picker that fills a composition slot's panes (D56) */
  const paneFillRef = useRef<HTMLInputElement>(null);
  /* every photo/video chosen this session, oldest first — a single pick
     into a split/collage slot carries the NEXT ones into its empty panes
     (D59), so the user never re-opens the gallery for the same layout */
  const [sessionMedia, setSessionMedia] = useState<ProbedMedia[]>([]);

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

  /* one pane's content (pane 0 = the slot's own media/trim) */
  const paneMedia = (
    slotId: string,
    pane: number,
  ): { media?: ProbedMedia; trimStart: number } | undefined => {
    const st = project.states[slotId];
    if (pane === 0)
      return st?.media ? { media: st.media, trimStart: st.trimStart } : undefined;
    return st?.panes?.[pane - 1];
  };

  /* Composition (D56): "Fill panes" — one multi-file pick fills this
     slot's EMPTY panes in order (a split needs 2, a collage 3–4) */
  const handleFillPanes = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (!list.length || !mediaSlot) return;
    const paneN = paneCount(mediaSlot.layout);
    const empties: number[] = [];
    for (let p = 0; p < paneN; p++)
      if (!paneMedia(mediaSlot.id, p)?.media) empties.push(p);
    if (!empties.length) {
      toast("Every pane already has media — use Change on a pane.");
      return;
    }
    let filled = 0;
    for (let k = 0; k < Math.min(list.length, empties.length); k++) {
      try {
        /* probes; a video the browser refuses is converted on-device */
        const m = await ingestWithToast(list[k]);
        project.setMedia(mediaSlot.id, m, empties[k]);
        filled++;
      } catch {
        /* ingestWithToast already showed the honest error — keep going */
      }
    }
    if (filled > 0)
      toast.success(`Filled ${filled} pane${filled === 1 ? "" : "s"}.`);
  };

  /* Composition (D59): empty panes BORROW picks already made — first
     from other slots' media (nearest slot first), then this session's
     picks — so a split/collage never means picking again. Nothing is
     invented; a still-empty pane stays honestly empty and asks. */
  const fillRestPanes = (slot: MediaSlot, pane: number, m: ProbedMedia) => {
    const paneN = paneCount(slot.layout);
    if (paneN <= 1) return 0;
    /* which panes are already taken — read ONCE, because the batched
       setMedia calls below all see the same (stale) render state */
    const busy = new Set<number>();
    for (let p = 0; p < paneN; p++) {
      const cur = p === pane ? m : paneMedia(slot.id, p)?.media;
      if (cur) busy.add(p);
    }
    const empties: number[] = [];
    for (let p = 0; p < paneN; p++)
      if (p !== pane && !busy.has(p)) empties.push(p);
    if (!empties.length) return 0;

    /* donors (D59): picks already sitting in OTHER slots — nearest slot
       first — then this session's picks. Nothing is invented, and a
       photo is never looped into two panes of the same slot. */
    const ids = template.tracks.media.map((s) => s.id);
    const mine = ids.indexOf(slot.id);
    const order = ids
      .map((_, i) => i)
      .filter((i) => i !== mine)
      .sort((a, b) => Math.abs(a - mine) - Math.abs(b - mine));
    const donors: ProbedMedia[] = [];
    for (const i of order) {
      const m0 = paneMedia(ids[i], 0)?.media;
      if (m0) donors.push(m0);
      const st = project.states[ids[i]];
      st?.panes?.forEach((p) => {
        if (p.media) donors.push(p.media);
      });
    }
    for (const c of sessionMedia) donors.push(c);

    const used = new Set<string>([m.url]);
    let filled = 0;
    for (const p of empties) {
      /* an already-made pick, else stop and leave the pane honestly
         empty — we never invent or repeat media */
      const pick = donors.find((d) => !used.has(d.url));
      if (!pick) break;
      used.add(pick.url);
      project.setMedia(slot.id, pick, p);
      filled++;
    }
    return filled;
  };

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
                dirtyKey={`${selected}-${selectedState?.trimStart}-${(selectedState?.panes ?? []).map((p) => p.media?.url ?? "").join("|")}-${selectedState?.text ?? ""}`}
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
          <Panel
            title={
              paneCount(mediaSlot.layout) > 1
                ? `Media slot ${mediaSlot.id} · ${paneCount(mediaSlot.layout)} panes`
                : `Media slot ${mediaSlot.id}`
            }
          >
            {(() => {
              const panes = paneCount(mediaSlot.layout);
              /* -------- one full-frame pane: the classic single card -------- */
              if (panes === 1) {
                const st = paneMedia(mediaSlot.id, 0);
                if (!st?.media)
                  return (
                    <Button
                      variant="outline"
                      className="w-full border-dashed"
                      onClick={() => setPickerFor({ slot: mediaSlot, pane: 0 })}
                    >
                      <ImagePlus className="mr-2 h-4 w-4" />
                      Add a {mediaSlot.accepts.join(" or ")}
                    </Button>
                  );
                return (
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      {st.media.thumb ? (
                        <img
                          src={st.media.thumb}
                          alt=""
                          className="h-24 w-[54px] shrink-0 rounded-lg border border-border object-cover"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">
                        <p className="font-semibold text-foreground">
                          {st.media.isVideo ? "Video" : "Photo"} ·{" "}
                          {slotDur(mediaSlot.id).toFixed(1)}s slot
                        </p>
                        {st.media.isVideo ? (
                          <p className="tabular-nums">
                            Window {st.trimStart.toFixed(1)}s →{" "}
                            {(st.trimStart + slotDur(mediaSlot.id)).toFixed(1)}s of{" "}
                            {fmtSec(st.media.duration)}
                          </p>
                        ) : (
                          <p>Center-cropped to 9:16</p>
                        )}
                        {mediaWarnings(st.media, slotDur(mediaSlot.id)).map((w) => (
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
                        onClick={() => setPickerFor({ slot: mediaSlot, pane: 0 })}
                      >
                        <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                        Change / trim
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-destructive hover:text-destructive"
                        onClick={() => project.setMedia(mediaSlot.id, null, 0)}
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
                          checked={selectedState?.soundOn ?? false}
                          disabled={!st.media.isVideo}
                          onCheckedChange={(v) => project.setSoundOn(mediaSlot.id, v)}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              }
              /* -------- Composition (D56): every pane asks, right here -------- */
              return (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => paneFillRef.current?.click()}
                    >
                      <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                      Fill panes
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      pick several at once — or add one and the rest reuse
                      your next picks
                    </span>
                  </div>
                  {Array.from({ length: panes }, (_, p) => {
                    const st = paneMedia(mediaSlot.id, p);
                    return (
                      <div
                        key={p}
                        className={cn(
                          "flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2",
                          st?.media
                            ? "border-border/70 bg-secondary/40"
                            : "border-dashed border-primary/50 bg-primary/5",
                        )}
                      >
                        <span className="text-[11px] font-semibold text-foreground">
                          Pane {p + 1}
                        </span>
                        {st?.media?.thumb ? (
                          <img
                            src={st.media.thumb}
                            alt=""
                            className="h-8 w-[18px] rounded border border-border object-cover"
                          />
                        ) : null}
                        {st?.media?.isVideo ? (
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            Window {st.trimStart.toFixed(1)}s →{" "}
                            {(st.trimStart + slotDur(mediaSlot.id)).toFixed(1)}s of{" "}
                            {fmtSec(st.media.duration)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            {p === 0
                              ? "sets the length · its sound can play"
                              : "muted under the music"}
                          </span>
                        )}
                        <div className="flex-1" />
                        {!st?.media ? (
                          <span className="text-[11px] text-muted-foreground">
                            fills with your next pick
                          </span>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPickerFor({ slot: mediaSlot, pane: p })}
                        >
                          <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                          {st?.media ? "Change" : "Add"}
                        </Button>
                        {st?.media ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => project.setMedia(mediaSlot.id, null, p)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                  {project.can(mediaSlot, "toggle_original_sound") ? (
                    <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2">
                      <Label htmlFor={`snd-${mediaSlot.id}`} className="text-xs">
                        Keep original sound (first pane)
                      </Label>
                      <Switch
                        id={`snd-${mediaSlot.id}`}
                        checked={selectedState?.soundOn ?? false}
                        disabled={!paneMedia(mediaSlot.id, 0)?.media?.isVideo}
                        onCheckedChange={(v) => project.setSoundOn(mediaSlot.id, v)}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })()}
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

      {/* Composition (D56): one pick → the phone's gallery with
          multi-select — files land in this slot's empty panes in order */}
      <input
        ref={paneFillRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFillPanes(e.target.files);
          e.target.value = "";
        }}
      />

      <MediaPickerDialog
        open={pickerFor !== null}
        onOpenChange={(o) => {
          if (!o) setPickerFor(null);
        }}
        slot={pickerFor?.slot ?? template.tracks.media[0]}
        slotDur={pickerFor ? slotDur(pickerFor.slot.id) : 0}
        existing={pickerFor ? paneMedia(pickerFor.slot.id, pickerFor.pane)?.media : undefined}
        trimStart={
          pickerFor ? (paneMedia(pickerFor.slot.id, pickerFor.pane)?.trimStart ?? 0) : 0
        }
        onPick={(m: ProbedMedia, trimStart: number) => {
          if (!pickerFor) return;
          project.setMedia(pickerFor.slot.id, m, pickerFor.pane);
          project.setTrim(pickerFor.slot.id, trimStart, pickerFor.pane);
          /* remember this pick so a later pane can reuse it (D59) */
          setSessionMedia((prev) => [
            ...prev.filter((c) => c.url !== m.url),
            m,
          ]);
          const carried = fillRestPanes(
            pickerFor.slot,
            pickerFor.pane,
            m,
          );
          toast.success(
            `Added to slot ${pickerFor.slot.id.replace("s", "")}${
              pickerFor.pane > 0 ? `, pane ${pickerFor.pane + 1}` : ""
            }${carried > 0 ? ` · filled ${carried} more` : ""}`,
          );
          setPickerFor(null);
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
