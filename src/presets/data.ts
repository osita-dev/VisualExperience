/**
 * The PRESET LIBRARY — the foundation everything else is built from (Stage 03/04).
 * Adding a preset = adding one entry here. No app change (the add-on requirement).
 *
 * 6 motions · 6 transitions · 6 effects · 3 classic text · 78+14 text
 * channel animations (D43) · 3 bundles · 85 SFX · 3 songs (D8/D41/D43)
 */

import type {
  BundlePreset,
  Preset,
  VisualPreset,
} from "@/core/model/types";
import { TEXT_ANIMATIONS, TEXT_EXITS } from "./textCatalog";
import { VANIM_PRESETS } from "./vanimCatalog";
import { FILTER_PRESETS } from "./filterCatalog";

/* The SFX catalog lives in core (validation V8 + the builder's pickers
 * agree on it); presets only reference asset ids from it (D41). */
export { SFX_ASSETS } from "@/core/audio/sfxCatalog";
export { TEXT_FAMILIES } from "./textCatalog";
export { VANIM_FAMILIES, VANIM_PRESETS } from "./vanimCatalog";
export { FILTER_FAMILIES, FILTER_PRESETS } from "./filterCatalog";

/* ---------- param helpers ---------- */
const num = (
  p: Record<string, unknown>,
  k: string,
  d: number,
): number => (typeof p[k] === "number" ? (p[k] as number) : d);
const str = (
  p: Record<string, unknown>,
  k: string,
  d: string,
): string => (typeof p[k] === "string" ? (p[k] as string) : d);

/* ------------------------------------------------------------------ *
 * MOTIONS (block) — transforms applied to one slot
 * ------------------------------------------------------------------ */

export const MOTIONS: VisualPreset[] = [
  {
    id: "motion.push_in",
    version: 1,
    kind: "block",
    name: "Slow Push In",
    tags: ["cinematic", "subtle"],
    params: { intensity: { type: "number", min: 0, max: 1, default: 0.7 } },
    resolve: (p) => ({
      scale: [1, 1 + 0.18 * num(p, "intensity", 0.7)],
      ease: "out",
      phase: 1,
    }),
  },
  {
    id: "motion.pop",
    version: 1,
    kind: "block",
    name: "Scale Pop",
    tags: ["energetic", "beat"],
    params: { intensity: { type: "number", min: 0, max: 1, default: 0.8 } },
    resolve: (p) => ({
      scale: [1 - 0.35 * num(p, "intensity", 0.8), 1],
      ease: "overshoot",
      phase: 0.4,
    }),
  },
  {
    id: "motion.drift",
    version: 1,
    kind: "block",
    name: "Gentle Drift",
    tags: ["calm", "cinematic"],
    params: { intensity: { type: "number", min: 0, max: 1, default: 0.6 } },
    resolve: (p) => ({
      x: [-0.05 * num(p, "intensity", 0.6), 0.05 * num(p, "intensity", 0.6)],
      ease: "inOut",
      phase: 1,
    }),
  },
  {
    id: "motion.rise",
    version: 1,
    kind: "block",
    name: "Rise Up",
    tags: ["soft", "reveal"],
    params: { intensity: { type: "number", min: 0, max: 1, default: 0.7 } },
    resolve: (p) => ({
      y: [0.1 * num(p, "intensity", 0.7), 0],
      alpha: [0, 1],
      ease: "out",
      phase: 0.55,
    }),
  },
  {
    id: "motion.shake",
    version: 1,
    kind: "block",
    name: "Camera Shake",
    tags: ["energetic", "impact"],
    params: { intensity: { type: "number", min: 0, max: 1, default: 0.6 } },
    resolve: (p) => {
      const i = num(p, "intensity", 0.6);
      return { shakeAmp: 3 + 7 * i, shakeFreq: 22 + 10 * i };
    },
  },
  {
    id: "motion.pulse",
    version: 1,
    kind: "block",
    name: "Heartbeat Pulse",
    tags: ["loop", "beat"],
    params: { intensity: { type: "number", min: 0, max: 1, default: 0.6 } },
    resolve: (p) => ({
      scale: [1, 1 + 0.07 * num(p, "intensity", 0.6)],
      ease: "pulse",
      loop: true,
      phase: 1,
    }),
  },
];

/* ------------------------------------------------------------------ *
 * TRANSITIONS (connection) — centered on the cut, overlapping (Rule 5)
 * ------------------------------------------------------------------ */

export const TRANSITIONS: VisualPreset[] = [
  {
    id: "transition.zoom_reveal",
    version: 1,
    kind: "connection",
    name: "Zoom Reveal",
    tags: ["energetic", "beat"],
    duration: 0.35,
    params: { intensity: { type: "number", min: 0, max: 1, default: 0.7 } },
    sound: [
      { asset: "sfx.whoosh_01", anchor: "start", offset: 0, volume: 0.7 },
      { asset: "sfx.hit_02", anchor: "mid", offset: 0, volume: 1.0 },
    ],
    clashesWith: ["transition.glitch_cut"],
    resolve: (p) => {
      const i = num(p, "intensity", 0.7);
      return { zoom: [1 + 0.3 * (0.5 + i / 2), 1], flashPeak: 0.5 * i, ease: "out" };
    },
  },
  {
    id: "transition.wipe",
    version: 1,
    kind: "connection",
    name: "Clean Wipe",
    tags: ["clean", "soft"],
    duration: 0.3,
    params: {
      direction: {
        type: "choice",
        options: ["right", "left", "up", "down"],
        default: "right",
      },
    },
    sound: [{ asset: "sfx.whoosh_01", anchor: "start", offset: 0, volume: 0.6 }],
    resolve: (p) => ({ dir: str(p, "direction", "right"), ease: "inOut" }),
  },
  {
    id: "transition.dissolve",
    version: 1,
    kind: "connection",
    name: "Soft Dissolve",
    tags: ["soft", "cinematic"],
    duration: 0.4,
    params: { intensity: { type: "number", min: 0, max: 1, default: 1 } },
    sound: [{ asset: "sfx.whoosh_02", anchor: "start", offset: 0, volume: 0.5 }],
    resolve: () => ({ ease: "inOut" }),
  },
  {
    id: "transition.slide_push",
    version: 1,
    kind: "connection",
    name: "Slide Push",
    tags: ["dynamic"],
    duration: 0.35,
    params: {
      direction: { type: "choice", options: ["right", "left"], default: "right" },
    },
    sound: [{ asset: "sfx.whoosh_01", anchor: "start", offset: 0, volume: 0.7 }],
    resolve: (p) => ({ dir: str(p, "direction", "right"), ease: "out" }),
  },
  {
    id: "transition.flash",
    version: 1,
    kind: "connection",
    name: "Light Flash",
    tags: ["bright", "beat"],
    duration: 0.25,
    params: { intensity: { type: "number", min: 0, max: 1, default: 0.8 } },
    sound: [{ asset: "sfx.click", anchor: "mid", offset: 0, volume: 0.9 }],
    resolve: (p) => ({ flashPeak: num(p, "intensity", 0.8) }),
  },
  {
    id: "transition.glitch_cut",
    version: 1,
    kind: "connection",
    name: "Glitch Cut",
    tags: ["energetic", "edgy"],
    duration: 0.3,
    params: { intensity: { type: "number", min: 0, max: 1, default: 0.7 } },
    sound: [{ asset: "sfx.glitch_sting", anchor: "start", offset: 0, volume: 0.8 }],
    clashesWith: ["transition.zoom_reveal"],
    resolve: (p) => ({ glitch: num(p, "intensity", 0.7) }),
  },
];

/* ------------------------------------------------------------------ *
 * EFFECTS (block) — pixel treatments on one slot
 * ------------------------------------------------------------------ */

export const EFFECTS: VisualPreset[] = [
  {
    id: "effect.rgb_split",
    version: 1,
    kind: "block",
    name: "RGB Split",
    tags: ["glitch", "energetic"],
    params: { intensity: { type: "number", min: 0, max: 1, default: 0.6 } },
    resolve: (p) => ({
      offset: [9 * num(p, "intensity", 0.6), 0],
      ease: "out",
      phase: 1,
    }),
  },
  {
    id: "effect.blur_in",
    version: 1,
    kind: "block",
    name: "Blur Focus",
    tags: ["soft", "reveal"],
    params: { amount: { type: "number", min: 0, max: 30, default: 14 } },
    resolve: (p) => ({
      blur: [num(p, "amount", 14), 0],
      ease: "out",
      phase: 1,
    }),
  },
  {
    id: "effect.color_grade",
    version: 1,
    kind: "block",
    name: "Color Grade",
    tags: ["tone", "cinematic"],
    params: {
      warmth: { type: "choice", options: ["warm", "cool"], default: "warm" },
    },
    resolve: (p) => ({
      tint:
        str(p, "warmth", "warm") === "warm"
          ? "rgba(255, 170, 90, 0.20)"
          : "rgba(90, 160, 255, 0.20)",
      blend: "soft-light",
    }),
  },
  {
    id: "effect.vignette",
    version: 1,
    kind: "block",
    name: "Vignette",
    tags: ["depth", "cinematic"],
    params: { intensity: { type: "number", min: 0, max: 1, default: 0.5 } },
    resolve: (p) => {
      const a = 0.6 * num(p, "intensity", 0.5);
      return { alpha: [a, a] };
    },
  },
  {
    id: "effect.grain",
    version: 1,
    kind: "block",
    name: "Film Grain",
    tags: ["texture", "film"],
    params: { intensity: { type: "number", min: 0, max: 1, default: 0.3 } },
    resolve: (p) => {
      const a = 0.18 * num(p, "intensity", 0.3);
      return { alpha: [a, a], seed: 7 };
    },
  },
  {
    id: "effect.duotone",
    version: 1,
    kind: "block",
    name: "Duotone",
    tags: ["stylized", "bold"],
    params: { intensity: { type: "number", min: 0, max: 1, default: 1 } },
    resolve: (p) => ({
      strength: num(p, "intensity", 1),
      dark: "#0B1120",
      light: "#C6F24E",
    }),
  },
];

/* ------------------------------------------------------------------ *
 * TEXT ANIMATIONS
 * ------------------------------------------------------------------ */

export const TEXT_PRESETS: VisualPreset[] = [
  /* --- the three classic whole-text animations (unchanged, D8) --- */
  {
    id: "text.pop",
    version: 1,
    kind: "text",
    name: "Pop In",
    tags: ["energetic"],
    resolve: () => ({ mode: "pop", inFrac: 0.35, ease: "overshoot" }),
  },
  {
    id: "text.rise",
    version: 1,
    kind: "text",
    name: "Rise Up",
    tags: ["soft"],
    resolve: () => ({ mode: "rise", inFrac: 0.4, ease: "out" }),
  },
  {
    id: "text.type",
    version: 1,
    kind: "text",
    name: "Typewriter",
    tags: ["playful"],
    resolve: () => ({ mode: "type", inFrac: 0.6, ease: "linear" }),
  },
  /* --- the D43 channel catalog: entrances then exits --- */
  ...TEXT_ANIMATIONS,
  ...TEXT_EXITS,
];

/* ------------------------------------------------------------------ *
 * BUNDLES — atomic presets wired together ("one pick, five things")
 * ------------------------------------------------------------------ */

export const BUNDLES: BundlePreset[] = [
  {
    id: "bundle.zoom_punch",
    version: 1,
    kind: "bundle",
    name: "Zoom Punch",
    placement: "connection",
    duration: 0.35,
    tags: ["energetic", "beat"],
    clashesWith: ["transition.glitch_cut"],
    members: [
      { preset: "transition.zoom_reveal", version: 1, window: [0, 0.35] },
      {
        preset: "motion.shake",
        version: 1,
        window: [0, 0.35],
        params: { intensity: 0.5 },
      },
      {
        preset: "effect.rgb_split",
        version: 1,
        window: [0, 0.18],
        params: { intensity: 0.6 },
      },
      { preset: "sfx.whoosh_01", anchor: "start", offset: 0, volume: 0.8 },
      { preset: "sfx.hit_02", anchor: "mid", offset: 0, volume: 1.0 },
    ],
  },
  {
    id: "bundle.glitch_flash",
    version: 1,
    kind: "bundle",
    name: "Glitch Flash",
    placement: "connection",
    duration: 0.3,
    tags: ["edgy", "beat"],
    clashesWith: ["transition.zoom_reveal"],
    members: [
      { preset: "transition.glitch_cut", version: 1, window: [0, 0.3] },
      {
        preset: "effect.rgb_split",
        version: 1,
        window: [0, 0.15],
        params: { intensity: 0.8 },
      },
      {
        preset: "effect.grain",
        version: 1,
        window: [0, 0.12],
        params: { intensity: 0.5 },
      },
      { preset: "sfx.glitch_sting", anchor: "start", offset: 0, volume: 0.8 },
      { preset: "sfx.hit_01", anchor: "mid", offset: 0, volume: 0.9 },
    ],
  },
  {
    id: "bundle.beat_drop",
    version: 1,
    kind: "bundle",
    name: "Beat Drop",
    placement: "block",
    duration: 0.6,
    tags: ["beat", "impact"],
    members: [
      { preset: "motion.pop", version: 1, window: [0, 0.6], params: { intensity: 0.9 } },
      {
        preset: "effect.rgb_split",
        version: 1,
        window: [0, 0.25],
        params: { intensity: 0.7 },
      },
      { preset: "sfx.riser", anchor: "start", offset: -0.45, volume: 0.6 },
      { preset: "sfx.hit_02", anchor: "start", offset: 0, volume: 1.0 },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * SFX assets — see `core/audio/sfxCatalog` (D41): 85 procedural sounds
 * synthesised by the audio engine (no files).
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Music lives in `core/audio/tones` — the tone catalog (no BPM, no grid).
 * The old SONGS trio (Sunset Vibes / Night Drive / Pulse) retired with
 * the beat model; `song.*` tracks migrate to silence on import.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Registry — every preset keyed by `id@version` (Rule 3: pinned refs)
 * ------------------------------------------------------------------ */

export const PRESET_LIST: Preset[] = [
  ...MOTIONS,
  ...TRANSITIONS,
  ...EFFECTS,
  ...TEXT_PRESETS,
  ...VANIM_PRESETS,
  ...FILTER_PRESETS,
  ...BUNDLES,
];

export const PRESET_MAP: Record<string, Preset> = Object.fromEntries(
  PRESET_LIST.map((p) => [`${p.id}@${p.version}`, p]),
);

export function getPreset(id: string, version: number): Preset | undefined {
  return PRESET_MAP[`${id}@${version}`];
}
