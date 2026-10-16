/**
 * STICKER ASSETS (D46) — zero binary assets: emoji are system glyphs and
 * shapes are paths the renderer draws, so they look identical everywhere.
 * Used by validation (V10), the builder picker and the renderer.
 */

export interface StickerAsset {
  id: string;
  group: "emoji" | "shape";
  name: string;
  /** emoji glyph — shapes have none (they are drawn paths) */
  glyph?: string;
}

export const STICKER_GROUPS = [
  { id: "emoji", label: "Emoji" },
  { id: "shape", label: "Shapes" },
] as const;

export const STICKER_ASSETS: StickerAsset[] = [
  { id: "emoji.heart", group: "emoji", name: "Heart", glyph: "❤️" },
  { id: "emoji.fire", group: "emoji", name: "Fire", glyph: "🔥" },
  { id: "emoji.star", group: "emoji", name: "Star", glyph: "⭐" },
  { id: "emoji.hundred", group: "emoji", name: "100", glyph: "💯" },
  { id: "emoji.clap", group: "emoji", name: "Clap", glyph: "👏" },
  { id: "emoji.party", group: "emoji", name: "Party", glyph: "🎉" },
  { id: "emoji.sparkles", group: "emoji", name: "Sparkles", glyph: "✨" },
  { id: "emoji.boom", group: "emoji", name: "Boom", glyph: "💥" },
  { id: "emoji.crown", group: "emoji", name: "Crown", glyph: "👑" },
  { id: "emoji.gem", group: "emoji", name: "Gem", glyph: "💎" },
  { id: "emoji.clapper", group: "emoji", name: "Clapper", glyph: "🎬" },
  { id: "emoji.bolt", group: "emoji", name: "Bolt", glyph: "⚡" },
  { id: "emoji.gift", group: "emoji", name: "Gift", glyph: "🎁" },
  { id: "emoji.trophy", group: "emoji", name: "Trophy", glyph: "🏆" },
  { id: "emoji.music", group: "emoji", name: "Music", glyph: "🎵" },
  { id: "emoji.strong", group: "emoji", name: "Strong", glyph: "💪" },
  { id: "emoji.arms", group: "emoji", name: "Raise", glyph: "🙌" },
  { id: "emoji.rainbow", group: "emoji", name: "Rainbow", glyph: "🌈" },
  { id: "emoji.smile", group: "emoji", name: "Love", glyph: "😍" },
  { id: "emoji.dash", group: "emoji", name: "Dash", glyph: "💨" },
  { id: "shape.star", group: "shape", name: "Star" },
  { id: "shape.bolt", group: "shape", name: "Bolt" },
  { id: "shape.heart", group: "shape", name: "Heart" },
  { id: "shape.crown", group: "shape", name: "Crown" },
  { id: "shape.ring", group: "shape", name: "Ring" },
  { id: "shape.arrow", group: "shape", name: "Arrow" },
  { id: "shape.badge", group: "shape", name: "Badge" },
  { id: "shape.spark", group: "shape", name: "Spark" },
  { id: "shape.dots", group: "shape", name: "Dots" },
  { id: "shape.frame", group: "shape", name: "Frame" },
];

/** Fill tones for drawn shapes (emoji keep their own colors). */
export const STICKER_TONES = [
  "#FFFFFF",
  "#C6F24E",
  "#FFD166",
  "#FF6B6B",
  "#0B1020",
];
