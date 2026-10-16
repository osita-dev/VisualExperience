/**
 * The TEMPLATE LIBRARY — recipes with the slots left empty (Stage 08 format).
 * The UNLOCKED model (schemaVersion 2): slot lengths are plain seconds —
 * creators trim each slot freely (10s default); music is a soundtrack
 * (a tone preset or an imported song), never a clock.
 */

import type { Template, TextStyle } from "@/core/model/types";

/* ---------- helpers ---------- */

const CANVAS = { ratio: "9:16", fps: 30, width: 1080, height: 1920 } as const;

const USER_MAY = [
  "fill_media",
  "pick_clip_window",
  "toggle_original_sound",
  "edit_text",
] as const;

const CENTER: TextStyle = {
  fontFamily: "Inter",
  weight: 700,
  sizeRel: 0.065,
  color: "#FFFFFF",
  align: "center",
  yRel: 0.76,
  stroke: "rgba(0,0,0,0.35)",
};

const BIG_LIME: TextStyle = {
  fontFamily: "Inter",
  weight: 800,
  sizeRel: 0.1,
  color: "#C6F24E",
  align: "center",
  yRel: 0.3,
  stroke: "rgba(0,0,0,0.45)",
};

/* ---------- the library ---------- */

export const RAW_TEMPLATES: Template[] = [
  /* 1. Golden Hour — 6 slots, 12.0s total */
  {
    id: "tpl.golden_hour",
    schemaVersion: 2,
    title: "Golden Hour",
    description:
      "A cinematic travel template with smooth transitions, warm tones and tight cuts.",
    categories: ["Travel", "Trending"],
    palette: { from: "#FF8A3D", to: "#7A2E5C", emoji: "🌅" },
    canvas: CANVAS,
    music: { track: "tone:samsung.morning_flower" },
    tracks: {
      media: [
        { id: "s1", type: "media", accepts: ["photo", "video"], dur: 2, crop: "fill",
          blockPresets: [{ preset: "motion.push_in", version: 1 }] },
        { id: "s2", type: "media", accepts: ["photo", "video"], dur: 2, crop: "fill",
          blockPresets: [{ preset: "effect.color_grade", version: 1, params: { warmth: "warm" } }] },
        { id: "s3", type: "media", accepts: ["photo", "video"], dur: 2, crop: "fill",
          blockPresets: [{ preset: "motion.drift", version: 1 }] },
        { id: "s4", type: "media", accepts: ["photo", "video"], dur: 2, crop: "fill",
          blockPresets: [{ preset: "effect.vignette", version: 1 }] },
        { id: "s5", type: "media", accepts: ["photo", "video"], dur: 1.5, crop: "fill",
          blockPresets: [{ preset: "motion.push_in", version: 1, params: { intensity: 0.5 } }] },
        { id: "s6", type: "media", accepts: ["photo", "video"], dur: 2.5, crop: "fill",
          blockPresets: [{ preset: "motion.pop", version: 1 }] },
      ],
      overlay: [
        { id: "t1", type: "text", time: [0, 4], layer: 10, default: "Good Vibes",
          textPreset: "text.rise", version: 1, allowedControls: ["value"],
          style: CENTER },
      ],
    },
    connections: [
      { between: ["s1", "s2"], preset: "bundle.zoom_punch", version: 1 },
      { between: ["s2", "s3"], preset: "transition.wipe", version: 1 },
      { between: ["s3", "s4"], preset: "transition.dissolve", version: 1 },
      { between: ["s4", "s5"], preset: "transition.slide_push", version: 1 },
      { between: ["s5", "s6"], preset: "transition.flash", version: 1 },
    ],
    userMay: [...USER_MAY],
  },

  /* 2. Mini Punch — 3 slots, 4.0s total */
  {
    id: "tpl.mini_punch",
    schemaVersion: 2,
    title: "Mini Punch",
    description: "Four seconds of pure impact — one punch, one wipe, zero filler.",
    categories: ["Trending", "Fast Cuts"],
    palette: { from: "#21D4FD", to: "#0A4D8C", emoji: "🌊" },
    canvas: CANVAS,
    music: { track: "tone:samsung.morning_flower" },
    tracks: {
      media: [
        { id: "s1", type: "media", accepts: ["photo", "video"], dur: 1.5, crop: "fill",
          blockPresets: [{ preset: "motion.push_in", version: 1 }] },
        { id: "s2", type: "media", accepts: ["photo", "video"], dur: 1, crop: "fill" },
        { id: "s3", type: "media", accepts: ["photo", "video"], dur: 1.5, crop: "fill",
          blockPresets: [{ preset: "motion.pop", version: 1 }] },
      ],
      overlay: [
        { id: "t1", type: "text", time: [0, 3], layer: 10, default: "SUMMER",
          textPreset: "text.pop", version: 1, allowedControls: ["value"],
          style: CENTER },
      ],
    },
    connections: [
      { between: ["s1", "s2"], preset: "bundle.zoom_punch", version: 1 },
      { between: ["s2", "s3"], preset: "transition.wipe", version: 1 },
    ],
    userMay: [...USER_MAY],
  },

  /* 3. Product Spot — 4 slots, 10.0s total */
  {
    id: "tpl.product_spot",
    schemaVersion: 2,
    title: "Product Spotlight",
    description: "High-energy product ad with punchy cuts.",
    categories: ["Ads", "Product"],
    palette: { from: "#16314F", to: "#2E8BC0", emoji: "🎧" },
    canvas: CANVAS,
    music: { track: "tone:nokia.tune_remix" },
    tracks: {
      media: [
        { id: "s1", type: "media", accepts: ["photo", "video"], dur: 2.4, crop: "fill",
          blockPresets: [{ preset: "motion.push_in", version: 1 }] },
        { id: "s2", type: "media", accepts: ["photo", "video"], dur: 2.8, crop: "fill",
          blockPresets: [{ preset: "effect.color_grade", version: 1, params: { warmth: "cool" } }] },
        { id: "s3", type: "media", accepts: ["photo", "video"], dur: 2.4, crop: "fill",
          blockPresets: [{ preset: "motion.pulse", version: 1 }] },
        { id: "s4", type: "media", accepts: ["photo", "video"], dur: 2.4, crop: "fill",
          blockPresets: [{ preset: "motion.push_in", version: 1 }] },
      ],
      overlay: [
        { id: "t1", type: "text", time: [0, 10], layer: 10, default: "50% OFF",
          textPreset: "text.pop", version: 1, allowedControls: ["value"],
          style: BIG_LIME },
      ],
    },
    connections: [
      { between: ["s1", "s2"], preset: "bundle.zoom_punch", version: 1 },
      { between: ["s2", "s3"], preset: "bundle.glitch_flash", version: 1 },
      { between: ["s3", "s4"], preset: "transition.zoom_reveal", version: 1 },
    ],
    userMay: [...USER_MAY],
  },

  /* 4. Beat Move — 5 slots, 9.0s total */
  {
    id: "tpl.beat_move",
    schemaVersion: 2,
    title: "Beat Move",
    description: "Night-life energy: glitch cuts, grain and a typewriter title.",
    categories: ["Fast Cuts", "Trending"],
    palette: { from: "#FF2E93", to: "#5B1E9E", emoji: "🪩" },
    canvas: CANVAS,
    music: { track: "tone:china.mtk_default" },
    tracks: {
      media: [
        { id: "s1", type: "media", accepts: ["photo", "video"], dur: 1.8, crop: "fill",
          blockPresets: [{ preset: "motion.pulse", version: 1 }] },
        { id: "s2", type: "media", accepts: ["photo", "video"], dur: 1.8, crop: "fill",
          blockPresets: [{ preset: "effect.rgb_split", version: 1, params: { intensity: 0.5 } }] },
        { id: "s3", type: "media", accepts: ["photo", "video"], dur: 1.2, crop: "fill",
          blockPresets: [{ preset: "motion.pop", version: 1 }] },
        { id: "s4", type: "media", accepts: ["photo", "video"], dur: 1.8, crop: "fill",
          blockPresets: [{ preset: "effect.grain", version: 1 }] },
        { id: "s5", type: "media", accepts: ["photo", "video"], dur: 2.4, crop: "fill",
          blockPresets: [{ preset: "motion.push_in", version: 1 }] },
      ],
      overlay: [
        { id: "t1", type: "text", time: [0, 3.6], layer: 10, default: "NIGHT LIFE",
          textPreset: "text.type", version: 1, allowedControls: ["value"],
          style: CENTER },
      ],
    },
    connections: [
      { between: ["s1", "s2"], preset: "bundle.glitch_flash", version: 1 },
      { between: ["s2", "s3"], preset: "transition.wipe", version: 1 },
      { between: ["s3", "s4"], preset: "transition.glitch_cut", version: 1 },
      { between: ["s4", "s5"], preset: "bundle.zoom_punch", version: 1 },
    ],
    userMay: [...USER_MAY],
  },

  /* 5. Urban Vibes — 8 slots, 15.0s total */
  {
    id: "tpl.urban_vibes",
    schemaVersion: 2,
    title: "Urban Vibes",
    description: "City rhythm with cool tones and punchy transitions.",
    categories: ["Trending"],
    palette: { from: "#7B2FBE", to: "#00C9FF", emoji: "🌃" },
    canvas: CANVAS,
    music: { track: "tone:china.mtk_default" },
    tracks: {
      media: [
        { id: "s1", type: "media", accepts: ["photo", "video"], dur: 1.8, crop: "fill",
          blockPresets: [{ preset: "motion.push_in", version: 1 }] },
        { id: "s2", type: "media", accepts: ["photo", "video"], dur: 1.8, crop: "fill",
          blockPresets: [{ preset: "effect.color_grade", version: 1, params: { warmth: "cool" } }] },
        { id: "s3", type: "media", accepts: ["photo", "video"], dur: 1.8, crop: "fill",
          blockPresets: [{ preset: "motion.drift", version: 1 }] },
        { id: "s4", type: "media", accepts: ["photo", "video"], dur: 1.8, crop: "fill",
          blockPresets: [{ preset: "effect.vignette", version: 1 }] },
        { id: "s5", type: "media", accepts: ["photo", "video"], dur: 1.8, crop: "fill",
          blockPresets: [{ preset: "motion.pulse", version: 1 }] },
        { id: "s6", type: "media", accepts: ["photo", "video"], dur: 1.8, crop: "fill",
          blockPresets: [{ preset: "effect.grain", version: 1 }] },
        { id: "s7", type: "media", accepts: ["photo", "video"], dur: 1.8, crop: "fill",
          blockPresets: [{ preset: "motion.pop", version: 1 }] },
        { id: "s8", type: "media", accepts: ["photo", "video"], dur: 2.4, crop: "fill",
          blockPresets: [{ preset: "motion.push_in", version: 1, params: { intensity: 0.5 } }] },
      ],
      overlay: [
        { id: "t1", type: "text", time: [0, 7.2], layer: 10, default: "CITY LIGHTS",
          textPreset: "text.rise", version: 1, allowedControls: ["value"],
          style: CENTER },
      ],
    },
    connections: [
      { between: ["s1", "s2"], preset: "transition.wipe", version: 1 },
      { between: ["s2", "s3"], preset: "transition.dissolve", version: 1 },
      { between: ["s3", "s4"], preset: "bundle.zoom_punch", version: 1 },
      { between: ["s4", "s5"], preset: "transition.flash", version: 1 },
      { between: ["s5", "s6"], preset: "transition.dissolve", version: 1 },
      { between: ["s6", "s7"], preset: "transition.slide_push", version: 1 },
      { between: ["s7", "s8"], preset: "transition.glitch_cut", version: 1 },
    ],
    userMay: [...USER_MAY],
  },

  /* 6. Fresh Food — 6 slots, 11.0s total */
  {
    id: "tpl.fresh_food",
    schemaVersion: 2,
    title: "Fresh Food",
    description: "Warm, appetising and quick — built for menus and food drops.",
    categories: ["Product", "Ads"],
    palette: { from: "#FF6B35", to: "#F7C59F", emoji: "🍜" },
    canvas: CANVAS,
    music: { track: "tone:samsung.morning_flower" },
    tracks: {
      media: [
        { id: "s1", type: "media", accepts: ["photo", "video"], dur: 1.5, crop: "fill",
          blockPresets: [{ preset: "motion.pop", version: 1 }] },
        { id: "s2", type: "media", accepts: ["photo", "video"], dur: 1.5, crop: "fill",
          blockPresets: [{ preset: "effect.color_grade", version: 1, params: { warmth: "warm" } }] },
        { id: "s3", type: "media", accepts: ["photo", "video"], dur: 2, crop: "fill",
          blockPresets: [{ preset: "motion.push_in", version: 1 }] },
        { id: "s4", type: "media", accepts: ["photo", "video"], dur: 2, crop: "fill",
          blockPresets: [{ preset: "effect.vignette", version: 1 }] },
        { id: "s5", type: "media", accepts: ["photo", "video"], dur: 2, crop: "fill",
          blockPresets: [{ preset: "motion.drift", version: 1 }] },
        { id: "s6", type: "media", accepts: ["photo", "video"], dur: 2, crop: "fill",
          blockPresets: [{ preset: "motion.pop", version: 1 }] },
      ],
      overlay: [
        { id: "t1", type: "text", time: [0, 4], layer: 10, default: "FRESH DAILY",
          textPreset: "text.rise", version: 1, allowedControls: ["value"],
          style: CENTER },
      ],
    },
    connections: [
      { between: ["s1", "s2"], preset: "transition.wipe", version: 1 },
      { between: ["s2", "s3"], preset: "transition.dissolve", version: 1 },
      { between: ["s3", "s4"], preset: "bundle.zoom_punch", version: 1 },
      { between: ["s4", "s5"], preset: "transition.flash", version: 1 },
      { between: ["s5", "s6"], preset: "transition.dissolve", version: 1 },
    ],
    userMay: [...USER_MAY],
  },
];
