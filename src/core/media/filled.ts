/**
 * D61 — the chain carries only real content.
 *
 * Pure, dependency-free: given a template and a "does this slot have
 * media?" predicate, return the template whose media track contains
 * ONLY filled slots — so empty slots never render, export, or pad the
 * timeline. When NOTHING is filled yet (a template being previewed in
 * the library), the original template is returned unchanged so the
 * viewer still sees the template's shape.
 */

import type { Template } from "../model/types";

export function filledMediaTemplate(
  t: Template,
  isFilled: (slotId: string) => boolean,
): Template {
  const filled = t.tracks.media.filter((s) => isFilled(s.id));
  /* nothing filled → keep the whole skeleton (template preview) */
  if (filled.length === 0) return t;
  if (filled.length === t.tracks.media.length) return t; // nothing to drop
  return { ...t, tracks: { ...t.tracks, media: filled } };
}
