/**
 * FONTS & TYPOGRAPHY (D47) — the named faces the app loads through one
 * Google Fonts <link> in index.html, plus the curated typography combos.
 * Core (no DOM): validation checks font ids against this catalog and the
 * renderer falls back to sans-serif for anything unknown.
 *
 * The typography combos set font + weight + tracking + case only — color
 * stays the Look pick and motion stays the animation pick, so all three
 * remain mixable (D8 evolves, it doesn't break).
 */

export interface FontFace {
  /** Google Fonts family name — also the stored id */
  name: string;
  group: "sans" | "serif" | "display" | "script" | "mono";
  /** weights the <link> actually loads for this family */
  weights: number[];
}

export const FONT_GROUPS = [
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "display", label: "Display" },
  { id: "script", label: "Script" },
  { id: "mono", label: "Mono" },
] as const;

export const FONT_FACES: FontFace[] = [
  /* sans */
  { name: "Inter", group: "sans", weights: [400, 700, 900] },
  { name: "Montserrat", group: "sans", weights: [400, 700, 900] },
  { name: "Poppins", group: "sans", weights: [400, 700, 900] },
  { name: "Roboto", group: "sans", weights: [400, 700, 900] },
  { name: "Archivo", group: "sans", weights: [400, 700, 900] },
  { name: "Barlow", group: "sans", weights: [400, 700, 900] },
  { name: "Raleway", group: "sans", weights: [400, 700, 900] },
  { name: "DM Sans", group: "sans", weights: [400, 700, 900] },
  { name: "Outfit", group: "sans", weights: [400, 700, 900] },
  { name: "Oswald", group: "sans", weights: [400, 700] },
  { name: "Manrope", group: "sans", weights: [400, 700, 800] },
  { name: "Space Grotesk", group: "sans", weights: [400, 700] },
  /* serif */
  { name: "Playfair Display", group: "serif", weights: [400, 700, 900] },
  { name: "Merriweather", group: "serif", weights: [400, 700, 900] },
  { name: "Bodoni Moda", group: "serif", weights: [400, 700, 900] },
  { name: "Fraunces", group: "serif", weights: [400, 700, 900] },
  { name: "Cinzel", group: "serif", weights: [400, 700, 900] },
  { name: "EB Garamond", group: "serif", weights: [400, 700, 800] },
  { name: "Lora", group: "serif", weights: [400, 700] },
  { name: "Libre Baskerville", group: "serif", weights: [400, 700] },
  { name: "Cormorant Garamond", group: "serif", weights: [400, 700] },
  { name: "DM Serif Display", group: "serif", weights: [400] },
  /* display */
  { name: "Anton", group: "display", weights: [400] },
  { name: "Bebas Neue", group: "display", weights: [400] },
  { name: "Abril Fatface", group: "display", weights: [400] },
  { name: "Alfa Slab One", group: "display", weights: [400] },
  { name: "Righteous", group: "display", weights: [400] },
  { name: "Luckiest Guy", group: "display", weights: [400] },
  { name: "Permanent Marker", group: "display", weights: [400] },
  /* script */
  { name: "Pacifico", group: "script", weights: [400] },
  { name: "Great Vibes", group: "script", weights: [400] },
  { name: "Caveat", group: "script", weights: [400, 700] },
  /* mono */
  { name: "Space Mono", group: "mono", weights: [400, 700] },
  { name: "JetBrains Mono", group: "mono", weights: [400, 700, 800] },
];

export const DEFAULT_FONT = "Inter";

export function fontFace(name: string): FontFace | undefined {
  return FONT_FACES.find((f) => f.name === name);
}

/** Clamp a weight to the closest one the face actually loads. */
export function nearestWeight(face: FontFace | undefined, w: number): number {
  if (!face || face.weights.length === 0) return w;
  return face.weights.reduce((a, b) =>
    Math.abs(b - w) < Math.abs(a - w) ? b : a,
  );
}

/** A curated typography combination: font identity only, never color/motion. */
export interface TypographyPreset {
  id: string;
  label: string;
  font: string;
  weight: number;
  /** static letter-spacing in em */
  tracking: number;
  uppercase: boolean;
}

export const TYPOGRAPHY_PRESETS: TypographyPreset[] = [
  { id: "type.cinematic", label: "Cinematic Bold", font: "Anton", weight: 400, tracking: 0.04, uppercase: true },
  { id: "type.condensed", label: "Condensed Cinematic", font: "Oswald", weight: 700, tracking: 0.06, uppercase: true },
  { id: "type.luxury", label: "Luxury Serif", font: "Playfair Display", weight: 700, tracking: 0, uppercase: false },
  { id: "type.contrast", label: "High-Contrast Serif", font: "Bodoni Moda", weight: 700, tracking: 0.08, uppercase: true },
  { id: "type.editorial", label: "Editorial", font: "Fraunces", weight: 700, tracking: 0, uppercase: false },
  { id: "type.magazine", label: "Magazine", font: "DM Serif Display", weight: 400, tracking: 0, uppercase: false },
  { id: "type.fashion", label: "Fashion", font: "Cormorant Garamond", weight: 700, tracking: 0.14, uppercase: true },
  { id: "type.dramatic", label: "Dramatic Movie Title", font: "Cinzel", weight: 700, tracking: 0.1, uppercase: true },
  { id: "type.minimal", label: "Minimalist Sans", font: "Inter", weight: 400, tracking: 0.12, uppercase: true },
  { id: "type.swiss", label: "Swiss", font: "Archivo", weight: 700, tracking: 0, uppercase: true },
  { id: "type.corporate", label: "Clean Corporate", font: "Manrope", weight: 700, tracking: 0, uppercase: false },
  { id: "type.oversized", label: "Oversized", font: "Montserrat", weight: 900, tracking: -0.01, uppercase: true },
  { id: "type.thin", label: "Elegant Thin", font: "Raleway", weight: 400, tracking: 0.18, uppercase: true },
  { id: "type.future", label: "Futuristic", font: "Space Grotesk", weight: 700, tracking: 0.1, uppercase: true },
  { id: "type.retro", label: "Retro", font: "Righteous", weight: 400, tracking: 0.04, uppercase: true },
  { id: "type.docu", label: "Documentary", font: "Merriweather", weight: 700, tracking: 0, uppercase: false },
  { id: "type.marker", label: "Marker", font: "Permanent Marker", weight: 400, tracking: 0, uppercase: false },
  { id: "type.script", label: "Script", font: "Great Vibes", weight: 400, tracking: 0, uppercase: false },
  { id: "type.hand", label: "Handwritten", font: "Caveat", weight: 700, tracking: 0, uppercase: false },
  { id: "type.caption", label: "Bold Caption", font: "Bebas Neue", weight: 400, tracking: 0.06, uppercase: true },
  { id: "type.mono", label: "Technical Mono", font: "Space Mono", weight: 700, tracking: 0.05, uppercase: true },
];

export function typographyOf(id: string): TypographyPreset | undefined {
  return TYPOGRAPHY_PRESETS.find((p) => p.id === id);
}
