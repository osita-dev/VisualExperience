/**
 * Visual Experience core data model.
 * Pure types — no React, no DOM, no dependencies. (Stage 08: docs/08-DATA-MODEL.md)
 *
 * schemaVersion 2 — the UNLOCKED model: music no longer sets a BPM, cuts are
 * not forced onto a beat grid, and every length is plain seconds. A media
 * slot carries its own `dur`; text/image overlays carry absolute `time`
 * windows. Template totals are bounded by MAX_TOTAL_SEC (300s = 5 min).
 */

/* ------------------------------------------------------------------ *
 * Length limits — every displayed total derives from these + slot durs
 * ------------------------------------------------------------------ */

/** A slot can never be shorter than this (V2). */
export const MIN_SLOT_SEC = 1;
/** Default length for a new or empty slot — 10 seconds. */
export const DEFAULT_SLOT_SEC = 10;
/** The whole video's length budget (V12): the sum of slot durs.
 * 300s = 5 minutes (raised from 60s for bulk uploads / auto-direct;
 * going longer is a later conversation). */
export const MAX_TOTAL_SEC = 300;

/* ------------------------------------------------------------------ *
 * Presets
 * ------------------------------------------------------------------ */

export type PresetKind = "block" | "connection" | "text" | "music" | "bundle";

export type ParamSpec =
  | { type: "number"; min: number; max: number; default: number }
  | { type: "choice"; options: string[]; default: string }
  | { type: "boolean"; default: boolean };

/** Where an SFX sits relative to its preset's execution window (Rule 1). */
export type Anchor = "start" | "mid" | "end";

export interface SoundRef {
  asset: string;
  anchor: Anchor;
  /** seconds added to the anchor time (may be negative) */
  offset: number;
  volume: number;
}

/** A creator-chosen sound attached to one element (D41). */
export interface SoundChoice {
  asset: string;
  volume: number;
}

/**
 * Per-element sound control (D41). Tri-state, resolved by `resolve`:
 *   undefined → as designed (the preset's built-in sound plays, if any)
 *   null      → explicitly silent
 *   object    → play this asset instead, at the role's anchor
 * Sound choices never touch length or beat math — structure stays structure.
 */
export type ElementSound = SoundChoice | null;

export interface PresetRef {
  preset: string;
  version: number;
  params?: Record<string, unknown>;
}

export interface BasePreset {
  id: string;
  version: number;
  kind: PresetKind;
  name: string;
  tags: string[];
  duration?: number;
  params?: Record<string, ParamSpec>;
  sound?: SoundRef[];
  clashesWith?: string[];
}

/**
 * A visual preset (motion / transition / effect / text).
 * `resolve` turns declared params into CONCRETE render values at resolve-time
 * so the player derives nothing at play time (Rule 2).
 */
export interface VisualPreset extends BasePreset {
  kind: "block" | "connection" | "text" | "music";
  visual?: { shader: string };
  resolve: (params: Record<string, unknown>) => Record<string, unknown>;
}

export interface BundleMember {
  preset: string;
  version?: number;
  /** [start, end] in seconds relative to the bundle window (audio uses anchor instead) */
  window?: [number, number];
  anchor?: Anchor;
  offset?: number;
  volume?: number;
  params?: Record<string, unknown>;
}

/** A bundle: atomic presets wired together — "one pick, five coordinated things". */
export interface BundlePreset extends BasePreset {
  kind: "bundle";
  placement: "block" | "connection";
  members: BundleMember[];
}

export type Preset = VisualPreset | BundlePreset;

export function isBundle(p: Preset): p is BundlePreset {
  return p.kind === "bundle";
}

/** Lookup key — every preset reference is pinned by id+version (Rule 3). */
export function presetKey(id: string, version: number): string {
  return `${id}@${version}`;
}

/* ------------------------------------------------------------------ *
 * Template
 * ------------------------------------------------------------------ */

export type UserAction =
  | "fill_media"
  | "pick_clip_window"
  | "toggle_original_sound"
  | "edit_text";

export const USER_ACTIONS: UserAction[] = [
  "fill_media",
  "pick_clip_window",
  "toggle_original_sound",
  "edit_text",
];

export interface TextStyle {
  fontFamily: string;
  weight: number;
  /** relative to canvas height (0.08 = 8% of height) */
  sizeRel: number;
  color: string;
  align: "left" | "center" | "right";
  /** 0..1 vertical position */
  yRel: number;
  /** horizontal centre 0..1 (D47) — absent = align-based margins */
  xRel?: number;
  /** static letter-spacing in em (D47) — base for animated tracking */
  tracking?: number;
  stroke?: string;
  uppercase?: boolean;
}

/** Sound roles a media slot carries (D41) — each independently choosable. */
export interface SlotSounds {
  /** fires on this slot's cut (the moment it appears) */
  cut?: ElementSound;
  /** overrides the chosen block preset's (effect / bundle) built-in sound */
  effect?: ElementSound;
}

/** A light-filter choice (D45): catalog preset id + intensity 0..1. */
export interface LookFilter {
  preset: string;
  amount: number;
}

export interface MediaSlot {
  id: string;
  type: "media";
  accepts: ("photo" | "video")[];
  /** the slot's own length in seconds — content picks it, the creator trims it */
  dur: number;
  crop: "fill" | "fit";
  /**
   * Composition (D56): absent or "single" = one full-frame pane; a
   * split/collage id = the slot shows that many media panes. Pane 0 is
   * the primary: it drives the slot's length and is the only pane whose
   * own sound can play (others are muted under the music).
   */
  layout?: string;
  shortClip?: "freeze" | "loop";
  blockPresets?: PresetRef[];
  sounds?: SlotSounds;
  /**
   * Light filter (D45) — absent = follow the template's `look`;
   * null = explicitly none; object = this slot's own filter.
   */
  filter?: LookFilter | null;
}

export interface TextSlot {
  id: string;
  type: "text";
  /** absolute [start, end] window in seconds */
  time: [number, number];
  layer: number;
  default: string;
  textPreset: string;
  version: number;
  allowedControls: string[];
  style: TextStyle;
  userMay?: UserAction[];
  /** sound on the text's reveal (D41) — replaces the text preset's sound */
  sound?: ElementSound;
  /**
   * Exit animation over the slot's final beats (D43) — resolved into the
   * same schedule entry so the text renderer owns in → hold → out.
   * Absent = the text holds until its window ends (today's behaviour).
   */
  out?: PresetRef;
}

export type Slot = MediaSlot | TextSlot;

/**
 * A sticker (emoji glyph or drawn shape) or an uploaded logo (D46) —
 * a free overlay the creator drags around the screen.
 */
export interface ImageSlot {
  id: string;
  type: "image";
  /** absolute [start, end] window in seconds — usually the whole video */
  time: [number, number];
  /** stacking order above media and text */
  layer: number;
  source:
    | { kind: "sticker"; sticker: string; tone?: string }
    | { kind: "logo"; data: string };
  /** centre in template space, 0..1 of width/height */
  x: number;
  y: number;
  /** width as a fraction of canvas width, 0..1 */
  size: number;
  rotation: number; // degrees
  opacity: number; // 0..1
  userMay?: UserAction[];
}

export interface Connection {
  between: [string, string];
  preset: string;
  version: number;
  params?: Record<string, unknown>;
  /** overrides the transition's built-in sound (D41) */
  sound?: ElementSound;
}

export interface TemplatePalette {
  from: string;
  to: string;
  emoji: string;
}

/* Local-music track ids look like `local:<fileId>` (D40), tone ids like
 * `tone:<toneId>` — the helpers live in core so validation, the builder
 * and the player all agree on parsing. `"none"` is the silent sentinel. */
export const LOCAL_TRACK_PREFIX = "local:";
export const TONE_TRACK_PREFIX = "tone:";
export const NO_MUSIC_TRACK = "none";

export function isLocalTrack(track: string): boolean {
  return track.startsWith(LOCAL_TRACK_PREFIX);
}

export function localTrackId(track: string): string {
  return track.slice(LOCAL_TRACK_PREFIX.length);
}

export function isToneTrack(track: string): boolean {
  return track.startsWith(TONE_TRACK_PREFIX);
}

export function toneTrackId(track: string): string {
  return track.slice(TONE_TRACK_PREFIX.length);
}

/** Metadata for an imported audio file (D40) — the song is stored in
 *  IndexedDB under `fileId`; the template itself stays pure data. */
export interface LocalMusicMeta {
  /** file name, for display without decoding */
  name: string;
  /** audio duration, seconds */
  duration: number;
}

export interface Template {
  id: string;
  schemaVersion: 2;
  title: string;
  description: string;
  categories: string[];
  palette: TemplatePalette;
  /** plain plate behind empty slots — "black" (default) or "white", never a gradient */
  background?: "black" | "white";
  canvas: { ratio: "9:16"; fps: number; width: number; height: number };
  /**
   * Music is a SOUNDTRACK, never a clock (the unlocked model): one tone
   * preset (`tone:<id>`), one imported song (`local:<fileId>`), or silence
   * (`"none"`). No BPM — lengths live on the slots themselves.
   */
  music: {
    track: string;
    /** tone (bed) level 0..1 — absent = 0.9 (D42); 0 silences the bed */
    volume?: number;
    /** present only for imported local music (track = `local:<fileId>`) */
    local?: LocalMusicMeta;
    /** imported-song level 0..1 — absent = 0.9; falls back to `volume` for
     *  older saves that kept one shared level for whichever track was active */
    songVolume?: number;
    /** imported-song on/off — absent = true; false silences the song while
     *  it stays loaded, so a creator can mute their own bed without deleting it */
    songOn?: boolean;
    /** which part of the song plays — start offset in seconds (D50); the
     *  window always covers the video length, so only the start is stored.
     *  Absent/0 = the song's own beginning (older saves). */
    songStart?: number;
  };
  tracks: {
    media: MediaSlot[];
    overlay: TextSlot[];
    /** sticker & logo overlays (D46) — absent in older templates */
    images?: ImageSlot[];
  };
  connections: Connection[];
  /** master SFX switch (D41) — absent/true = on; false silences every
   *  sound effect while the music keeps playing */
  sfxEnabled?: boolean;
  /**
   * Template-wide light filter (D45) — lifts/grades every slot's filmed
   * content; absent = untouched. Slots may override (off or their own).
   */
  look?: LookFilter;
  /** template-level default permissions; slots may only NARROW (Rule 7) */
  userMay: UserAction[];
}

/* ------------------------------------------------------------------ *
 * Schedule (the resolved, flat, deterministic output)
 * ------------------------------------------------------------------ */

export type ScheduleKind =
  | "media"
  | "motion"
  | "effect"
  | "transition"
  | "text"
  | "image"
  | "audio"
  | "music";

export interface ScheduleEntry {
  t: number;
  dur: number;
  kind: ScheduleKind;
  /** slot id | `seam:out|in` | `global` | audio asset id */
  target: string;
  /** "show" | "hide" | "play" | preset id */
  do: string;
  params: Record<string, unknown>;
}

export interface ScheduleSlotInfo {
  id: string;
  index: number;
  type: "media" | "text";
  start: number;
  end: number;
  dur: number;
  accepts?: ("photo" | "video")[];
  layer: number;
}

export interface Schedule {
  schemaVersion: 2;
  templateId: string;
  duration: number;
  fps: number;
  canvas: { width: number; height: number };
  meta: { title: string; palette: TemplatePalette; background: "black" | "white" };
  /** resolved cut times (seconds) — boundaries between media slots */
  cuts: number[];
  slots: ScheduleSlotInfo[];
  entries: ScheduleEntry[];
}

/* ------------------------------------------------------------------ *
 * User content (what the slot-filler may change — content, not structure)
 * ------------------------------------------------------------------ */

export interface ResolveContent {
  texts: Record<string, string>;
  trims: Record<string, number>;
  soundOn: Record<string, boolean>;
}

export function emptyContent(): ResolveContent {
  return { texts: {}, trims: {}, soundOn: {} };
}
