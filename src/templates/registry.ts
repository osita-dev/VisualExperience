/**
 * Template registry — validates every raw template once at module load
 * (V1–V8, Rule 11). Invalid templates never reach the Library.
 */

import type { ValidationIssue } from "@/core/validate/validate";
import type { Template } from "@/core/model/types";
import { validateTemplate } from "@/core/validate/validate";
import { PRESET_MAP } from "@/presets/data";
import { RAW_TEMPLATES } from "./data";

export interface TemplateEntry {
  template: Template;
  issues: ValidationIssue[];
}

export const TEMPLATE_ENTRIES: TemplateEntry[] = RAW_TEMPLATES.map((raw) => {
  const { template, issues } = validateTemplate(raw, PRESET_MAP);
  if (issues.length > 0) {
    console.warn(
      `[Visual Experience] Template "${(raw as Template).id}" rejected:`,
      issues,
    );
  }
  return template ? { template, issues: [] } : { template: raw, issues };
});

/** Only templates with zero issues are offered to users. */
export const templates: Template[] = TEMPLATE_ENTRIES.filter(
  (e) => e.issues.length === 0,
).map((e) => e.template);

export function getTemplate(id: string): Template | undefined {
  return templates.find((t) => t.id === id);
}

/** Full entry (valid or not) — the Detail page can show a real error state. */
export function getTemplateEntry(id: string): TemplateEntry | undefined {
  return TEMPLATE_ENTRIES.find((e) => e.template.id === id);
}

/**
 * Derived template metrics — every number on screen comes from slot durs,
 * never typed (Stage 06 defect #1).
 */
export function metrics(t: Template): {
  duration: number;
  mediaSlots: number;
  textSlots: number;
  totalSlots: number;
  cuts: number[];
} {
  const media = t.tracks.media;
  const cuts: number[] = [];
  let duration = 0;
  media.forEach((s, i) => {
    if (i > 0) cuts.push(duration);
    duration += s.dur;
  });
  return {
    duration,
    mediaSlots: media.length,
    textSlots: t.tracks.overlay.length,
    totalSlots: media.length + t.tracks.overlay.length,
    cuts,
  };
}

/** Unique categories across the valid library — chips are computed, not typed. */
export function allCategories(): string[] {
  const set = new Set<string>();
  for (const t of templates) for (const c of t.categories) set.add(c);
  return [...set].sort();
}
