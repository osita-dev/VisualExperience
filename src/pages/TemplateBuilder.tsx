/**
 * THE CREATOR BUILDER (v2, D37) — front end B: click-to-assemble templates.
 * The UNLOCKED model: the chain is plain seconds (10s per slot, 300s total
 * cap) and music is a soundtrack — a tone preset or an imported song —
 * that never drives the cuts. The draft resolves through the same engine
 * and the same validation gate (V1–V12) as the built-in library —
 * nothing here can publish invalid.
 */

import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Film,
  ImagePlus,
  Loader2,
  Music2,
  Minus,
  Palette,
  Plus,
  Redo2,
  Scissors,
  Shuffle,
  Sparkles,
  Sticker,
  Trash2,
  Type,
  Undo2,
  Upload,
  Volume2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MediaWorkbench } from "@/components/MediaWorkbench";
import { ClipCutDialog } from "@/components/ClipCutDialog";
import { SongWindowPicker } from "@/components/SongWindowPicker";
import { PreviewCanvas } from "@/components/PreviewCanvas";
import { PerfBadge } from "@/components/PerfBadge";
import { TimelineStrip } from "@/components/TimelineStrip";
import { EmptyState } from "@/components/EmptyState";
import { useIsMobile } from "@/hooks/useIsMobile";
import { resolve } from "@/core/resolve/resolve";
import { validateTemplate } from "@/core/validate/validate";
import type {
  Connection,
  ImageSlot,
  MediaSlot,
  SlotSounds,
  Template,
  TextSlot,
  TextStyle,
} from "@/core/model/types";
import {
  DEFAULT_SLOT_SEC,
  MAX_TOTAL_SEC,
  MIN_SLOT_SEC,
  NO_MUSIC_TRACK,
  USER_ACTIONS,
  isLocalTrack,
  isToneTrack,
  localTrackId,
  presetKey,
  toneTrackId,
} from "@/core/model/types";
import { TONE_GROUPS, TONES, getTone } from "@/core/audio/tones";
import { SFX_CATEGORIES, SFX_LIBRARY, sfxName } from "@/core/audio/sfxCatalog";
import { STICKER_ASSETS, STICKER_GROUPS, STICKER_TONES } from "@/core/media/stickers";
import {
  FONT_FACES,
  FONT_GROUPS,
  TYPOGRAPHY_PRESETS,
  fontFace,
  nearestWeight,
  typographyOf,
} from "@/core/text/fonts";
import {
  listLogoRecords,
  newLogoId,
  saveLogoRecord,
  type LogoRecord,
} from "@/hooks/useLogoDB";
import {
  BUNDLES,
  EFFECTS,
  FILTER_FAMILIES,
  FILTER_PRESETS,
  MOTIONS,
  PRESET_MAP,
  TEXT_PRESETS,
  TRANSITIONS,
  VANIM_FAMILIES,
  VANIM_PRESETS,
} from "@/presets/data";
import { TEXT_EXITS, TEXT_FAMILIES } from "@/presets/textCatalog";
import { fmtSec } from "@/lib/format";
import { probeFile } from "@/lib/mediaUtils";
import type { ProbedMedia } from "@/lib/mediaUtils";
import {
  RAMP_END_SEC,
  RAMP_START_SEC,
  UNIFORM_SEC,
  directAll,
  directDurations,
  directLook,
  directMotion,
  directTexts,
  directTransitions,
  shuffledIndices,
  type MediaInfo,
  type Pacing,
} from "@/lib/direct";
import { pickSegment, songProfile, type SongProfile } from "@/lib/beat";
import { ingestWithToast } from "@/lib/ingest";
import {
  disposeMediaBinding,
  makeMediaBinding,
} from "@/lib/mediaBinding";
import {
  decodeAudioBlob,
  ensureLocalMusic,
  releaseLocalMusic,
} from "@/lib/localMusic";
import type { Bindings, MediaBinding } from "@/player/frame";
import { audio } from "@/player/audio";
import { ExportPanel } from "@/components/ExportPanel";
import type { PlayerHandle } from "@/hooks/usePlayer";
import { deleteMusicRecord, newMusicId, saveMusicRecord } from "@/hooks/useMusicDB";
import {
  deleteDraftSnapshot,
  loadDraftSnapshot,
  saveDraftSnapshot,
  NEW_DRAFT_KEY,
  type DraftSnapshot,
  type StoredMedia,
} from "@/hooks/useDraftDB";
import {
  buildTemplatePayload,
  downloadTemplatePayload,
} from "@/templates/share";
import {
  getTemplate,
  isCreatorTemplate,
  isMusicFileUsed,
  publishTemplate,
  useLibraryLoaded,
} from "@/templates/library";

/* ------------------------------------------------------------------ *
 * Draft model — the authoring state; a pure function compiles it to
 * a validated Template (never the other way around).
 * ------------------------------------------------------------------ */

interface SlotDraft {
  uid: string;
  /** slot length in seconds (0.5 grid, 1..MAX_TOTAL_SEC) */
  dur: number;
  /** preset key or "none" */
  effect: string;
  /** preset key or "none" — video animation (D44): how the media behaves */
  vanim: string;
  /** "template" | "off" | filter id — light filter (D45) */
  filterSel: string;
  /** filter intensity 0..1 (D45) — used when filterSel is a filter id */
  filterAmount: number;
  /** preset key — transition INTO this slot (ignored for the first) */
  transitionIn: string;
  /** "none" | asset id — sound fired on this slot's cut (D41) */
  soundCut: string;
  /** "auto" | "none" | asset id — overrides the effect's built-in sound */
  soundEffect: string;
  /** "auto" | "none" | asset id — overrides the transition's sound */
  soundTransition: string;
}

/** A sticker or logo overlay in the draft (D46) — draggable on preview. */
interface ImageDraft {
  uid: string;
  /** "sticker" | "logo" */
  kind: string;
  /** sticker id when kind === "sticker" */
  sticker: string;
  /** fill tone for drawn shapes */
  tone: string;
  /** embedded data URL when kind === "logo" */
  data: string;
  /** display name (sticker name or logo file name) */
  name: string;
  /** centre 0..1 */
  x: number;
  y: number;
  /** width fraction 0..1 */
  size: number;
  rotation: number;
  opacity: number;
}

/* Picker previews for drawn shapes (the canvas draws the real shape). */
const SHAPE_PREVIEW: Record<string, string> = {
  "shape.star": "★",
  "shape.bolt": "⚡",
  "shape.heart": "♥",
  "shape.crown": "♕",
  "shape.ring": "◯",
  "shape.arrow": "➜",
  "shape.badge": "✿",
  "shape.spark": "✦",
  "shape.dots": "⁙",
  "shape.frame": "▢",
};

/** Downscale an uploaded logo to ≤1024px and keep it ≤1 MB (D46). */
async function downscaleLogo(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>((res) => {
      const el = new window.Image();
      el.onload = () => res(el);
      el.onerror = () => res(null);
      el.src = url;
    });
    if (!img) return null;
    const max = 1024;
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    let data = c.toDataURL("image/png");
    if (data.length > 1_000_000) data = c.toDataURL("image/jpeg", 0.85);
    return data.length > 1_000_000 ? null : data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Look = "center" | "lime" | "lower";

interface TextDraft {
  uid: string;
  /** when the text appears, absolute seconds — its own timeline, no slot */
  start: number;
  /** how long the text stays, in seconds (independent of the slot) */
  dur: number;
  anim: string;
  /** exit animation preset key (D43) — "" = hold until the slot ends */
  outAnim: string;
  look: Look;
  /** typography preset id (D47) — "" = the look's authored font */
  typography: string;
  /** font family override (D47) — "" = typography/look default */
  font: string;
  /** explicit weight, clamped to the face's loaded weights (D47) */
  weight: number;
  /** font size, fraction of canvas height (D47) */
  sizeRel: number;
  /** horizontal centre 0..1 (D47) */
  x: number;
  /** vertical centre 0..1 (D47) */
  y: number;
  value: string;
  /** "none" | asset id — sound on the text's reveal (D41) */
  sound: string;
}

/** An imported song, as the draft knows it (file lives in IndexedDB). */
interface LocalMusic {
  fileId: string;
  name: string;
  duration: number;
}

interface Draft {
  title: string;
  description: string;
  categories: string[];
  palette: { from: string; to: string; emoji: string };
  /** show the palette gradient behind empty slots (default off = flat dark) */
  showBackground: boolean;
  /** "none" | `tone:<id>` | `local:<fileId>` — the soundtrack, never a clock */
  track: string;
  /** imported song meta — set exactly when `track` is a local file (D40) */
  local: LocalMusic | null;
  /** tone (bed) level 0..1 (D42) — 0 silences the bed */
  musicVolume: number;
  /** imported-song level 0..1 — separate from the tone so each keeps its own */
  songVolume: number;
  /** imported-song on/off — mute the song without deleting the import */
  songOn: boolean;
  /** which part of the song plays — window start in seconds (D50) */
  songStart: number;
  /** template-wide light filter (D45) — "none" or a catalog id */
  lookPreset: string;
  /** light intensity 0..1 (D45) */
  lookAmount: number;
  slots: SlotDraft[];
  texts: TextDraft[];
  /** sticker & logo overlays (D46) */
  images: ImageDraft[];
  /** master SFX switch (D41) — off silences every sound effect */
  sfxOn: boolean;
}

/* Sound-control draft sentinels (D41). */
const SOUND_OFF = "none";
const SOUND_AUTO = "auto";
const SOUND_VOLUME = 0.9;

let uidCounter = 0;
function newUid(): string {
  uidCounter += 1;
  return `d${Date.now().toString(36)}-${uidCounter}`;
}

/** The total cap, the min slot, and the 0.5s trim step — computed UI. */
const STEP_SEC = 0.5;

/* mobile bottom-nav tabs (D51) — under the preview, one workbench at a
   time instead of one endless vertical scroll. Tab order follows the
   editing flow: build → sound → identity → check → ship. Desktop (md+)
   keeps the full stacked layout, unchanged. */
const MOBILE_TABS = [
  { id: "slots", label: "Slots", Icon: Film },
  { id: "texts", label: "Text", Icon: Type },
  { id: "stickers", label: "Sticker", Icon: Sticker },
  { id: "music", label: "Music", Icon: Music2 },
  { id: "look", label: "Look", Icon: Palette },
  { id: "check", label: "Check", Icon: CheckCircle2 },
  { id: "export", label: "Export", Icon: Download },
] as const;
type MobileTab = (typeof MOBILE_TABS)[number]["id"];

/* ?debug=1 → live fps/frame-time badge (perf round P3: measure the phone,
   never guess) */
const PERF_FLAG =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("debug") === "1";

/** Clamp a slot length onto the 0.5s grid inside 1..MAX_TOTAL_SEC. */
function clampDur(v: number): number {
  return Math.min(MAX_TOTAL_SEC, Math.max(MIN_SLOT_SEC, Math.round(v * 2) / 2));
}

/** The chain's total length in seconds — every number derives from it. */
function totalSecOf(slots: SlotDraft[]): number {
  return slots.reduce((a, s) => a + s.dur, 0);
}

/** How far a slot may grow: the total cap minus everything else. */
function maxSecFor(slots: SlotDraft[], index: number): number {
  const others = slots.reduce(
    (a, s, i) => (i === index ? a : a + s.dur),
    0,
  );
  return Math.max(MIN_SLOT_SEC, MAX_TOTAL_SEC - others);
}

/* multi-upload cap — the gallery-style flow asks for up to 20 items */
const BULK_MAX = 20;

const DISSOLVE = presetKey("transition.dissolve", 1);

const EFFECT_OPTIONS: { key: string; label: string }[] = [
  { key: "none", label: "As designed (none)" },
  ...MOTIONS.map((p) => ({
    key: presetKey(p.id, p.version),
    label: `Motion · ${p.name}`,
  })),
  ...EFFECTS.map((p) => ({
    key: presetKey(p.id, p.version),
    label: `Effect · ${p.name}`,
  })),
  ...BUNDLES.filter((b) => b.placement === "block").map((b) => ({
    key: presetKey(b.id, b.version),
    label: `Bundle · ${b.name}`,
  })),
];

const SEAM_OPTIONS: { key: string; label: string }[] = [
  ...TRANSITIONS.map((p) => ({
    key: presetKey(p.id, p.version),
    label: `Transition · ${p.name}`,
  })),
  ...BUNDLES.filter((b) => b.placement === "connection").map((b) => ({
    key: presetKey(b.id, b.version),
    label: `Bundle · ${b.name}`,
  })),
];

const toAnimOpt = (p: { id: string; version: number; name: string }) => ({
  key: presetKey(p.id, p.version),
  label: p.name,
});

/* Entrances = the 3 classic whole-text animations + the D43 catalog;
 * exits live in their own "Out animation" picker (D43). */
const ENTRANCES = TEXT_PRESETS.filter((p) => p.tags[0] !== "exit");
const ANIM_OPTIONS = ENTRANCES.map(toAnimOpt);
const FAMILY_IDS = new Set(TEXT_FAMILIES.map((f) => f.id));
const ANIM_GROUPS: { label: string; items: { key: string; label: string }[] }[] = [
  {
    label: "Classic",
    items: ENTRANCES.filter((p) => !FAMILY_IDS.has(p.tags[0])).map(toAnimOpt),
  },
  ...TEXT_FAMILIES.filter((f) => f.id !== "exit").map((f) => ({
    label: f.label,
    items: ENTRANCES.filter((p) => p.tags[0] === f.id).map(toAnimOpt),
  })),
].filter((g) => g.items.length > 0);
const OUT_OPTIONS = TEXT_EXITS.map(toAnimOpt);

/* Video animations (D44): how a slot's OWN media behaves — its own
 * dropdown, grouped by the 28 families; stacks with Effect + Motion. */
const VANIM_GROUPS: { label: string; items: { key: string; label: string }[] }[] =
  VANIM_FAMILIES.map((f) => ({
    label: f.label,
    items: VANIM_PRESETS.filter((p) => p.tags[0] === f.id).map(toAnimOpt),
  })).filter((g) => g.items.length > 0);

/* Light filters (D45) — ids are plain (no version in the key); the
 * picker is grouped Light / Color / Mood, template-wide + per slot. */
const FILTER_GROUPS: { label: string; items: { key: string; label: string }[] }[] =
  FILTER_FAMILIES.map((fam) => ({
    label: fam.label,
    items: FILTER_PRESETS.filter((p) => p.tags[0] === fam.id).map((p) => ({
      key: p.id,
      label: p.name,
    })),
  })).filter((g) => g.items.length > 0);

/* ------------------------------------------------------------------ *
 * D41 — sound effects: the catalog grouped for the pickers, the
 * built-in sound of a preset (what "As designed" plays), and the
 * shared picker control (select + audition speaker).
 * ------------------------------------------------------------------ */

const SOUND_GROUPS = SFX_CATEGORIES.map((cat) => ({
  label: cat.label,
  items: SFX_LIBRARY.filter((d) => d.category === cat.id),
}));

/** What this preset plays by default — its sound ref or anchored member. */
function builtInSound(presetKeyValue: string): string | null {
  if (presetKeyValue === "none" || presetKeyValue === "auto") return null;
  const p = PRESET_MAP[presetKeyValue];
  if (!p) return null;
  if (p.kind === "bundle") {
    return p.members.find((m) => m.anchor !== undefined)?.preset ?? null;
  }
  return p.sound?.[0]?.asset ?? null;
}

function SoundPicker({
  label,
  value,
  onChange,
  allowAuto = true,
  autoAsset,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allowAuto?: boolean;
  /** the preset's built-in sound, for "As designed" label + audition */
  autoAsset?: string | null;
  disabled?: boolean;
}) {
  const assetOf = (v: string): string | null =>
    v.startsWith("sfx.") ? v : v === SOUND_AUTO ? autoAsset ?? null : null;
  const handle = (v: string): void => {
    onChange(v);
    const asset = assetOf(v);
    if (asset) audio.audition(asset, SOUND_VOLUME);
  };
  const current = assetOf(value);
  const autoLabel = autoAsset
    ? `As designed · ${sfxName(autoAsset)}`
    : "As designed (no sound)";
  return (
    <Field label={label}>
      <div className="flex gap-1">
        <Select value={value} onValueChange={handle} disabled={disabled}>
          <SelectTrigger className="h-9 min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allowAuto ? (
              <SelectItem value={SOUND_AUTO}>{autoLabel}</SelectItem>
            ) : null}
            <SelectItem value={SOUND_OFF}>No sound</SelectItem>
            <SelectSeparator />
            {SOUND_GROUPS.map((g) => (
              <SelectGroup key={g.label}>
                <SelectLabel>{g.label}</SelectLabel>
                {g.items.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={!current}
          onClick={() => current && audio.audition(current, SOUND_VOLUME)}
          aria-label="Play this sound"
          title={current ? `Play ${sfxName(current)}` : "No sound to play"}
        >
          <Volume2 className="h-4 w-4" />
        </Button>
      </div>
    </Field>
  );
}

const EMOJI_OPTIONS = ["✨", "🌅", "🔥", "🎧", "🍜", "🪩", "🌃", "🍋", "🎬", "🚀"];

const CATEGORY_SUGGESTIONS = [
  "Trending",
  "Fast Cuts",
  "Ads",
  "Product",
  "Travel",
  "Food",
  "Fashion",
  "Nightlife",
];

/* authored looks — complete styles, never free font/color pickers (D8) */
const LOOKS: Record<Look, TextStyle> = {
  center: {
    fontFamily: "Inter",
    weight: 700,
    sizeRel: 0.065,
    color: "#FFFFFF",
    align: "center",
    yRel: 0.76,
    stroke: "rgba(0,0,0,0.35)",
  },
  lime: {
    fontFamily: "Inter",
    weight: 800,
    sizeRel: 0.1,
    color: "#C6F24E",
    align: "center",
    yRel: 0.3,
    stroke: "rgba(0,0,0,0.45)",
  },
  lower: {
    fontFamily: "Inter",
    weight: 600,
    sizeRel: 0.045,
    color: "#FFFFFF",
    align: "center",
    yRel: 0.87,
    stroke: "rgba(0,0,0,0.5)",
  },
};
const LOOK_OPTIONS: { key: Look; label: string }[] = [
  { key: "center", label: "Centered" },
  { key: "lime", label: "Big lime" },
  { key: "lower", label: "Lower third" },
];

/* Compose a text's style (D47): the look owns color/stroke, the
   typography combo owns font identity, the sliders fine-tune. */
function styleFor(tx: TextDraft): TextStyle {
  const typo = typographyOf(tx.typography);
  const base = LOOKS[tx.look];
  return {
    ...base,
    fontFamily: tx.font || typo?.font || base.fontFamily,
    weight: tx.weight,
    sizeRel: tx.sizeRel,
    yRel: tx.y,
    xRel: tx.x,
    ...(typo ? { tracking: typo.tracking, uppercase: typo.uppercase } : {}),
  };
}

/* ------------------------------------------------------------------ *
 * Draft ⇄ Template compilation (pure)
 * ------------------------------------------------------------------ */

function splitKey(key: string): { preset: string; version: number } {
  const at = key.lastIndexOf("@");
  if (at < 0) return { preset: key, version: 1 };
  return { preset: key.slice(0, at), version: Number(key.slice(at + 1)) || 1 };
}

function slotStartSec(slots: SlotDraft[], index: number): number {
  let acc = 0;
  for (let i = 0; i < index; i++) acc += slots[i].dur;
  return Number(acc.toFixed(6));
}

/**
 * Keep a text's [start, start+dur] window inside the video — the V2 rules
 * (start ≥ 0, end > start, end ≤ total) hold even after slots shrink.
 */
function clampTextWin(t: TextDraft, total: number): TextDraft {
  const start = Math.max(0, Math.min(t.start, Math.max(0, total - 0.5)));
  const dur = Math.max(0.5, Math.min(t.dur, Math.max(0.5, total - start)));
  return start === t.start && dur === t.dur ? t : { ...t, start, dur };
}

/**
 * Hit box for dragging text on the preview — a square centred on the text,
 * wide enough for the string (≈0.6em average glyph), never shorter than the
 * glyphs themselves; expressed in canvas-width fractions like an image overlay.
 */
function textHitSize(t: TextDraft): number {
  const glyphs = Math.max(1, t.value.length);
  const width = glyphs * t.sizeRel * (16 / 9) * 0.6; // width fraction: VH/VW = 16/9
  return Math.min(0.98, Math.max(width, t.sizeRel * 1.8, 0.08));
}

/**
 * Greedy lane packing for the text strip — texts that overlap in time stack
 * into their own rows, so every one stays visible and tappable.
 */
function packTextLanes(texts: TextDraft[]): TextDraft[][] {
  const lanes: { end: number; items: TextDraft[] }[] = [];
  for (const t of [...texts].sort((a, b) => a.start - b.start)) {
    const lane = lanes.find((l) => l.end <= t.start + 1e-6);
    if (lane) {
      lane.items.push(t);
      lane.end = Math.max(lane.end, t.start + t.dur);
    } else {
      lanes.push({ end: t.start + t.dur, items: [t] });
    }
  }
  return lanes.map((l) => l.items);
}

function draftToTemplate(d: Draft, id: string): Template {
  const totalSec = totalSecOf(d.slots);

  const media: MediaSlot[] = [];
  const connections: Connection[] = [];
  d.slots.forEach((s, i) => {
    const ref = s.effect === "none" ? undefined : splitKey(s.effect);
    const vref = s.vanim === "none" ? undefined : splitKey(s.vanim);
    /* sound choices (D41): only what the creator actually picked lands
     * in the template — untouched stays absent = "as designed" */
    const sounds: SlotSounds = {};
    if (s.soundCut !== SOUND_OFF)
      sounds.cut = { asset: s.soundCut, volume: SOUND_VOLUME };
    if (s.effect !== "none") {
      if (s.soundEffect === SOUND_OFF) sounds.effect = null;
      else if (s.soundEffect !== SOUND_AUTO)
        sounds.effect = { asset: s.soundEffect, volume: SOUND_VOLUME };
    }
    media.push({
      id: `s${i + 1}`,
      type: "media",
      accepts: ["photo", "video"],
      dur: s.dur,
      crop: "fill",
      ...(ref || vref
        ? {
            blockPresets: [
              ...(ref ? [{ preset: ref.preset, version: ref.version }] : []),
              ...(vref ? [{ preset: vref.preset, version: vref.version }] : []),
            ],
          }
        : {}),
      /* light filter (D45): absent = follow template look; null = off */
      ...(s.filterSel === "off"
        ? { filter: null }
        : s.filterSel !== "template"
          ? { filter: { preset: s.filterSel, amount: s.filterAmount } }
          : {}),
      ...(Object.keys(sounds).length > 0 ? { sounds } : {}),
    });
    if (i > 0) {
      const t = splitKey(s.transitionIn);
      connections.push({
        between: [`s${i}`, `s${i + 1}`],
        preset: t.preset,
        version: t.version,
        ...(s.soundTransition === SOUND_OFF
          ? { sound: null }
          : s.soundTransition !== SOUND_AUTO
            ? { sound: { asset: s.soundTransition, volume: SOUND_VOLUME } }
            : {}),
      });
    }
  });

  const overlay: TextSlot[] = d.texts.map((tx, i) => {
    /* the text owns its window — start anywhere, stay its own length,
       clamped so V2 (start ≥ 0, end > start, end ≤ total) always holds */
    const { start, dur } = clampTextWin(tx, totalSec);
    const end = Number((start + dur).toFixed(6));
    const anim = splitKey(tx.anim);
    const outRef = tx.outAnim ? splitKey(tx.outAnim) : null;
    return {
      id: `tx${i + 1}`,
      type: "text",
      time: [start, end],
      layer: 10,
      default: tx.value,
      textPreset: anim.preset,
      version: anim.version,
      allowedControls: ["value"],
      style: styleFor(tx),
      userMay: ["edit_text"],
      ...(outRef ? { out: { preset: outRef.preset, version: outRef.version } } : {}),
      ...(tx.sound !== SOUND_OFF
        ? { sound: { asset: tx.sound, volume: SOUND_VOLUME } }
        : {}),
    };
  });

  /* sticker & logo overlays (D46) — span the whole chain, above text */
  const images: ImageSlot[] = d.images.map((im, i) => ({
    id: `im${i + 1}`,
    type: "image",
    time: [0, totalSec],
    layer: 20 + i,
    source:
      im.kind === "logo"
        ? { kind: "logo", data: im.data }
        : { kind: "sticker", sticker: im.sticker, tone: im.tone },
    x: im.x,
    y: im.y,
    size: im.size,
    rotation: im.rotation,
    opacity: im.opacity,
  }));

  return {
    id,
    schemaVersion: 2,
    title: d.title.trim() || "Untitled template",
    description: d.description.trim(),
    categories: d.categories,
    palette: d.palette,
    showBackground: d.showBackground,
    canvas: { ratio: "9:16", fps: 30, width: 1080, height: 1920 },
    music: {
      track: d.track,
      ...(d.musicVolume !== 0.9 ? { volume: d.musicVolume } : {}),
      ...(isLocalTrack(d.track) && d.local
        ? {
            local: { name: d.local.name, duration: d.local.duration },
            ...(d.songVolume !== 0.9 ? { songVolume: d.songVolume } : {}),
            ...(d.songOn ? {} : { songOn: false }),
            ...(d.songStart > 0 ? { songStart: d.songStart } : {}),
          }
        : {}),
    },
    tracks: {
      media,
      overlay,
      ...(images.length > 0 ? { images } : {}),
    },
    connections,
    sfxEnabled: d.sfxOn,
    ...(d.lookPreset !== "none"
      ? { look: { preset: d.lookPreset, amount: d.lookAmount } }
      : {}),
    userMay: [...USER_ACTIONS],
  };
}

function lookOf(style: TextStyle): Look {
  /* D47: compare the authored identity (color + stroke), since the
     typography/position fields are fine-tunes on top of the look */
  const hit = LOOK_OPTIONS.find(
    (l) => LOOKS[l.key].color === style.color && LOOKS[l.key].stroke === style.stroke,
  );
  return hit ? hit.key : "center";
}

function draftFromTemplate(t: Template): Draft {
  const connByPair = new Map(
    t.connections.map((c) => [`${c.between[0]}|${c.between[1]}`, c]),
  );
  const slots: SlotDraft[] = t.tracks.media.map((s, i) => {
    const conn = i > 0 ? connByPair.get(`s${i}|s${i + 1}`) : undefined;
    const bp = s.blockPresets?.find((p) => !p.preset.startsWith("vanim."));
    const vbp = s.blockPresets?.find((p) => p.preset.startsWith("vanim."));
    return {
      uid: newUid(),
      dur: s.dur,
      effect: bp ? presetKey(bp.preset, bp.version) : "none",
      vanim: vbp ? presetKey(vbp.preset, vbp.version) : "none",
      filterSel: s.filter === null ? "off" : s.filter?.preset ?? "template",
      filterAmount: s.filter?.amount ?? 0.7,
      transitionIn: conn
        ? presetKey(conn.preset, conn.version)
        : DISSOLVE,
      soundCut: s.sounds?.cut?.asset ?? SOUND_OFF,
      soundEffect:
        s.sounds?.effect === null
          ? SOUND_OFF
          : s.sounds?.effect?.asset ?? SOUND_AUTO,
      soundTransition: conn
        ? conn.sound === null
          ? SOUND_OFF
          : conn.sound?.asset ?? SOUND_AUTO
        : SOUND_AUTO,
    };
  });
  const texts: TextDraft[] = t.tracks.overlay.map((tx) => {
    const typoId =
      TYPOGRAPHY_PRESETS.find(
        (p) =>
          p.font === tx.style.fontFamily &&
          p.weight === tx.style.weight &&
          p.tracking === (tx.style.tracking ?? 0) &&
          p.uppercase === (tx.style.uppercase ?? false),
      )?.id ?? "";
    return {
      uid: newUid(),
      start: Math.max(0, Number(tx.time[0].toFixed(3))),
      dur: Math.max(0.5, Number((tx.time[1] - tx.time[0]).toFixed(3))),
      anim: presetKey(tx.textPreset, tx.version),
      outAnim: tx.out ? presetKey(tx.out.preset, tx.out.version) : "",
      look: lookOf(tx.style),
      typography: typoId,
      /* the family stays typography-owned ("") when it matches the combo */
      font:
        typoId && typographyOf(typoId)?.font === tx.style.fontFamily
          ? ""
          : tx.style.fontFamily,
      weight: tx.style.weight,
      sizeRel: tx.style.sizeRel,
      x: tx.style.xRel ?? 0.5,
      y: tx.style.yRel ?? 0.76,
      value: tx.default,
      sound: tx.sound?.asset ?? SOUND_OFF,
    };
  });
  const localMeta = t.music.local;
  const local: LocalMusic | null =
    isLocalTrack(t.music.track) && localMeta
      ? {
          fileId: localTrackId(t.music.track),
          name: localMeta.name,
          duration: localMeta.duration,
        }
      : null;
  return {
    title: t.title,
    description: t.description,
    categories: [...t.categories],
    palette: { ...t.palette },
    showBackground: t.showBackground ?? false,
    track: isToneTrack(t.music.track)
      ? t.music.track
      : local
        ? `local:${local.fileId}`
        : NO_MUSIC_TRACK,
    local,
    musicVolume: t.music.volume ?? 0.9,
    songVolume: t.music.songVolume ?? t.music.volume ?? 0.9,
    songOn: t.music.songOn !== false,
    songStart: Math.max(0, t.music.songStart ?? 0),
    lookPreset: t.look?.preset ?? "none",
    lookAmount: t.look?.amount ?? 0.7,
    slots,
    texts,
    images: (t.tracks.images ?? []).map((im) => {
      const src = im.source;
      return {
        uid: newUid(),
        kind: src.kind,
        sticker: src.kind === "sticker" ? src.sticker : "emoji.star",
        tone: src.kind === "sticker" ? src.tone ?? "#FFFFFF" : "#FFFFFF",
        data: src.kind === "logo" ? src.data : "",
        name:
          src.kind === "sticker"
            ? (STICKER_ASSETS.find((a) => a.id === src.sticker)?.name ??
              "Sticker")
            : "Logo",
        x: im.x,
        y: im.y,
        size: im.size,
        rotation: im.rotation,
        opacity: im.opacity,
      };
    }),
    sfxOn: t.sfxEnabled !== false,
  };
}

function defaultDraft(): Draft {
  const s1: SlotDraft = {
    uid: newUid(),
    dur: DEFAULT_SLOT_SEC,
    effect: "none",
    vanim: "none",
    filterSel: "template",
    filterAmount: 0.7,
    transitionIn: DISSOLVE,
    soundCut: SOUND_OFF,
    soundEffect: SOUND_AUTO,
    soundTransition: SOUND_AUTO,
  };
  const s2: SlotDraft = {
    uid: newUid(),
    dur: DEFAULT_SLOT_SEC,
    effect: presetKey("motion.push_in", 1),
    vanim: "none",
    filterSel: "template",
    filterAmount: 0.7,
    transitionIn: DISSOLVE,
    soundCut: SOUND_OFF,
    soundEffect: SOUND_AUTO,
    soundTransition: SOUND_AUTO,
  };
  return {
    title: "My Template",
    description: "",
    categories: [],
    palette: { from: "#8B5CF6", to: "#06B6D4", emoji: "✨" },
    showBackground: false,
    track: NO_MUSIC_TRACK,
    local: null,
    musicVolume: 0.9,
    songVolume: 0.9,
    songOn: true,
    songStart: 0,
    lookPreset: "none",
    lookAmount: 0.7,
    slots: [s1, s2],
    texts: [
      {
        uid: newUid(),
        start: 0,
        dur: DEFAULT_SLOT_SEC,
        anim: presetKey("text.rise", 1),
        outAnim: "",
        look: "center",
        typography: "",
        font: "",
        weight: LOOKS.center.weight,
        sizeRel: LOOKS.center.sizeRel,
        x: 0.5,
        y: LOOKS.center.yRel,
        value: "MY TITLE",
        sound: SOUND_OFF,
      },
    ],
    images: [],
    sfxOn: true,
  };
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "template"
  );
}

/* ------------------------------------------------------------------ *
 * Editor history (undo/redo) + autosave snapshot
 * ------------------------------------------------------------------ */

/** Everything the creator edits that undo/redo and autosave must capture. */
interface Snap {
  draft: Draft;
  testMedia: Record<string, ProbedMedia>;
  testTrims: Record<string, number>;
}

interface History {
  past: Snap[];
  present: Snap;
  future: Snap[];
}

/** A rapid burst of edits (a slider drag, typing) collapses to one undo step. */
const COALESCE_MS = 500;
/** How many undo steps to keep in memory. */
const MAX_UNDO = 60;

/** Probed media → the compact, structured-clone-safe record we persist. */
function toStoredMedia(m: ProbedMedia): StoredMedia {
  return {
    file: m.file,
    isVideo: m.isVideo,
    duration: m.duration,
    width: m.width,
    height: m.height,
    thumb: m.thumb,
  };
}

/** Mirror one editor snapshot into IndexedDB under its autosave key. */
async function persistSnapshot(key: string, present: Snap): Promise<void> {
  const testMedia: Record<string, StoredMedia> = {};
  for (const [slotId, m] of Object.entries(present.testMedia)) {
    testMedia[slotId] = toStoredMedia(m);
  }
  await saveDraftSnapshot({
    id: key,
    savedAt: Date.now(),
    draft: present.draft,
    testMedia,
    testTrims: present.testTrims,
  });
}

/** Load a snapshot (if any) and re-probe its files into live ProbedMedia. */
async function restoreSnapshot(key: string, base: Snap): Promise<Snap> {
  let saved: DraftSnapshot<Draft> | undefined;
  try {
    saved = await loadDraftSnapshot<Draft>(key);
  } catch {
    return base;
  }
  if (!saved) return base;
  const testMedia: Record<string, ProbedMedia> = {};
  for (const [slotId, m] of Object.entries(saved.testMedia ?? {})) {
    try {
      const blob = m.file;
      const file =
        blob instanceof File
          ? blob
          : new File([blob], "media", {
              type: m.isVideo ? "video/mp4" : "image/jpeg",
            });
      testMedia[slotId] = await probeFile(file);
    } catch {
      /* an unreadable file is dropped honestly rather than faked */
    }
  }
  return { draft: saved.draft, testMedia, testTrims: saved.testTrims ?? {} };
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

const TemplateBuilder = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const loaded = useLibraryLoaded();

  /* -------- editor history: one combined snapshot (draft + test media) -------- */
  const [hist, setHist] = useState<History>(() => ({
    past: [],
    present: { draft: defaultDraft(), testMedia: {}, testTrims: {} },
    future: [],
  }));
  const draft = hist.present.draft;
  const testMedia = hist.present.testMedia;
  const testTrims = hist.present.testTrims;
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  /* true once the creator edits something since load — drives the
     "leave for now?" confirmation so a pristine open doesn't nag */
  const [dirty, setDirty] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  /* which bottom-nav workbench is open on mobile (D51) */
  const [mobileTab, setMobileTab] = useState<MobileTab>("slots");
  const isMobile = useIsMobile();
  const lastEditRef = useRef(0);

  const commit = useCallback((mutate: (p: Snap) => Snap) => {
    setDirty(true);
    setHist((h) => {
      const next = mutate(h.present);
      if (next === h.present) return h;
      const now = Date.now();
      const coalesce = now - lastEditRef.current < COALESCE_MS;
      lastEditRef.current = now;
      return {
        past: coalesce ? h.past : [...h.past, h.present].slice(-MAX_UNDO),
        present: next,
        future: [],
      };
    });
  }, []);

  const setDraft = useCallback(
    (v: Draft | ((d: Draft) => Draft)) =>
      commit((p) => {
        const nd = typeof v === "function" ? v(p.draft) : v;
        return nd === p.draft ? p : { ...p, draft: nd };
      }),
    [commit],
  );
  const setTestMedia = useCallback(
    (
      v:
        | Record<string, ProbedMedia>
        | ((p: Record<string, ProbedMedia>) => Record<string, ProbedMedia>),
    ) =>
      commit((p) => {
        const nm = typeof v === "function" ? v(p.testMedia) : v;
        return nm === p.testMedia ? p : { ...p, testMedia: nm };
      }),
    [commit],
  );
  const setTestTrims = useCallback(
    (
      v:
        | Record<string, number>
        | ((p: Record<string, number>) => Record<string, number>),
    ) =>
      commit((p) => {
        const nt = typeof v === "function" ? v(p.testTrims) : v;
        return nt === p.testTrims ? p : { ...p, testTrims: nt };
      }),
    [commit],
  );
  const resetEditor = useCallback((snap: Snap) => {
    lastEditRef.current = 0;
    setDirty(false);
    setHist({ past: [], present: snap, future: [] });
  }, []);
  const undo = useCallback(() => {
    lastEditRef.current = 0;
    setHist((h) =>
      h.past.length
        ? {
            past: h.past.slice(0, -1),
            present: h.past[h.past.length - 1],
            future: [h.present, ...h.future].slice(0, MAX_UNDO),
          }
        : h,
    );
  }, []);
  const redo = useCallback(() => {
    lastEditRef.current = 0;
    setHist((h) =>
      h.future.length
        ? {
            past: [...h.past, h.present].slice(-MAX_UNDO),
            present: h.future[0],
            future: h.future.slice(1),
          }
        : h,
    );
  }, []);

  const [editingId, setEditingId] = useState<string>(id ?? "new");
  const [status, setStatus] = useState<"loading" | "ready" | "missing">(
    id === "new" ? "ready" : "loading",
  );
  const [publishing, setPublishing] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  /* the slot highlighted in the timeline strip ↔ its card below */
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState<string | null>(null);
  /* which slot's clip is being cut (Step 3) */
  const [cutFor, setCutFor] = useState<string | null>(null);
  /* -------- imported music (D40) -------- */
  const [importing, setImporting] = useState(false);
  const localFileRef = useRef<HTMLInputElement | null>(null);
  /* stickers & logos (D46) */
  const [stickerOpen, setStickerOpen] = useState(false);
  const [savedLogos, setSavedLogos] = useState<LogoRecord[]>([]);
  const [logoErr, setLogoErr] = useState("");
  const logoFileRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    void listLogoRecords()
      .then(setSavedLogos)
      .catch(() => setSavedLogos([]));
  }, []);

  const patchImage = (uid: string, patch: Partial<ImageDraft>) =>
    setDraft((d) => ({
      ...d,
      images: d.images.map((im) => (im.uid === uid ? { ...im, ...patch } : im)),
    }));
  const addImage = (
    im: Omit<ImageDraft, "uid" | "x" | "y" | "size" | "rotation" | "opacity">,
  ) =>
    setDraft((d) => ({
      ...d,
      images: [
        ...d.images,
        {
          uid: newUid(),
          x: 0.5,
          y: 0.14,
          size: 0.18,
          rotation: 0,
          opacity: 1,
          ...im,
        },
      ],
    }));
  const removeImage = (uid: string) =>
    setDraft((d) => ({ ...d, images: d.images.filter((im) => im.uid !== uid) }));

  const handleLogoFile = async (file?: File) => {
    if (!file) return;
    setLogoErr("");
    const data = await downscaleLogo(file);
    if (!data) {
      setLogoErr("Logo must be an image file that fits 1 MB.");
      return;
    }
    const rec: LogoRecord = {
      id: newLogoId(),
      name: file.name,
      mime: file.type,
      data,
      addedAt: Date.now(),
    };
    await saveLogoRecord(rec).catch(() => {});
    setSavedLogos((l) => [rec, ...l]);
    addImage({ kind: "logo", sticker: "", tone: "#FFFFFF", data, name: file.name });
  };
  const playerRef = useRef<PlayerHandle | null>(null);

  /* -------- init / reload draft when the route id changes --------
     Restores any autosaved work (CapCut-style) so a refresh never loses the
     draft; falls back to the published template / a clean slate. */
  useEffect(() => {
    let cancelled = false;
    if (!id || id === "new") {
      void restoreSnapshot(NEW_DRAFT_KEY, {
        draft: defaultDraft(),
        testMedia: {},
        testTrims: {},
      }).then((snap) => {
        if (cancelled) return;
        resetEditor(snap);
        setEditingId("new");
        setStatus("ready");
      });
      return () => {
        cancelled = true;
      };
    }
    const editId = id;
    const t = getTemplate(editId);
    if (t && isCreatorTemplate(editId)) {
      const base: Snap = {
        draft: draftFromTemplate(t),
        testMedia: {},
        testTrims: {},
      };
      void restoreSnapshot(editId, base).then((snap) => {
        if (cancelled) return;
        resetEditor(snap);
        setEditingId(editId);
        setStatus("ready");
      });
    } else if (loaded) {
      setStatus("missing");
    }
    return () => {
      cancelled = true;
    };
  }, [id, loaded, resetEditor]);

  /* -------- autosave: mirror the editor state ~1s after edits settle -------- */
  const autosaveKey = editingId === "new" ? NEW_DRAFT_KEY : editingId;
  const saveTimerRef = useRef<number | null>(null);
  const presentRef = useRef(hist.present);
  presentRef.current = hist.present;
  const autosaveKeyRef = useRef(autosaveKey);
  autosaveKeyRef.current = autosaveKey;
  useEffect(() => {
    if (status !== "ready") return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    setSaveState("saving");
    saveTimerRef.current = window.setTimeout(() => {
      void persistSnapshot(autosaveKey, hist.present).finally(() =>
        setSaveState("saved"),
      );
    }, 900);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [hist.present, status, autosaveKey]);

  /* flush the instant we unmount (an accidental back) so the very last
     edits — still inside the debounce window — are never dropped */
  useEffect(
    () => () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      void persistSnapshot(autosaveKeyRef.current, presentRef.current).catch(
        () => {},
      );
    },
    [],
  );

  /* back arrow: a pristine open leaves instantly; if you've edited
     anything, ask first and reassure the work is safe as a draft */
  const handleBack = () => {
    if (!dirty) {
      navigate("/creator");
      return;
    }
    setLeaveOpen(true);
  };

  /* bottom-nav tab switch (D51): show the panel and bring it under the
     sticky header; on desktop (md+) every panel is visible anyway */
  const selectTab = (id: MobileTab) => {
    setMobileTab(id);
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-mtab="${id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  /* panel visibility: desktop renders every panel (unchanged); on mobile
     ONLY the active tab's panel is mounted — a state change re-renders one
     panel instead of seven (perf round P1). Export is the exception: it
     hides via CSS so an in-flight export never unmounts. */
  const showTab = (id: MobileTab) => !isMobile || mobileTab === id;

  /* -------- undo/redo keyboard (fields keep their own native undo) -------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  /* -------- derived: template + schedule + validation -------- */
  const template = useMemo(
    () =>
      draftToTemplate(
        draft,
        editingId !== "new" ? editingId : `tpl.user.draft_${slugify(draft.title)}`,
      ),
    [draft, editingId],
  );
  /* test media is heard like real media — a test video's original sound plays
     in the preview and lands in the exported render (music ducks under it) */
  const testSoundOn = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const [slotId, m] of Object.entries(testMedia)) {
      if (m.isVideo) map[slotId] = true;
    }
    return map;
  }, [testMedia]);
  const schedule = useMemo(
    () =>
      resolve(
        template,
        { texts: {}, trims: testTrims, soundOn: testSoundOn },
        PRESET_MAP,
      ),
    [template, testTrims, testSoundOn],
  );
  const { issues } = useMemo(
    () => validateTemplate(template, PRESET_MAP),
    [template],
  );

  /* -------- test-fill bindings (same element pipeline as the filler) -------- */
  const elsRef = useRef(new Map<string, MediaBinding>());
  const [bindings, setBindings] = useState<Bindings>({});
  useEffect(() => {
    const next: Bindings = {};
    const keep = new Set<string>();
    for (const [slotId, m] of Object.entries(testMedia)) {
      keep.add(slotId);
      const existing = elsRef.current.get(slotId);
      if (existing && existing.url === m.url) {
        next[slotId] = existing;
        continue;
      }
      if (existing) disposeMediaBinding(existing);
      const b = makeMediaBinding(slotId, m);
      elsRef.current.set(slotId, b);
      next[slotId] = b;
    }
    for (const [slotId, b] of [...elsRef.current]) {
      if (!keep.has(slotId)) {
        disposeMediaBinding(b);
        elsRef.current.delete(slotId);
      }
    }
    // bindings are handles to external DOM elements derived from state
    setBindings(next);
  }, [testMedia]);
  useEffect(
    () => () => {
      for (const b of elsRef.current.values()) disposeMediaBinding(b);
      elsRef.current.clear();
    },
    [],
  );

  /* -------- imported song: register the file with the audio engine ------
   * Re-opening a template never re-analyzes — there is no grid at all. */
  useEffect(() => {
    const fileId = draft.local?.fileId ?? null;
    if (!fileId) return;
    let dead = false;
    void ensureLocalMusic(`local:${fileId}`).then((ok) => {
      if (!ok && !dead) {
        toast.warning(
          "The song file for this template is missing — re-import it or pick a tone.",
        );
      }
    });
    return () => {
      dead = true;
    };
  }, [draft.local?.fileId]);

  /* -------- draft mutations -------- */
  const totalSec = totalSecOf(draft.slots);
  const atCap = totalSec + DEFAULT_SLOT_SEC > MAX_TOTAL_SEC;
  const hasTestMedia = Object.keys(testMedia).length > 0;

  /* the tapped clip owns the property panel — one editor, re-bound to
     whichever slot is selected in the strip; falls back to the first slot
     so the panel is never empty */
  const selIndex = (() => {
    const hit = draft.slots.findIndex((s) => s.uid === selectedSlot);
    return hit >= 0 ? hit : 0;
  })();

  /* the tapped text owns the text panel — the same re-binding pattern;
     lanes stack texts that overlap in time so none hides another */
  const selTextIndex = (() => {
    const hit = draft.texts.findIndex((t) => t.uid === selectedText);
    return hit >= 0 ? hit : 0;
  })();
  const textLanes = packTextLanes(draft.texts);
  const textIdxOf = new Map(draft.texts.map((t, i) => [t.uid, i] as const));

  const patchSlot = (uid: string, patch: Partial<SlotDraft>) =>
    setDraft((d) => {
      const slots = d.slots.map((s) => (s.uid === uid ? { ...s, ...patch } : s));
      /* a shorter chain refits the texts (their windows stay valid) */
      const total = totalSecOf(slots);
      return { ...d, slots, texts: d.texts.map((t) => clampTextWin(t, total)) };
    });

  /* timeline strip (Step 2): the strip computes the new lengths, we just
     apply them; the playhead reads the player every frame (stable ids) */
  const applyStripDurs = useCallback(
    (next: { uid: string; dur: number }[]) => {
      const map = new Map(next.map((n) => [n.uid, n.dur]));
      setDraft((d) => {
        const slots = d.slots.map((s) =>
          map.has(s.uid) ? { ...s, dur: map.get(s.uid)! } : s,
        );
        const total = totalSecOf(slots);
        return {
          ...d,
          slots,
          texts: d.texts.map((t) => clampTextWin(t, total)),
        };
      });
    },
    [setDraft],
  );
  const stripGetTime = useCallback(
    () => playerRef.current?.getTime() ?? 0,
    [],
  );
  const stripSeek = useCallback(
    (t: number) => playerRef.current?.seek(t),
    [],
  );
  /* strip props by value, so memo(TimelineStrip) skips re-renders when
     nothing about the chain changed (text typing, music, look edits) */
  const stripSlots = useMemo(
    () =>
      draft.slots.map((s, i) => ({
        uid: s.uid,
        dur: s.dur,
        thumb: testMedia[`s${i + 1}`]?.thumb || undefined,
      })),
    [draft.slots, testMedia],
  );

  const addSlot = () =>
    setDraft((d) => {
      if (totalSecOf(d.slots) + DEFAULT_SLOT_SEC > MAX_TOTAL_SEC) return d;
      return {
        ...d,
        slots: [
          ...d.slots,
          {
            uid: newUid(),
            dur: DEFAULT_SLOT_SEC,
            effect: "none",
            vanim: "none",
            filterSel: "template",
            filterAmount: 0.7,
            transitionIn: DISSOLVE,
            soundCut: SOUND_OFF,
            soundEffect: SOUND_AUTO,
            soundTransition: SOUND_AUTO,
          },
        ],
      };
    });

  /* -------- timing (pacing) — the director's chosen clock --------
     A mode of the DIRECTOR, not of the template: whatever pacing picks,
     the lengths it lands on are stored as plain seconds. */
  const [pacingKind, setPacingKind] = useState<Pacing["kind"]>("random");
  const [directBusy, setDirectBusy] = useState(false);
  const profileCache = useRef(new Map<string, SongProfile | null>());

  /* Beat sync reads the imported song locally — the player already keeps
     its decoded buffer; one pass builds the onset envelope, and both the
     beat AND the segment picker are read from it. Cached per song. */
  const ensureProfile = useCallback(
    async (fileId: string, track: string): Promise<SongProfile | null> => {
      if (profileCache.current.has(fileId))
        return profileCache.current.get(fileId) ?? null;
      let buf = audio.getTrack(track);
      if (!buf) {
        const ok = await ensureLocalMusic(track);
        buf = ok ? audio.getTrack(track) : undefined;
      }
      const profile = buf
        ? songProfile(buf.getChannelData(0), buf.sampleRate)
        : null;
      profileCache.current.set(fileId, profile);
      return profile;
    },
    [],
  );

  /* -------- multi-upload (up to 20) — the gallery-style path --------
     One tap opens the phone's own picker with multi-select (TikTok
     style); every chosen photo/video lands in the chain in order:
     empty slots first, then new slots sized by the same honest rules
     as the workbench (video → its clip length, photo → the default
     slot), everything clamped into the total budget. One undo step. */
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const bulkAddMedia = useCallback(
    async (files: FileList | null) => {
      const picked = Array.from(files ?? [])
        .filter(
          (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
        )
        .slice(0, BULK_MAX);
      if (!picked.length || bulkBusy) return;
      setBulkBusy(true);
      try {
        /* probe one file at a time — on-device video conversion is heavy */
        const probed: ProbedMedia[] = [];
        for (const f of picked) {
          try {
            probed.push(await ingestWithToast(f));
          } catch {
            /* ingestWithToast already showed the honest error */
          }
        }
        if (!probed.length) return;

        /* plan against the chain as it is right now */
        const baseSlots = draft.slots.map((s) => ({ ...s }));
        const nextSlots = [...baseSlots];
        const claimed = new Set<number>();
        const hasMedia = (i: number) => testMedia[`s${i + 1}`] !== undefined;
        const room = () =>
          MAX_TOTAL_SEC - nextSlots.reduce((a, s) => a + s.dur, 0);
        const mediaAdd: Record<string, ProbedMedia> = {};
        let firstUid: string | null = null;
        let added = 0;
        let skipped = 0;

        for (const m of probed) {
          let idx = nextSlots.findIndex(
            (_, i) => i < baseSlots.length && !hasMedia(i) && !claimed.has(i),
          );
          if (idx === -1) {
            /* no empty slot — append one if the budget allows */
            if (room() < MIN_SLOT_SEC) {
              skipped++;
              continue;
            }
            const dur = m.isVideo
              ? Math.min(Math.max(MIN_SLOT_SEC, m.duration), room())
              : Math.min(DEFAULT_SLOT_SEC, room());
            nextSlots.push({
              uid: newUid(),
              dur,
              effect: "none",
              vanim: "none",
              filterSel: "template",
              filterAmount: 0.7,
              transitionIn: DISSOLVE,
              soundCut: SOUND_OFF,
              soundEffect: SOUND_AUTO,
              soundTransition: SOUND_AUTO,
            });
            idx = nextSlots.length - 1;
          } else if (m.isVideo) {
            /* a fresh clip takes its own length, budget-capped (D49) */
            const others = nextSlots.reduce(
              (a, s, i) => (i === idx ? a : a + s.dur),
              0,
            );
            const cap = Math.max(MIN_SLOT_SEC, MAX_TOTAL_SEC - others);
            nextSlots[idx] = {
              ...nextSlots[idx],
              dur: Math.min(Math.max(MIN_SLOT_SEC, m.duration), cap),
            };
          }
          claimed.add(idx);
          mediaAdd[`s${idx + 1}`] = m;
          if (firstUid === null) firstUid = nextSlots[idx].uid;
          added++;
        }

        if (added === 0) {
          toast(`Nothing fit — the ${MAX_TOTAL_SEC}s budget is full.`);
          return;
        }

        /* AUTO-DIRECT: the system dresses what just arrived — punchy
           durations inside the budget, a varied cut, look, motion and a
           random SFX — scoped to the slots this batch touched, so any
           earlier tuning is left alone. Pacing: whatever the bar is set
           to; with Beat sync the system also re-picks WHERE the song
           plays (a strong beat that still covers the chain) and the
           cuts follow that grid. No song / no beat → honest toast, the
           batch still lands with Random pacing. */
        let pacing: Pacing = { kind: "random" };
        let bulkSongStart: number | null = null;
        if (pacingKind === "beats") {
          if (isLocalTrack(draft.track) && draft.local) {
            const profile = await ensureProfile(
              localTrackId(draft.track),
              draft.track,
            );
            if (profile) {
              /* needSec ≈ the chain as planned — dressing only shrinks it */
              const needSec = nextSlots.reduce((a, s) => a + s.dur, 0);
              bulkSongStart = pickSegment(
                profile,
                draft.local.duration,
                needSec,
              );
              pacing = {
                kind: "beats",
                bpm: profile.beat.bpm,
                phase: profile.beat.phase,
                songStart: bulkSongStart,
              };
            } else {
              toast("Couldn't hear a steady beat — using Random pacing.");
            }
          } else {
            toast(
              "Import a song for Beat sync — this batch used Random pacing.",
            );
          }
        }
        const mediaFor = (i: number): MediaInfo | undefined => {
          const m = mediaAdd[`s${i + 1}`] ?? testMedia[`s${i + 1}`];
          return m ? { isVideo: m.isVideo, duration: m.duration } : undefined;
        };
        const directed = directAll(
          nextSlots,
          nextSlots.map((_, i) => mediaFor(i)),
          { only: [...claimed], pacing },
        );
        const durChanged = directed.slots.some(
          (s, i) => s.dur !== baseSlots[i]?.dur,
        );
        setDraft((d) => ({
          ...d,
          slots: directed.slots,
          songStart: bulkSongStart ?? d.songStart,
          texts: durChanged
            ? d.texts.map((t) => clampTextWin(t, totalSecOf(directed.slots)))
            : d.texts,
        }));
        setTestMedia((prev) => ({ ...prev, ...mediaAdd }));
        setTestTrims((prev) => {
          const next = { ...prev };
          /* a fresh clip starts at its directed spot — a random point
             inside the clip, stored as the trim (preview ≡ export) */
          for (const i of claimed) {
            const t = directed.trims[i];
            if (t !== null) next[`s${i + 1}`] = t;
          }
          return next;
        });
        if (firstUid) setSelectedSlot(firstUid);
        toast.success(
          skipped > 0
            ? `Added ${added} — ${skipped} skipped, the ${MAX_TOTAL_SEC}s budget is full.`
            : `Added ${added} — auto-directed. Shuffle to re-roll.`,
        );
      } finally {
        setBulkBusy(false);
      }
    },
    [
      bulkBusy,
      draft.slots,
      draft.track,
      draft.local,
      pacingKind,
      testMedia,
      setDraft,
      setTestMedia,
      setTestTrims,
      ensureProfile,
    ],
  );

  /* -------- AUTO-DIRECT bar — the system picks, the user shuffles --------
     Each button is ONE undo step and re-rolls only its own category:
     Re-direct = durations + look + motion + cuts + sounds + text anims;
     the rest touch just their field. Music is never touched. */
  const filledCount = draft.slots.filter(
    (_, i) => testMedia[`s${i + 1}`] !== undefined,
  ).length;

  const runDirector = async (
    kind: "direct" | "order" | "look" | "motion" | "transitions",
  ) => {
    const slots = draft.slots;
    const mediaAt = (i: number): MediaInfo | undefined => {
      const m = testMedia[`s${i + 1}`];
      return m ? { isVideo: m.isVideo, duration: m.duration } : undefined;
    };

    /* pacing only matters where durations get re-picked — look, motion
       and cuts never touch lengths, so they never wait on a song */
    let pacing: Pacing = { kind: "random" };
    let newSongStart: number | null = null;
    if (kind === "order" || kind === "direct") {
      if (pacingKind === "beats") {
        if (!isLocalTrack(draft.track) || !draft.local) {
          toast("Beat sync follows your song — import one in Music first.");
          return;
        }
        setDirectBusy(true);
        let profile: SongProfile | null = null;
        try {
          profile = await ensureProfile(
            localTrackId(draft.track),
            draft.track,
          );
        } finally {
          setDirectBusy(false);
        }
        if (!profile) {
          toast(
            "Couldn't hear a steady beat in that song — try Random pacing.",
          );
          return;
        }
        /* the system re-picks WHERE the song plays — a strong beat that
           still covers the chain — and the cuts follow that grid */
        newSongStart = pickSegment(profile, draft.local.duration, totalSec);
        pacing = {
          kind: "beats",
          bpm: profile.beat.bpm,
          phase: profile.beat.phase,
          songStart: newSongStart,
        };
      } else {
        pacing = { kind: pacingKind };
      }
    }

    if (kind === "order") {
      /* permute the FILLED positions — media and clip travel together,
         then durations re-derive for wherever each clip landed */
      const filled = slots
        .map((_, i) => i)
        .filter((i) => testMedia[`s${i + 1}`] !== undefined);
      if (filled.length < 2) return;
      const perm = shuffledIndices(filled.length);
      const nextMedia: Record<string, ProbedMedia> = {};
      filled.forEach((pos, k) => {
        const m = testMedia[`s${filled[perm[k]] + 1}`];
        if (m) nextMedia[`s${pos + 1}`] = m;
      });
      const directed = directDurations(
        slots,
        slots.map((_, i) => {
          const m = nextMedia[`s${i + 1}`];
          return m ? { isVideo: m.isVideo, duration: m.duration } : undefined;
        }),
        { pacing },
      );
      setTestMedia((prev) => ({ ...prev, ...nextMedia }));
      setTestTrims((prev) => {
        const next = { ...prev };
        for (let i = 0; i < directed.slots.length; i++) {
          const t = directed.trims[i];
          if (t !== null) next[`s${i + 1}`] = t;
        }
        return next;
      });
      setDraft((d) => ({
        ...d,
        slots: directed.slots,
        songStart: newSongStart ?? d.songStart,
        texts: d.texts.map((t) => clampTextWin(t, totalSecOf(directed.slots))),
      }));
      toast.success("Order shuffled.");
      return;
    }

    if (kind === "direct") {
      const directed = directAll(slots, slots.map((_, i) => mediaAt(i)), {
        pacing,
      });
      const texts = directTexts(draft.texts);
      setDraft((d) => ({
        ...d,
        slots: directed.slots,
        songStart: newSongStart ?? d.songStart,
        texts: texts.map((t) =>
          clampTextWin(t, totalSecOf(directed.slots)),
        ),
      }));
      setTestTrims((prev) => {
        const next = { ...prev };
        for (let i = 0; i < directed.slots.length; i++) {
          const t = directed.trims[i];
          if (t !== null) next[`s${i + 1}`] = t;
        }
        return next;
      });
      toast.success("Re-directed — durations, look, motion, cuts, sounds.");
      return;
    }

    const dressed =
      kind === "look"
        ? directLook(slots)
        : kind === "motion"
          ? directMotion(slots)
          : directTransitions(slots);
    const texts = kind === "motion" ? directTexts(draft.texts) : draft.texts;
    setDraft((d) => ({ ...d, slots: dressed, texts }));
    toast.success(
      kind === "look"
        ? "Look shuffled."
        : kind === "motion"
          ? "Motion shuffled."
          : "Transitions shuffled.",
    );
  };

  const removeSlot = (uid: string) =>
    setDraft((d) => {
      if (d.slots.length <= 1) return d;
      const slots = d.slots.filter((s) => s.uid !== uid);
      /* texts are independent now — they survive the slot, refitted to
         the new total so their windows stay valid */
      const total = totalSecOf(slots);
      return { ...d, slots, texts: d.texts.map((t) => clampTextWin(t, total)) };
    });

  const moveSlot = (uid: string, dir: -1 | 1) =>
    setDraft((d) => {
      const i = d.slots.findIndex((s) => s.uid === uid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.slots.length) return d;
      const slots = [...d.slots];
      [slots[i], slots[j]] = [slots[j], slots[i]];
      return { ...d, slots };
    });

  const addText = () => {
    const uid = newUid();
    setDraft((d) => ({
      ...d,
      texts: [
        ...d.texts,
        {
          uid,
          start: 0,
          dur: d.slots[0].dur,
          anim: ANIM_OPTIONS[0].key,
          outAnim: "",
          look: "center",
          typography: "",
          font: "",
          weight: LOOKS.center.weight,
          sizeRel: LOOKS.center.sizeRel,
          x: 0.5,
          y: LOOKS.center.yRel,
          value: "NEW TEXT",
          sound: SOUND_OFF,
        },
      ],
    }));
    /* the new text opens straight in the panel below the strip */
    setSelectedText(uid);
  };

  const patchText = (uid: string, patch: Partial<TextDraft>) =>
    setDraft((d) => ({
      ...d,
      texts: d.texts.map((t) => (t.uid === uid ? { ...t, ...patch } : t)),
    }));

  const removeText = (uid: string) =>
    setDraft((d) => ({ ...d, texts: d.texts.filter((t) => t.uid !== uid) }));

  const toggleCategory = (c: string) =>
    setDraft((d) => ({
      ...d,
      categories: d.categories.includes(c)
        ? d.categories.filter((x) => x !== c)
        : [...d.categories, c],
    }));

  /* -------- actions -------- */
  const handlePublish = async () => {
    if (issues.length > 0) return;
    setPublishing(true);
    try {
      const finalId =
        editingId !== "new" ? editingId : `tpl.user.${slugify(draft.title)}_${Math.random().toString(36).slice(2, 6)}`;
      const finalTemplate = draftToTemplate(draft, finalId);
      const prevTrack =
        editingId !== "new" ? getTemplate(editingId)?.music.track : undefined;
      await publishTemplate(finalTemplate);
      // drop the previous imported song if the edit replaced it and no
      // other published template still references the file
      if (prevTrack && isLocalTrack(prevTrack) && prevTrack !== finalTemplate.music.track) {
        const fid = localTrackId(prevTrack);
        if (!isMusicFileUsed(fid)) void deleteMusicRecord(fid).catch(() => {});
      }
      // the work is now a real library template — clear its autosave so the
      // draft starts fresh next time (publishing empties the draft, CapCut-style)
      void deleteDraftSnapshot(
        editingId === "new" ? NEW_DRAFT_KEY : editingId,
      ).catch(() => {});
      setSaveState("idle");
      toast.success(`"${draft.title.trim() || "Untitled"}" published to your library.`);
      navigate("/creator");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't publish.");
    }
    setPublishing(false);
  };

  const handleExportJson = async () => {
    try {
      const { payload, musicIncluded, musicSkipped } = await buildTemplatePayload(template);
      downloadTemplatePayload(payload, `${slugify(template.title)}.frame-template.json`);
      if (musicIncluded) {
        toast.success("Template file downloaded — the song is embedded inside it.");
      } else if (musicSkipped) {
        toast.warning(musicSkipped);
      } else {
        toast.success("Template JSON downloaded — share the file anywhere.");
      }
    } catch {
      toast.error("Couldn't build the export file.");
    }
  };

  /* -------- imported music (D40): decode once, store, register -------- */
  const handleMusicFile = async (file: File | null | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      let buf: AudioBuffer;
      try {
        buf = await decodeAudioBlob(file);
      } catch {
        toast.error("Couldn't decode that audio file — try MP3, WAV or M4A.");
        return;
      }
      const fileId = newMusicId();
      try {
        await saveMusicRecord({
          id: fileId,
          name: file.name,
          mime: file.type || "audio/mpeg",
          addedAt: Date.now(),
          blob: file,
        });
      } catch {
        toast.error("Couldn't store the song — browser storage may be full.");
        return;
      }
      releaseLocalMusic();
      // the fileId-driven effect above registers the track with the engine
      /* the system immediately places WHERE it plays: a strong, beat-
         locked spot that covers the current chain — the slider stays
         for fine-tuning (the profile is cached for Beat sync too) */
      const profile = songProfile(buf.getChannelData(0), buf.sampleRate);
      profileCache.current.set(fileId, profile);
      const start = pickSegment(profile, buf.duration, totalSec);
      setDraft((d) => ({
        ...d,
        track: `local:${fileId}`,
        local: { fileId, name: file.name, duration: buf.duration },
        songOn: true,
        songStart: start,
      }));
      toast.success(
        start > 0.05
          ? `"${file.name}" imported — placed on a strong beat (slide to adjust).`
          : `"${file.name}" imported — ${fmtSec(buf.duration)} on this device.`,
      );
    } finally {
      setImporting(false);
    }
  };

  const removeLocalMusic = () => {
    releaseLocalMusic();
    setDraft((d) => ({
      ...d,
      track: NO_MUSIC_TRACK,
      local: null,
      songStart: 0,
    }));
    toast.success("Imported song removed — the template is silent.");
  };

  /* re-roll WHERE the song plays: a fresh strong, beat-locked spot for
     the current chain — the manual slider stays for fine-tuning */
  const autoPickSegment = async () => {
    if (!isLocalTrack(draft.track) || !draft.local) return;
    setDirectBusy(true);
    try {
      const profile = await ensureProfile(
        localTrackId(draft.track),
        draft.track,
      );
      const start = pickSegment(profile, draft.local.duration, totalSec);
      setDraft((d) => ({ ...d, songStart: start }));
      toast.success("Placed on a strong beat — slide to fine-tune.");
    } finally {
      setDirectBusy(false);
    }
  };

  /* -------- render -------- */
  if (status === "loading") {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10">
        <div className="h-8 w-44 animate-pulse rounded-lg bg-secondary" />
        <div className="mx-auto aspect-[9/16] max-w-sm animate-pulse rounded-2xl bg-secondary" />
      </div>
    );
  }

  if (status === "missing") {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          icon="🧭"
          title="Template not found"
          description="Only your own published templates can be edited here."
          action={
            <Button asChild variant="outline">
              <Link to="/creator">Back to creator studio</Link>
            </Button>
          }
        />
      </div>
    );
  }

  // the workbench derives a slot's length from the kept clip (D49) —
  // its growth room is the same total cap the length stepper enforces
  const pickerIdx = pickerFor ? Number(pickerFor.slice(1)) - 1 : -1;
  const pickerSlotDraft = draft.slots[pickerIdx];
  const pickerSec = pickerSlotDraft?.dur ?? DEFAULT_SLOT_SEC;
  const pickerMaxSec = Math.max(
    pickerSec,
    pickerIdx >= 0 ? maxSecFor(draft.slots, pickerIdx) : MAX_TOTAL_SEC,
  );
  const pickerSlot: MediaSlot = {
    id: pickerFor ?? "s1",
    type: "media",
    accepts: ["photo", "video"],
    dur: pickerSec,
    crop: "fill",
  };

  return (
    <div className="flex min-h-screen flex-col bg-background pb-24 md:pb-0">
      {PERF_FLAG ? <PerfBadge /> : null}
      {/* header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2.5 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={handleBack}
            aria-label="Back to creator studio"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={hist.past.length === 0}
              onClick={undo}
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={hist.future.length === 0}
              onClick={redo}
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold text-foreground">
              {editingId === "new" ? "New template" : draft.title}
            </h1>
            <p className="truncate text-[11px] text-muted-foreground tabular-nums">
              {isLocalTrack(draft.track) && draft.local
                ? draft.local.name
                : (getTone(toneTrackId(draft.track))?.name ?? "No music")}{" "}
              · {fmtSec(schedule.duration)} · {draft.slots.length} slots ·{" "}
              {draft.texts.length} texts
            </p>
          </div>
          {saveState !== "idle" ? (
            <span
              className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
              title={
                saveState === "saved"
                  ? "Autosaved — your work survives a refresh"
                  : "Saving your changes…"
              }
            >
              {saveState === "saved" ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : null}
              <span className="hidden sm:inline">
                {saveState === "saved" ? "Saved" : "Saving…"}
              </span>
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() =>
              document
                .getElementById("export-panel")
                ?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
            aria-label="Go to export"
          >
            {/* icon-only below sm — the header stays one clean row on phones */}
            <Film className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button
            size="sm"
            className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={issues.length > 0 || publishing}
            onClick={() => void handlePublish()}
            aria-label={publishing ? "Publishing…" : "Publish"}
          >
            <CheckCircle2 className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">
              {publishing ? "Publishing…" : "Publish"}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => void handleExportJson()}
            aria-label="Download template .json file"
            title="Download .json"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-6 md:grid md:grid-cols-[19rem_1fr] md:items-start lg:grid-cols-[21rem_1fr]">
          {/* preview column */}
          <div className="space-y-4 md:sticky md:top-20">
            <div className="mx-auto max-w-sm md:max-w-none">
              <PreviewCanvas
                schedule={schedule}
                bindings={bindings}
                soundOn={testSoundOn}
                dirtyKey={Object.keys(testMedia).join(",")}
                dragOverlays={[
                  /* pick order mirrors the draw order: texts are drawn under
                     the stickers/logos (which are "always on top"), and a
                     later text sits over an earlier one */
                  ...[...draft.texts].reverse().map((t) => ({
                    id: t.uid,
                    x: t.x,
                    y: t.y,
                    size: textHitSize(t),
                  })),
                  ...draft.images.map((im) => ({
                    id: im.uid,
                    x: im.x,
                    y: im.y,
                    size: im.size,
                  })),
                ]}
                onOverlayPick={(id) => {
                  /* tapping a text on the preview opens it in the panel —
                     on mobile that also flips the bottom nav to Text */
                  if (draft.texts.some((t) => t.uid === id)) {
                    setSelectedText(id);
                    if (isMobile) selectTab("texts");
                  }
                }}
                onOverlayDrag={(id, x, y) => {
                  if (draft.texts.some((t) => t.uid === id))
                    patchText(id, { x, y });
                  else patchImage(id, { x, y });
                }}
                onReady={(h) => {
                  playerRef.current = h;
                }}
              />
            </div>
            {/* export — the shared panel: same flow as the template page */}
            <div
              id="export-panel"
              data-mtab="export"
              className={`scroll-mt-16${isMobile && mobileTab !== "export" ? " hidden" : ""}`}
            >
              <ExportPanel
                schedule={schedule}
                bindings={bindings}
                soundOn={testSoundOn}
                nameBase={`${slugify(draft.title)}.render`}
                title="Export video"
                hint="The exact builder output — your test media, this music, every effect, filter and sticker — at the quality you pick."
                showPreview
                blocking
                onStart={() => playerRef.current?.pause()}
              />
            </div>
            {/* live validation — the same V1–V12 gate that guards the built-ins */}
            {showTab("check") ? (
            <Card data-mtab="check" className="border-border bg-card scroll-mt-16">
              <CardContent className="space-y-2 p-4">
                <h2 className="text-sm font-semibold text-foreground">
                  Validation
                </h2>
                {issues.length === 0 ? (
                  <p className="flex items-center gap-2 text-xs text-primary">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    All checks pass — safe to publish.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {issues.map((iss, i) => (
                      <li
                        key={`${iss.rule}-${i}`}
                        className="flex items-start gap-2 text-xs text-destructive"
                      >
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                          <b>{iss.rule}</b> — {iss.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Publishing is optional — it adds the template to your Library
                  on this device.{" "}
                  <button
                    type="button"
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                    onClick={() => void handleExportJson()}
                  >
                    Export the .json
                  </button>{" "}
                  to keep or share the file instead.
                </p>
              </CardContent>
            </Card>
            ) : null}
          </div>

          {/* editor column */}
          <div className="min-w-0 space-y-5">
            {showTab("music") ? (
            <div data-mtab="music" className="scroll-mt-16">
            {/* music — a soundtrack, never a clock: a tone preset or an
                imported song; cuts stay exactly where the creator puts them */}
            <Section
              title="Music"
              hint="Pick a tone or import a song — it plays under the video and never drives the cuts."
            >
              {/* two separate soundtrack blocks — the tone and your own
                  song — side by side (inline) on wider screens, stacked on
                  mobile; each keeps its own level, the song gets an on/off */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* tone block */}
                <div className="min-w-0 space-y-3 rounded-lg border border-border bg-secondary/40 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Volume2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                    Music tone
                  </p>
                  <div className="flex gap-1">
                    <Select
                      value={isToneTrack(draft.track) ? draft.track : NO_MUSIC_TRACK}
                      onValueChange={(v) => {
                        releaseLocalMusic();
                        setDraft((d) => ({
                          ...d,
                          track: v,
                          local: null,
                          songStart: 0,
                        }));
                        audio.auditionTone(v, draft.musicVolume);
                      }}
                    >
                      <SelectTrigger className="h-9 min-w-0 flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_MUSIC_TRACK}>No music</SelectItem>
                        {TONE_GROUPS.map((g) => (
                          <SelectGroup key={g.id}>
                            <SelectLabel>{g.label}</SelectLabel>
                            {TONES.filter((t) => t.group === g.id).map((t) => (
                              <SelectItem key={t.id} value={`tone:${t.id}`}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      disabled={!isToneTrack(draft.track)}
                      onClick={() =>
                        audio.auditionTone(draft.track, draft.musicVolume)
                      }
                      aria-label="Audition this tone"
                      title={
                        isToneTrack(draft.track)
                          ? `Play ${getTone(toneTrackId(draft.track))?.name ?? "tone"}`
                          : "Pick a tone to audition — imported songs play in the preview"
                      }
                    >
                      <Volume2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* tone level (D42) — the creator decides how loud the bed
                      sits; 0 = silence while the visuals keep their sounds */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-foreground">
                        Tone volume
                      </p>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {draft.musicVolume === 0
                          ? "0% — silent"
                          : `${Math.round(draft.musicVolume * 100)}%`}
                      </span>
                    </div>
                    <Slider
                      value={[Math.round(draft.musicVolume * 100)]}
                      onValueChange={([v]) =>
                        setDraft((d) => ({ ...d, musicVolume: v / 100 }))
                      }
                      max={100}
                      step={1}
                      aria-label="Tone volume"
                    />
                  </div>
                </div>

                {/* your own song block */}
                <div className="min-w-0 space-y-3 rounded-lg border border-border bg-secondary/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Music2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate">Your own song</span>
                    </p>
                    {draft.local ? (
                      <Switch
                        checked={draft.songOn}
                        onCheckedChange={(c) =>
                          setDraft((d) => ({ ...d, songOn: c }))
                        }
                        aria-label="Play imported song"
                        title="Turn your imported song on or off without removing it"
                      />
                    ) : null}
                  </div>

                  {draft.local ? (
                    <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {draft.local.name}
                          </p>
                          <p className="text-[11px] tabular-nums text-muted-foreground">
                            {fmtSec(draft.local.duration)} · decoded on this
                            device — nothing was uploaded
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={removeLocalMusic}
                          aria-label="Remove imported music"
                          title="Remove imported music"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {totalSec > draft.local.duration ? (
                        <p className="text-[11px] text-destructive">
                          The chain ({fmtSec(totalSec)}) is longer than the
                          song ({fmtSec(draft.local.duration)}) — shorten a slot
                          to fit.
                        </p>
                      ) : null}
                      {/* which part of the song plays — the window always
                          covers the video; slide it anywhere in the track */}
                      <SongWindowPicker
                        track={draft.track}
                        songDur={draft.local.duration}
                        videoDur={totalSec}
                        start={draft.songStart}
                        onCommit={(s) =>
                          setDraft((d) => ({ ...d, songStart: s }))
                        }
                        format={fmtSec}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={directBusy}
                          onClick={() => void autoPickSegment()}
                        >
                          {directBusy ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Auto-pick segment
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => localFileRef.current?.click()}
                        >
                          <Upload className="mr-1.5 h-3.5 w-3.5" />
                          Replace song
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-3 text-left transition-colors hover:border-primary/50"
                      onClick={() => localFileRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-foreground">
                          Use your own song
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          MP3, WAV or M4A — decoded on this device, nothing is
                          uploaded.
                        </span>
                      </span>
                    </button>
                  )}

                  {draft.local ? (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-foreground">
                          Song volume
                        </p>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {!draft.songOn
                            ? "Off"
                            : draft.songVolume === 0
                              ? "0% — silent"
                              : `${Math.round(draft.songVolume * 100)}%`}
                        </span>
                      </div>
                      <Slider
                        value={[Math.round(draft.songVolume * 100)]}
                        onValueChange={([v]) =>
                          setDraft((d) => ({ ...d, songVolume: v / 100 }))
                        }
                        max={100}
                        step={1}
                        disabled={!draft.songOn}
                        aria-label="Song volume"
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              <input
                ref={localFileRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  void handleMusicFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {importing ? (
                <p className="text-xs text-primary">Importing the song…</p>
              ) : null}

              {/* light filter (D45) — one look lifts every slot; any slot
                  may override it (same as template / off / its own) */}
              <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-foreground">Light</p>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {draft.lookPreset === "none"
                      ? "None (as shot)"
                      : `${Math.round(draft.lookAmount * 100)}%`}
                  </span>
                </div>
                <Select
                  value={draft.lookPreset}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, lookPreset: v }))
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (as shot)</SelectItem>
                    {FILTER_GROUPS.map((g) => (
                      <SelectGroup key={g.label}>
                        <SelectLabel>{g.label}</SelectLabel>
                        {g.items.map((o) => (
                          <SelectItem key={o.key} value={o.key}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {draft.lookPreset !== "none" ? (
                  <Slider
                    className="mt-2"
                    value={[Math.round(draft.lookAmount * 100)]}
                    onValueChange={([v]) =>
                      setDraft((d) => ({ ...d, lookAmount: v / 100 }))
                    }
                    max={100}
                    step={1}
                    aria-label="Light intensity"
                  />
                ) : null}
              </div>

              {/* master SFX switch (D41) — one tap silences every sound
                  effect while the music keeps playing */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    Sound effects
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Master switch — mutes every SFX (built-in and chosen);
                    the music keeps playing.
                  </p>
                </div>
                <Switch
                  checked={draft.sfxOn}
                  onCheckedChange={(v) =>
                    setDraft((d) => ({ ...d, sfxOn: v }))
                  }
                  aria-label="Sound effects on/off"
                />
              </div>
            </Section>
            </div>
            ) : null}

            {showTab("slots") ? (
            <div data-mtab="slots" className="scroll-mt-16">
            {/* the chain — slots with their properties */}
            <Section
              title="Slots"
              hint={`Tap a clip in the strip to edit it — the panel below shows that slot's length, effects, filter, sounds and test media. Drag the grips on the strip to trim, up to the ${MAX_TOTAL_SEC}s total.`}
            >
              {hasTestMedia ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
                  <span className="text-[11px] text-muted-foreground">
                    Test media is preview-only — it never ships with the
                    template.
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-destructive hover:text-destructive"
                    onClick={() => {
                      setTestMedia({});
                      setTestTrims({});
                    }}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Clear test media
                  </Button>
                </div>
              ) : null}
              {/* AUTO-DIRECT — the system assembles, the user re-rolls:
                  one tap per category, one undo step each, music never
                  touched. Shown once there is media to direct. */}
              {hasTestMedia ? (
                <div className="space-y-2 rounded-lg border border-primary/40 bg-secondary/40 p-2">
                  <div className="flex flex-wrap items-center gap-2 px-1">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Auto-direct
                      <span className="hidden font-normal sm:inline">
                        — the system assembles, you re-roll. Music stays
                        yours.
                      </span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        Pacing
                      </span>
                      <Select
                        value={pacingKind}
                        onValueChange={(v) =>
                          setPacingKind(v as Pacing["kind"])
                        }
                      >
                        <SelectTrigger className="h-8 w-[190px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="random">Random</SelectItem>
                          <SelectItem value="uniform">
                            Fixed · {UNIFORM_SEC}s each
                          </SelectItem>
                          <SelectItem value="ramp">
                            Stagger · {RAMP_START_SEC}s → {RAMP_END_SEC}s
                          </SelectItem>
                          <SelectItem value="beats">
                            Beat sync · your song
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <Button
                      size="sm"
                      className="h-8 justify-start text-xs sm:justify-center"
                      disabled={directBusy}
                      onClick={() => runDirector("direct")}
                    >
                      {directBusy ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1 h-3 w-3" />
                      )}
                      Re-direct
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 justify-start text-xs sm:justify-center"
                      disabled={directBusy || filledCount < 2}
                      onClick={() => runDirector("order")}
                    >
                      <Shuffle className="mr-1 h-3 w-3" />
                      Shuffle order
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 justify-start text-xs sm:justify-center"
                      disabled={directBusy}
                      onClick={() => runDirector("look")}
                    >
                      <Palette className="mr-1 h-3 w-3" />
                      Shuffle look
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 justify-start text-xs sm:justify-center"
                      disabled={directBusy}
                      onClick={() => runDirector("motion")}
                    >
                      <Wand2 className="mr-1 h-3 w-3" />
                      Shuffle motion
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 justify-start text-xs sm:justify-center"
                      disabled={directBusy || filledCount < 2}
                      onClick={() => runDirector("transitions")}
                    >
                      <ArrowRightLeft className="mr-1 h-3 w-3" />
                      Shuffle cuts
                    </Button>
                  </div>
                </div>
              ) : null}
              {/* the timeline strip — chain drawn to scale, grips trim
                  (interior grips ripple between neighbours, the end grip
                  changes the total), ruler scrubs the preview */}
              <TimelineStrip
                slots={stripSlots}
                selected={draft.slots[selIndex]?.uid ?? null}
                onSelect={setSelectedSlot}
                onDurs={applyStripDurs}
                getTime={stripGetTime}
                onSeek={stripSeek}
              />
              <div className="space-y-3">
                {/* ONE property panel — it re-binds to whichever clip is
                    tapped in the strip above (never empty: falls back to the
                    first slot) */}
                {(() => {
                  const i = selIndex;
                  const slot = draft.slots[i];
                  if (!slot) return null;
                  const startSec = slotStartSec(draft.slots, i);
                  const test = testMedia[`s${i + 1}`];
                  /* the slot's cut, clamped to the clip (computed, shown honestly) */
                  const trimKey = `s${i + 1}`;
                  const testTrimMax = test?.isVideo
                    ? Math.max(0, test.duration - slot.dur)
                    : 0;
                  const testTrim = Math.min(
                    testTrims[trimKey] ?? 0,
                    testTrimMax,
                  );
                  return (
                    <div className="space-y-3 rounded-xl border border-primary/60 bg-secondary/50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          Slot {i + 1}
                          <span className="ml-2 font-normal tabular-nums text-muted-foreground">
                            {fmtSec(startSec)}–{fmtSec(startSec + slot.dur)} ·{" "}
                            {fmtSec(slot.dur)}
                          </span>
                        </span>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={i === 0}
                            onClick={() => moveSlot(slot.uid, -1)}
                            aria-label="Move slot up"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={i === draft.slots.length - 1}
                            onClick={() => moveSlot(slot.uid, 1)}
                            aria-label="Move slot down"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            disabled={draft.slots.length <= 1}
                            onClick={() => removeSlot(slot.uid)}
                            aria-label="Remove slot"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Length">
                          {/* seconds stepper: 1s up to what the total
                              still has room for — every number computed */}
                          <div className="flex h-9 items-center justify-between rounded-md border border-input px-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={slot.dur <= MIN_SLOT_SEC + 0.001}
                              onClick={() =>
                                patchSlot(slot.uid, {
                                  dur: clampDur(slot.dur - STEP_SEC),
                                })
                              }
                              aria-label="0.5s shorter"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <span className="text-sm tabular-nums">
                              {fmtSec(slot.dur)}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={slot.dur >= maxSecFor(draft.slots, i) - 0.001}
                              onClick={() =>
                                patchSlot(slot.uid, {
                                  dur: clampDur(slot.dur + STEP_SEC),
                                })
                              }
                              aria-label="0.5s longer"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </Field>
                        <Field label="Effect">
                          <Select
                            value={slot.effect}
                            onValueChange={(v) =>
                              patchSlot(slot.uid, {
                                effect: v,
                                /* no effect = no effect sound to design */
                                ...(v === "none" ? { soundEffect: SOUND_AUTO } : {}),
                              })
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {EFFECT_OPTIONS.map((o) => (
                                <SelectItem key={o.key} value={o.key}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Video animation">
                          {/* D44 — media behaviour, own dropdown; stacks
                              with Effect + Motion, never clashes */}
                          <Select
                            value={slot.vanim}
                            onValueChange={(v) =>
                              patchSlot(slot.uid, { vanim: v })
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None (as shot)</SelectItem>
                              {VANIM_GROUPS.map((g) => (
                                <SelectGroup key={g.label}>
                                  <SelectLabel>{g.label}</SelectLabel>
                                  {g.items.map((o) => (
                                    <SelectItem key={o.key} value={o.key}>
                                      {o.label}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        {i > 0 ? (
                          <Field label="Transition in">
                            <Select
                              value={slot.transitionIn}
                              onValueChange={(v) =>
                                patchSlot(slot.uid, { transitionIn: v })
                              }
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SEAM_OPTIONS.map((o) => (
                                  <SelectItem key={o.key} value={o.key}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>
                        ) : (
                          <div className="hidden sm:block" />
                        )}
                      </div>

                      {/* light filter (D45) — inherit the template look,
                          switch it off, or give the slot its own */}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Filter">
                          <Select
                            value={slot.filterSel}
                            onValueChange={(v) =>
                              patchSlot(slot.uid, { filterSel: v })
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="template">
                                Same as template
                              </SelectItem>
                              <SelectItem value="off">No filter</SelectItem>
                              {FILTER_GROUPS.map((g) => (
                                <SelectGroup key={g.label}>
                                  <SelectLabel>{g.label}</SelectLabel>
                                  {g.items.map((o) => (
                                    <SelectItem key={o.key} value={o.key}>
                                      {o.label}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        {slot.filterSel !== "template" &&
                        slot.filterSel !== "off" ? (
                          <Field label="Filter intensity">
                            <Slider
                              value={[Math.round(slot.filterAmount * 100)]}
                              onValueChange={([v]) =>
                                patchSlot(slot.uid, { filterAmount: v / 100 })
                              }
                              max={100}
                              step={1}
                              aria-label="Filter intensity"
                            />
                          </Field>
                        ) : null}
                      </div>

                      {/* sounds — each element owns its sound (D41) */}
                      <div className="grid gap-3 sm:grid-cols-3">
                        <SoundPicker
                          label="Cut sound"
                          allowAuto={false}
                          value={slot.soundCut}
                          onChange={(v) => patchSlot(slot.uid, { soundCut: v })}
                        />
                        <SoundPicker
                          label="Effect sound"
                          value={slot.soundEffect}
                          autoAsset={builtInSound(slot.effect)}
                          disabled={slot.effect === "none"}
                          onChange={(v) => patchSlot(slot.uid, { soundEffect: v })}
                        />
                        {i > 0 ? (
                          <SoundPicker
                            label="Transition sound"
                            value={slot.soundTransition}
                            autoAsset={builtInSound(slot.transitionIn)}
                            onChange={(v) =>
                              patchSlot(slot.uid, { soundTransition: v })
                            }
                          />
                        ) : (
                          <div className="hidden sm:block" />
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPickerFor(`s${i + 1}`)}
                        >
                          {test ? (
                            <Film className="mr-1.5 h-3.5 w-3.5" />
                          ) : (
                            <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          {test ? "Change test media" : "Test media"}
                        </Button>
                        {test ? (
                          <>
                            {test.thumb ? (
                              <img
                                src={test.thumb}
                                alt=""
                                className="h-8 w-[18px] rounded border border-border object-cover"
                              />
                            ) : null}
                            {test.isVideo ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setCutFor(trimKey)}
                                >
                                  <Scissors className="mr-1.5 h-3.5 w-3.5" />
                                  Cut
                                </Button>
                                <span className="text-[11px] tabular-nums text-muted-foreground">
                                  {testTrimMax <= 0.05
                                    ? `Whole ${fmtSec(test.duration)} clip`
                                    : `${fmtSec(testTrim)} → ${fmtSec(testTrim + slot.dur)} of ${fmtSec(test.duration)}`}
                                </span>
                              </>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                setTestMedia((prev) => {
                                  const next = { ...prev };
                                  delete next[trimKey];
                                  return next;
                                });
                                setTestTrims((prev) => {
                                  const next = { ...prev };
                                  delete next[trimKey];
                                  return next;
                                });
                              }}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              Clear
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}

                {/* the fast path: one tap → the phone's own gallery with
                    multi-select — every pick lands in the chain in order */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={bulkBusy}
                    onClick={() => bulkInputRef.current?.click()}
                  >
                    {bulkBusy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    {bulkBusy
                      ? "Preparing media…"
                      : `Add media (up to ${BULK_MAX})`}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-dashed"
                    disabled={atCap}
                    onClick={addSlot}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add slot ({DEFAULT_SLOT_SEC}s)
                  </Button>
                </div>
                <input
                  ref={bulkInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void bulkAddMedia(e.target.files);
                    e.target.value = "";
                  }}
                />
                {atCap ? (
                  <p className="text-center text-[11px] text-muted-foreground">
                    Total length cap reached ({MAX_TOTAL_SEC}s) — shorten or
                    remove a slot first.
                  </p>
                ) : null}
              </div>
            </Section>
            </div>
            ) : null}

            {showTab("texts") ? (
            <div data-mtab="texts" className="scroll-mt-16">
            {/* texts */}
            <Section
              title="Texts"
              hint="Tap a text on the strip to edit it, then drag it on the paused preview to place it anywhere — the panel below holds its words, Start, Duration, style and sound."
            >
              <div className="space-y-3">
                {draft.texts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No texts yet — the video runs on visuals alone.
                  </p>
                ) : (
                  <>
                    {/* text timeline — every text at its real position and
                        length; overlapping texts stack into their own lane */}
                    <div className="space-y-1 rounded-lg border border-border bg-secondary/30 p-1.5">
                      {textLanes.map((lane, li) => (
                        <div key={li} className="relative h-9">
                          {lane.map((tx) => {
                            const ti = textIdxOf.get(tx.uid) ?? 0;
                            const isSel =
                              draft.texts[selTextIndex]?.uid === tx.uid;
                            const pct = (v: number) =>
                              `${Math.max(0, Math.min(1, v / totalSec)) * 100}%`;
                            return (
                              <button
                                key={tx.uid}
                                type="button"
                                onClick={() => setSelectedText(tx.uid)}
                                aria-label={`Edit text ${ti + 1}`}
                                aria-pressed={isSel}
                                className={`absolute top-0 flex h-9 max-w-full items-center overflow-hidden rounded border px-1.5 text-[10px] font-medium transition-colors ${
                                  isSel
                                    ? "border-primary bg-primary/25 text-foreground"
                                    : "border-border bg-secondary/60 text-muted-foreground hover:border-primary/50"
                                }`}
                                style={{
                                  left: pct(tx.start),
                                  width: pct(tx.dur),
                                  minWidth: "18px",
                                }}
                              >
                                <span className="truncate">
                                  T{ti + 1} · {tx.value || "text"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground tabular-nums">
                      <span className="shrink-0">
                        {fmtSec(0)}–{fmtSec(totalSec)}
                      </span>
                      <span>
                        {draft.texts.length}{" "}
                        {draft.texts.length === 1 ? "text" : "texts"} · tap one
                        to edit
                      </span>
                    </div>
                  </>
                )}
                {/* ONE property panel — it re-binds to the tapped text */}
                {(() => {
                  const i = selTextIndex;
                  const tx = draft.texts[i];
                  if (!tx) return null;
                  return (
                    <div className="space-y-3 rounded-xl border border-primary/60 bg-secondary/50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          Text {i + 1}
                          <span className="ml-2 font-normal tabular-nums text-muted-foreground">
                            {fmtSec(tx.start)}–{fmtSec(tx.start + tx.dur)} ·{" "}
                            {fmtSec(tx.dur)}
                          </span>
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeText(tx.uid)}
                          aria-label="Remove text"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    <Field label="Words">
                      <Input
                        value={tx.value}
                        onChange={(e) => patchText(tx.uid, { value: e.target.value })}
                        className="h-9"
                        maxLength={60}
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label={`Start · ${tx.start.toFixed(1)}s`}>
                        {/* the text owns its moment — slide when it appears,
                            anywhere in the video, no slot decides it */}
                        <Slider
                          value={[Math.round(tx.start * 10)]}
                          onValueChange={([v]) =>
                            patchText(tx.uid, { start: v / 10 })
                          }
                          max={Math.max(
                            5,
                            Math.round((totalSec - tx.dur) * 10),
                          )}
                          step={1}
                          aria-label="Text start time"
                        />
                      </Field>
                      <Field label="Animation">
                        <Select
                          value={tx.anim}
                          onValueChange={(v) => patchText(tx.uid, { anim: v })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ANIM_GROUPS.map((g) => (
                              <SelectGroup key={g.label}>
                                <SelectLabel>{g.label}</SelectLabel>
                                {g.items.map((o) => (
                                  <SelectItem key={o.key} value={o.key}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Look">
                        <Select
                          value={tx.look}
                          onValueChange={(v) => {
                            /* the authored look owns its size, height and weight */
                            const look = v as Look;
                            patchText(tx.uid, {
                              look,
                              sizeRel: LOOKS[look].sizeRel,
                              y: LOOKS[look].yRel,
                              weight: LOOKS[look].weight,
                            });
                          }}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LOOK_OPTIONS.map((o) => (
                              <SelectItem key={o.key} value={o.key}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Typography">
                        {/* Radix forbids SelectItem value="" — "look" is the
                            sentinel; the draft keeps "" = as designed */}
                        <Select
                          value={tx.typography || "look"}
                          onValueChange={(v) => {
                            const typo = v === "look" ? undefined : typographyOf(v);
                            patchText(tx.uid, {
                              typography: typo?.id ?? "",
                              font: "",
                              weight: typo
                                ? nearestWeight(fontFace(typo.font), typo.weight)
                                : tx.weight,
                            });
                          }}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="look">As designed</SelectItem>
                            <SelectGroup>
                              <SelectLabel>Typography</SelectLabel>
                              {TYPOGRAPHY_PRESETS.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Font">
                        <Select
                          value={
                            tx.font ||
                            typographyOf(tx.typography)?.font ||
                            LOOKS[tx.look].fontFamily
                          }
                          onValueChange={(v) =>
                            patchText(tx.uid, {
                              font: v,
                              weight: nearestWeight(fontFace(v), tx.weight),
                            })
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FONT_GROUPS.map((g) => (
                              <SelectGroup key={g.id}>
                                <SelectLabel>{g.label}</SelectLabel>
                                {FONT_FACES.filter((f) => f.group === g.id).map(
                                  (f) => (
                                    <SelectItem key={f.name} value={f.name}>
                                      {f.name}
                                    </SelectItem>
                                  ),
                                )}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Out animation">
                        {/* Radix forbids SelectItem value="" — "hold" is the
                            sentinel; the draft keeps "" = hold to the end */}
                        <Select
                          value={tx.outAnim || "hold"}
                          onValueChange={(v) =>
                            patchText(tx.uid, { outAnim: v === "hold" ? "" : v })
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hold">
                              Hold to the end
                            </SelectItem>
                            <SelectGroup>
                              <SelectLabel>Exit animations</SelectLabel>
                              {OUT_OPTIONS.map((o) => (
                                <SelectItem key={o.key} value={o.key}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <SoundPicker
                        label="Sound"
                        allowAuto={false}
                        value={tx.sound}
                        onChange={(v) => patchText(tx.uid, { sound: v })}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label={`Size · ${Math.round(tx.sizeRel * 100)}%`}>
                        <Slider
                          value={[Math.round(tx.sizeRel * 1000)]}
                          onValueChange={([v]) =>
                            patchText(tx.uid, { sizeRel: v / 1000 })
                          }
                          min={15}
                          max={180}
                          step={5}
                          aria-label="Font size"
                        />
                      </Field>
                      <Field label={`Duration · ${tx.dur.toFixed(1)}s`}>
                        {/* text lives its own length — bounded by what's
                            left after its start */}
                        <Slider
                          value={[Math.round(tx.dur * 10)]}
                          onValueChange={([v]) =>
                            patchText(tx.uid, { dur: v / 10 })
                          }
                          min={5}
                          max={Math.max(
                            5,
                            Math.round((totalSec - tx.start) * 10),
                          )}
                          step={1}
                          aria-label="Text duration"
                        />
                      </Field>
                      <Field label={`X · ${Math.round(tx.x * 100)}%`}>
                        <Slider
                          value={[Math.round(tx.x * 100)]}
                          onValueChange={([v]) => patchText(tx.uid, { x: v / 100 })}
                          max={100}
                          step={1}
                          aria-label="Horizontal position"
                        />
                      </Field>
                      <Field label={`Y · ${Math.round(tx.y * 100)}%`}>
                        <Slider
                          value={[Math.round(tx.y * 100)]}
                          onValueChange={([v]) => patchText(tx.uid, { y: v / 100 })}
                          max={100}
                          step={1}
                          aria-label="Vertical position"
                        />
                      </Field>
                    </div>
                  </div>
                  );
                })()}
                <Button
                  variant="outline"
                  className="w-full border-dashed"
                  onClick={addText}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add text
                </Button>
              </div>
            </Section>
            </div>
            ) : null}

            {showTab("stickers") ? (
            <div data-mtab="stickers" className="scroll-mt-16">
            {/* stickers & logos (D46) — free overlays, draggable on preview */}
            <Section
              title="Logo & stickers"
              hint="Drag them on the paused preview — or type exact numbers here."
            >
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStickerOpen((o) => !o)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add sticker
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => logoFileRef.current?.click()}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add logo
                  </Button>
                </div>
                <input
                  ref={logoFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void handleLogoFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                {logoErr ? (
                  <p className="text-xs text-destructive">{logoErr}</p>
                ) : null}

                {stickerOpen ? (
                  <div className="space-y-3 rounded-lg border border-border bg-secondary/40 p-3">
                    {STICKER_GROUPS.map((g) => (
                      <div key={g.id}>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {g.label}
                        </p>
                        <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-10">
                          {STICKER_ASSETS.filter((a) => a.group === g.id).map(
                            (a) => (
                              <button
                                key={a.id}
                                type="button"
                                className="flex h-9 items-center justify-center rounded-md border border-border bg-card text-lg hover:border-primary"
                                title={a.name}
                                onClick={() => {
                                  addImage({
                                    kind: "sticker",
                                    sticker: a.id,
                                    tone: "#FFFFFF",
                                    data: "",
                                    name: a.name,
                                  });
                                  setStickerOpen(false);
                                }}
                              >
                                {a.glyph ?? SHAPE_PREVIEW[a.id] ?? "◆"}
                              </button>
                            ),
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {savedLogos.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Your logos
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {savedLogos.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className="h-10 w-10 overflow-hidden rounded-md border border-border bg-card hover:border-primary"
                          title={r.name}
                          onClick={() =>
                            addImage({
                              kind: "logo",
                              sticker: "",
                              tone: "#FFFFFF",
                              data: r.data,
                              name: r.name,
                            })
                          }
                        >
                          <img
                            src={r.data}
                            alt={r.name}
                            className="h-full w-full object-contain"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {draft.images.map((im) => (
                  <div
                    key={im.uid}
                    className="space-y-3 rounded-lg border border-border bg-secondary/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {im.kind === "logo"
                          ? `Logo · ${im.name || "image"}`
                          : `Sticker · ${im.name || im.sticker}`}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeImage(im.uid)}
                        aria-label="Remove sticker or logo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label={`X · ${Math.round(im.x * 100)}%`}>
                        <Slider
                          value={[Math.round(im.x * 100)]}
                          onValueChange={([v]) =>
                            patchImage(im.uid, { x: v / 100 })
                          }
                          max={100}
                          step={1}
                          aria-label="Horizontal position"
                        />
                      </Field>
                      <Field label={`Y · ${Math.round(im.y * 100)}%`}>
                        <Slider
                          value={[Math.round(im.y * 100)]}
                          onValueChange={([v]) =>
                            patchImage(im.uid, { y: v / 100 })
                          }
                          max={100}
                          step={1}
                          aria-label="Vertical position"
                        />
                      </Field>
                      <Field label={`Size · ${Math.round(im.size * 100)}%`}>
                        <Slider
                          value={[Math.round(im.size * 100)]}
                          onValueChange={([v]) =>
                            patchImage(im.uid, { size: v / 100 })
                          }
                          min={4}
                          max={80}
                          step={1}
                          aria-label="Size"
                        />
                      </Field>
                      <Field label={`Rotation · ${Math.round(im.rotation)}°`}>
                        <Slider
                          value={[Math.round(im.rotation)]}
                          onValueChange={([v]) =>
                            patchImage(im.uid, { rotation: v })
                          }
                          min={-180}
                          max={180}
                          step={1}
                          aria-label="Rotation"
                        />
                      </Field>
                      <Field label={`Opacity · ${Math.round(im.opacity * 100)}%`}>
                        <Slider
                          value={[Math.round(im.opacity * 100)]}
                          onValueChange={([v]) =>
                            patchImage(im.uid, { opacity: v / 100 })
                          }
                          min={10}
                          max={100}
                          step={1}
                          aria-label="Opacity"
                        />
                      </Field>
                      {im.kind === "sticker" && im.sticker.startsWith("shape.") ? (
                        <Field label="Color">
                          <div className="flex h-9 items-center gap-1.5">
                            {STICKER_TONES.map((tone) => (
                              <button
                                key={tone}
                                type="button"
                                className={`h-6 w-6 rounded-full border ${
                                  im.tone === tone
                                    ? "border-primary ring-2 ring-primary/40"
                                    : "border-border"
                                }`}
                                style={{ backgroundColor: tone }}
                                onClick={() => patchImage(im.uid, { tone })}
                                aria-label={`Color ${tone}`}
                              />
                            ))}
                          </div>
                        </Field>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
            </div>
            ) : null}

            {showTab("look") ? (
            <div data-mtab="look" className="scroll-mt-16">
            {/* look — library card identity */}
            <Section title="Look" hint="How the template appears in the Library.">
              <div className="space-y-3">
                <Field label="Title">
                  <Input
                    value={draft.title}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, title: e.target.value }))
                    }
                    className="h-9"
                    maxLength={40}
                  />
                </Field>
                <Field label="Description">
                  <Input
                    value={draft.description}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, description: e.target.value }))
                    }
                    className="h-9"
                    maxLength={120}
                  />
                </Field>
                <Field label="Categories">
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORY_SUGGESTIONS.map((c) => {
                      const on = draft.categories.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleCategory(c)}
                          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                            on
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-secondary/50 text-muted-foreground"
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Emoji">
                    <Select
                      value={draft.palette.emoji}
                      onValueChange={(v) =>
                        setDraft((d) => ({
                          ...d,
                          palette: { ...d.palette, emoji: v },
                        }))
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EMOJI_OPTIONS.map((e) => (
                          <SelectItem key={e} value={e}>
                            {e}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Background">
                    {/* off by default — empty slots show a flat dark plate */}
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={draft.showBackground}
                        onCheckedChange={(v) =>
                          setDraft((d) => ({ ...d, showBackground: v }))
                        }
                        aria-label="Show gradient background"
                      />
                      <span className="text-xs text-muted-foreground">
                        {draft.showBackground ? "Gradient shown" : "Hidden"}
                      </span>
                    </div>
                  </Field>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {draft.slots.length} slots ·{" "}
                  {draft.slots.filter((s) => s.effect !== "none").length} with
                  effects ·{" "}
                  {draft.slots.slice(1).filter((s) => s.transitionIn !== DISSOLVE).length}{" "}
                  custom transitions · {draft.texts.length} texts
                </p>
              </div>
            </Section>
            </div>
            ) : null}
          </div>
        </div>
      </main>

      <MediaWorkbench
        open={pickerFor !== null}
        onOpenChange={(o) => {
          if (!o) setPickerFor(null);
        }}
        slot={pickerSlot}
        currentSec={pickerSec}
        maxSec={pickerMaxSec}
        existing={pickerFor ? testMedia[pickerFor] : undefined}
        onAdd={(m, sec) => {
          if (!pickerFor) return;
          setTestMedia((prev) => ({ ...prev, [pickerFor]: m }));
          /* a fresh clip always starts at its beginning — the old cut
             belonged to the old clip */
          setTestTrims((prev) => ({ ...prev, [pickerFor]: 0 }));
          if (
            sec !== null &&
            pickerSlotDraft &&
            sec !== pickerSlotDraft.dur
          ) {
            patchSlot(pickerSlotDraft.uid, { dur: sec });
          }
          setPickerFor(null);
        }}
      />

      {/* the cut view (Step 3) — trim a test clip to its slot's window */}
      {cutFor && testMedia[cutFor] ? (
        <ClipCutDialog
          open
          onOpenChange={(o) => {
            if (!o) setCutFor(null);
          }}
          label={`slot ${cutFor.replace("s", "")}`}
          clip={testMedia[cutFor]}
          slotDur={
            draft.slots[Number(cutFor.slice(1)) - 1]?.dur ?? DEFAULT_SLOT_SEC
          }
          trimStart={testTrims[cutFor] ?? 0}
          onApply={(t) => setTestTrims((prev) => ({ ...prev, [cutFor]: t }))}
        />
      ) : null}

      {/* leave guard — you've edited something, so confirm and reassure
          the work is already safe as a draft before navigating away */}
      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave for now?</AlertDialogTitle>
            <AlertDialogDescription>
              Your work is saved as a draft — you can pick it up right where
              you left off anytime from “New template” (or by reopening this
              template).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate("/creator")}>
              Leave (saved)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* mobile bottom nav (D51) — one workbench at a time under the
          preview, so nobody scrolls through every card to reach one;
          desktop (md+) keeps the full stacked layout */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Builder sections"
      >
        <div className="grid grid-cols-7">
          {MOBILE_TABS.map((t) => {
            const on = mobileTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors ${
                  on ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <span className="relative">
                  <t.Icon className="h-[18px] w-[18px]" />
                  {t.id === "check" && issues.length > 0 ? (
                    <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-destructive" />
                  ) : null}
                </span>
                <span className="max-w-full truncate px-0.5">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * small layout helpers
 * ------------------------------------------------------------------ */

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {hint ? (
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default TemplateBuilder;
