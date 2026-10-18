/**
 * LAYOUTS (Composition family) — one slot showing several media panes:
 * split screen or collage. Pure geometry: a layout id → the normalized
 * (0..1) rects its panes occupy on the 9:16 frame. The player draws each
 * pane's media cover-cropped inside its own rounded rect with a small
 * gap between panes; everything else about the slot — length, filter,
 * effects, motion, sounds — stays slot-level (the composite is styled,
 * not the panes).
 *
 * Pane 0 is the PRIMARY pane: it drives the slot's length (the workbench
 * derives slot seconds from its clip) and it is the only pane whose own
 * sound can ever play — other panes stay muted, so the music bed and the
 * slot's SFX stay clean.
 */

export interface LayoutDef {
  id: string;
  label: string;
  /** how many media panes the filler supplies */
  panes: number;
}

export const LAYOUTS: LayoutDef[] = [
  { id: "single", label: "Full screen", panes: 1 },
  { id: "split-h", label: "Split · side by side", panes: 2 },
  { id: "split-v", label: "Split · top / bottom", panes: 2 },
  { id: "collage-3", label: "Collage · 3 (2 over 1)", panes: 3 },
  { id: "collage-4", label: "Collage · 4 (2×2)", panes: 4 },
];

export function layoutById(id: string): LayoutDef | undefined {
  return LAYOUTS.find((l) => l.id === id);
}

/** Panes a layout shows — anything unknown reads as one full-frame pane. */
export function paneCount(layout: string | undefined): number {
  return layout ? (layoutById(layout)?.panes ?? 1) : 1;
}

/**
 * Binding/content key for one pane: pane 0 keeps the slot's own key
 * (single slots and old templates are unchanged by construction); extra
 * panes are `slotId#pane`.
 */
export function paneKey(slotId: string, pane: number): string {
  return pane <= 0 ? slotId : `${slotId}#${pane}`;
}

/** gap between panes, as a fraction of the frame width */
export const LAYOUT_GAP = 0.01;
/** pane corner radius, as a fraction of the frame width */
export const LAYOUT_RADIUS = 0.02;

/** base (un-gapped) pane grids — full-bleed rows and columns */
const BASE: Record<string, { x: number; y: number; w: number; h: number }[]> = {
  single: [{ x: 0, y: 0, w: 1, h: 1 }],
  "split-h": [
    { x: 0, y: 0, w: 0.5, h: 1 },
    { x: 0.5, y: 0, w: 0.5, h: 1 },
  ],
  "split-v": [
    { x: 0, y: 0, w: 1, h: 0.5 },
    { x: 0, y: 0.5, w: 1, h: 0.5 },
  ],
  "collage-3": [
    { x: 0, y: 0, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0, w: 0.5, h: 0.5 },
    { x: 0, y: 0.5, w: 1, h: 0.5 },
  ],
  "collage-4": [
    { x: 0, y: 0, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0, w: 0.5, h: 0.5 },
    { x: 0, y: 0.5, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
  ],
};

export interface PaneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The panes' rects (normalized frame units) with the gap already carved
 * out of the shared edges — panes bleed to the frame's outer edge and
 * separate cleanly from each other by exactly LAYOUT_GAP.
 */
export function layoutRects(layout: string): PaneRect[] {
  const base = BASE[layout] ?? BASE.single;
  const g = LAYOUT_GAP / 2;
  return base.map((r) => {
    const left = r.x > 0 ? g : 0;
    const right = r.x + r.w < 1 ? g : 0;
    const top = r.y > 0 ? g : 0;
    const bottom = r.y + r.h < 1 ? g : 0;
    return {
      x: r.x + left,
      y: r.y + top,
      w: r.w - left - right,
      h: r.h - top - bottom,
    };
  });
}
