/**
 * LIGHT-FILTER CATALOG (D45) — how bright/warm/contrasty the FILMED
 * content looks. A template-level `look` lifts every slot at once;
 * a slot may override it (off, or its own filter + intensity).
 *
 * Every preset is DATA: concrete canvas numbers (brightness / contrast /
 * saturate / sepia / hue-rotate), scaled toward identity by the chosen
 * intensity and stamped onto each slot's media entry by resolve — the
 * renderer just draws with them, so preview ≡ export.
 */

import type { VisualPreset } from "@/core/model/types";

export interface FilterFamily {
  id: string;
  label: string;
}

/** Picker groups — the first tag of every preset must be one of these. */
export const FILTER_FAMILIES: FilterFamily[] = [
  { id: "light", label: "Light" },
  { id: "color", label: "Color" },
  { id: "mood", label: "Mood" },
];

const f = (
  id: string,
  name: string,
  family: string,
  resolve: () => Record<string, unknown>,
): VisualPreset => ({
  id,
  version: 1,
  kind: "block",
  name,
  tags: [family],
  resolve,
});

/* Identity = { b: 1, c: 1, s: 1, sep: 0, hue: 0 } — every value here is a
 * full-strength deviation from it; intensity interpolates back to it. */
export const FILTER_PRESETS: VisualPreset[] = [
  /* Light — fix dark footage: lift the environment AND the subject */
  f("filter.brighten", "Brighten", "light",
    () => ({ b: 1.28, c: 1.02 })),
  f("filter.exposure", "Exposure Up", "light",
    () => ({ b: 1.45, c: 1.05, s: 1.05 })),
  f("filter.lift_shadows", "Lift Shadows", "light",
    () => ({ b: 1.18, c: 0.88 })),
  f("filter.soft_light", "Soft Light", "light",
    () => ({ b: 1.15, c: 0.95, s: 1.08 })),
  f("filter.high_key", "High Key", "light",
    () => ({ b: 1.3, c: 0.92, s: 1.02 })),

  /* Color — daylight grades */
  f("filter.warm_day", "Warm Daylight", "color",
    () => ({ b: 1.08, s: 1.1, sep: 0.18 })),
  f("filter.golden_hour", "Golden Hour", "color",
    () => ({ b: 1.12, s: 1.12, sep: 0.32, hue: -6 })),
  f("filter.cool_shade", "Cool Shade", "color",
    () => ({ b: 1.05, s: 1.05, hue: 12 })),
  f("filter.clean_white", "Clean White", "color",
    () => ({ b: 1.14, c: 1.05, s: 0.9 })),
  f("filter.warm_white", "Warm White", "color",
    () => ({ b: 1.12, s: 0.98, sep: 0.12 })),

  /* Mood — deliberate looks */
  f("filter.film_contrast", "Film Contrast", "mood",
    () => ({ b: 1.02, c: 1.22, s: 1.08 })),
  f("filter.pop", "Pop", "mood",
    () => ({ b: 1.04, c: 1.25, s: 1.3 })),
  f("filter.matte_fade", "Matte Fade", "mood",
    () => ({ b: 1.06, c: 0.82, s: 0.92 })),
  f("filter.silver_bw", "Silver B&W", "mood",
    () => ({ b: 1.02, c: 1.12, s: 0 })),
  f("filter.skin_warm", "Warm Skin", "mood",
    () => ({ b: 1.1, s: 1.05, sep: 0.1, hue: -3 })),
  f("filter.punch_day", "Daylight Punch", "mood",
    () => ({ b: 1.2, c: 1.12, s: 1.12 })),
];
