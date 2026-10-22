/**
 * The canvas frame pipeline — ONE renderer used by preview AND export,
 * which is what makes preview ≡ export structural, not aspirational.
 *
 * All drawing happens in virtual template space (1080×1920); the target
 * canvas is scaled, so 720p preview and 1080p export render identically.
 */

import type { Schedule, ScheduleEntry } from "@/core/model/types";
import { STICKER_ASSETS, type StickerAsset } from "@/core/media/stickers";
import {
  LAYOUT_RADIUS,
  layoutRects,
  paneCount,
  paneKey,
} from "@/core/media/layouts";
import { applyEase, lerp, mulberry32 } from "@/core/resolve/easing";

const TAU = Math.PI * 2;

/* ---------------- media bindings ---------------- */

export interface MediaBinding {
  slotId: string;
  type: "image" | "video";
  el: HTMLImageElement | HTMLVideoElement;
  url: string;
  /** clip duration in seconds (Infinity for images) */
  duration: number;
}

export type Bindings = Record<string, MediaBinding | undefined>;

interface MediaPlanItem {
  slotId: string;
  index: number;
  start: number;
  end: number;
  trimStart: number;
  crop: "fill" | "fit";
  /** Composition (D56): layout id — "single" = one full-frame pane */
  layout: string;
  /** per-pane trim starts (index = pane); pane 0 also lives in trimStart */
  paneTrims: number[];
  showStart: number;
  showEnd: number;
}

const planCache = new WeakMap<Schedule, MediaPlanItem[]>();

export function buildMediaPlan(s: Schedule): MediaPlanItem[] {
  const cached = planCache.get(s);
  if (cached) return cached;
  const plan: MediaPlanItem[] = [];
  for (const slot of s.slots) {
    if (slot.type !== "media") continue;
    const show = s.entries.find(
      (e) => e.kind === "media" && e.target === slot.id && e.do === "show",
    );
    const rawPanes = show?.params.panes;
    plan.push({
      slotId: slot.id,
      index: slot.index,
      start: slot.start,
      end: slot.end,
      trimStart: Number(show?.params.trimStart ?? 0),
      crop: (show?.params.crop as "fill" | "fit") ?? "fill",
      layout: String(show?.params.layout ?? "single"),
      paneTrims: Array.isArray(rawPanes)
        ? rawPanes.map((n) => Number(n ?? 0))
        : [],
      showStart: show?.t ?? slot.start,
      showEnd: show ? show.t + show.dur : slot.end,
    });
  }
  plan.sort((a, b) => a.index - b.index);
  planCache.set(s, plan);
  return plan;
}

/* ---------------- video transport (shared by preview & export) ---------------- */

function toVideo(b: MediaBinding): HTMLVideoElement | null {
  return b.type === "video" ? (b.el as HTMLVideoElement) : null;
}

/**
 * Keep every video element at the right content time. Videos PLAY in real
 * time (both preview and export are real-time), so frames come from the
 * element itself — no per-frame seeking, no divergence.
 */
export interface SeekTarget {
  el: HTMLVideoElement;
  target: number;
}

/**
 * Re-point the media elements for time `t`. When `playing` is false (frame
 * export) every clip is parked at its exact frame; the returned seek targets
 * let the exporter await each `seeked` — and confirm the element actually
 * REACHED its target — so a captured frame is never a half-seeked clip (the
 * glitch that used to show at slot seams). Preview ignores the return value.
 */
export function syncMedia(
  s: Schedule,
  bindings: Bindings,
  t: number,
  playing: boolean,
  seek: boolean,
): SeekTarget[] {
  const plan = buildMediaPlan(s);
  const seeks: SeekTarget[] = [];
  const seekTo = (v: HTMLVideoElement, target: number) => {
    v.currentTime = target;
    seeks.push({ el: v, target });
  };
  for (const item of plan) {
    /* Composition (D56): every pane's clip is transported on its own —
       same window, same time-map, its own trim (pane 0 = the slot's) */
    for (let pane = 0; pane < paneCount(item.layout); pane++) {
      const trim =
        pane === 0 ? item.trimStart : (item.paneTrims[pane] ?? item.trimStart);
      const b = bindings[paneKey(item.slotId, pane)];
      const v = b ? toVideo(b) : null;
      if (!v) continue;
      const visible = t >= item.showStart && t < item.showEnd;
      /* time-map (D44): freeze / slow-mo / speed-ramp remap clip time */
      const tm = timeMapOf(s.entries, item.slotId, t);
      let el = Math.min(t - item.start, item.end - item.start);
      if (tm) el = applyTimeMap(tm, Math.max(0, el), item.end - item.start);
      const target = t < item.start ? trim : trim + Math.max(0, el);

      if (tm && tm.params.tm === "freeze") {
        /* a frozen clip is parked, not fought with drift correction */
        v.pause();
        if (Math.abs(v.currentTime - target) > 0.02) seekTo(v, target);
        continue;
      }
      if (!playing) {
        v.pause();
        if (seek && Math.abs(v.currentTime - target) > 0.02) seekTo(v, target);
        continue;
      }
      if (!visible) {
        v.pause();
        continue;
      }
      if (t < item.start) {
        // pre-roll: hold the first frame of the trim window
        v.pause();
        if (Math.abs(v.currentTime - trim) > 0.12) seekTo(v, trim);
        continue;
      }
      if (t <= item.end) {
        if (v.paused) {
          seekTo(v, target);
          void v.play().catch(() => undefined);
        } else if (Math.abs(v.currentTime - target) > 0.35) {
          seekTo(v, target); // drift correction (tab throttle etc.)
        }
      } else if (v.paused && !v.ended) {
        // post-roll: keep playing into spare material; freezes at clip end
        void v.play().catch(() => undefined);
      }
    }
  }
  return seeks;
}

/* ---------------- helpers ---------------- */

type Ctx2D = CanvasRenderingContext2D;

/** The effective light-filter numbers (D45) on a slot's media entry. */
function mediaFilterOf(
  entries: ScheduleEntry[],
  slotId: string,
): { b: number; c: number; s: number; sep: number; hue: number } | undefined {
  for (const e of entries) {
    if (e.kind === "media" && e.target === slotId && e.do === "show") {
      return e.params.filter as
        | { b: number; c: number; s: number; sep: number; hue: number }
        | undefined;
    }
  }
  return undefined;
}

/** Canvas filter string for resolved light-filter numbers (D45). */
function filterCss(f: {
  b: number;
  c: number;
  s: number;
  sep: number;
  hue: number;
}): string {
  return (
    `brightness(${f.b}) contrast(${f.c}) saturate(${f.s})` +
    (f.sep ? ` sepia(${f.sep})` : "") +
    (f.hue ? ` hue-rotate(${f.hue}deg)` : "")
  );
}

/* ---- sticker & logo overlays (D46) ---- */

/** Embedded logo data URLs load once per renderer process. */
const logoCache = new Map<string, HTMLImageElement>();

function stickerOf(id: string): StickerAsset | undefined {
  return STICKER_ASSETS.find((a) => a.id === id);
}

/** Procedural shape stickers (D46) — drawn in a centred ±r box. */
function drawStickerShape(ctx: Ctx2D, id: string, s: number, tone: string): void {
  const r = s / 2;
  ctx.fillStyle = tone;
  ctx.strokeStyle = tone;
  ctx.lineJoin = "round";
  switch (id) {
    case "shape.star":
    case "shape.spark": {
      const points = id === "shape.star" ? 5 : 4;
      const inner = id === "shape.star" ? 0.45 : 0.3;
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const a = (i / (points * 2)) * TAU - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * inner;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "shape.bolt": {
      ctx.beginPath();
      ctx.moveTo(r * 0.15, -r);
      ctx.lineTo(-r * 0.55, r * 0.15);
      ctx.lineTo(-r * 0.05, r * 0.15);
      ctx.lineTo(-r * 0.25, r);
      ctx.lineTo(r * 0.55, -r * 0.2);
      ctx.lineTo(r * 0.05, -r * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "shape.heart": {
      ctx.beginPath();
      ctx.moveTo(0, r * 0.8);
      ctx.bezierCurveTo(-r * 1.15, -r * 0.1, -r * 0.5, -r, 0, -r * 0.35);
      ctx.bezierCurveTo(r * 0.5, -r, r * 1.15, -r * 0.1, 0, r * 0.8);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "shape.crown": {
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.5);
      ctx.lineTo(-r * 0.5, 0);
      ctx.lineTo(0, -r * 0.85);
      ctx.lineTo(r * 0.5, 0);
      ctx.lineTo(r, -r * 0.5);
      ctx.lineTo(r * 0.8, r * 0.6);
      ctx.lineTo(-r * 0.8, r * 0.6);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "shape.ring": {
      ctx.lineWidth = r * 0.28;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.8, 0, TAU);
      ctx.stroke();
      break;
    }
    case "shape.arrow": {
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.4);
      ctx.lineTo(r * 0.15, -r * 0.4);
      ctx.lineTo(r * 0.15, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(r * 0.15, r);
      ctx.lineTo(r * 0.15, r * 0.4);
      ctx.lineTo(-r, r * 0.4);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "shape.badge": {
      ctx.beginPath();
      const petals = 8;
      for (let i = 0; i <= petals * 2; i++) {
        const a = (i / (petals * 2)) * TAU;
        const rr = i % 2 === 0 ? r : r * 0.76;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "shape.dots": {
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(i * r * 0.62, 0, r * 0.26, 0, TAU);
        ctx.fill();
      }
      break;
    }
    default: {
      // shape.frame
      ctx.lineWidth = r * 0.2;
      const k = r * 0.9;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(-k, -k, k * 2, k * 2, r * 0.25);
      else ctx.rect(-k, -k, k * 2, k * 2);
      ctx.stroke();
    }
  }
}

/** The active time-map entry (D44) for a slot at `t`, if any. */
function timeMapOf(
  entries: ScheduleEntry[],
  slotId: string,
  t: number,
): ScheduleEntry | undefined {
  let hit: ScheduleEntry | undefined;
  for (const e of entries) {
    if (e.kind !== "effect" || e.target !== slotId) continue;
    if (!e.do.startsWith("vanim.") || e.params.tm === undefined) continue;
    if (t < e.t || t >= e.t + e.dur) continue;
    hit = e; // last one wins
  }
  return hit;
}

/** Remap elapsed clip time through freeze / slow / ramp curves (D44). */
function applyTimeMap(e: ScheduleEntry, el: number, span: number): number {
  const kind = String(e.params.tm ?? "");
  if (kind === "freeze") {
    const win = Math.min(1, Math.max(0, num(e.params.tmWin, 1)));
    return el < span * win ? 0 : el;
  }
  if (kind === "slow") {
    return el * Math.min(4, Math.max(0.05, num(e.params.tmK, 0.5)));
  }
  if (kind === "ramp") {
    const p = span > 0 ? Math.min(1, el / span) : 0;
    const pts: [number, number][] =
      String(e.params.tmCurve ?? "fastslow") === "slowfast"
        ? [[0, 0], [0.4, 0.18], [0.7, 0.62], [1, 1]]
        : [[0, 0], [0.3, 0.62], [0.62, 0.72], [1, 1]];
    let g = p;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      if (p >= x0 && p <= x1) {
        g = y0 + ((p - x0) / Math.max(1e-6, x1 - x0)) * (y1 - y0);
        break;
      }
    }
    return g * span;
  }
  return el;
}

function getCtx(canvas: HTMLCanvasElement): Ctx2D | null {
  return canvas.getContext("2d", { alpha: true });
}

function ensureCanvas(
  store: Map<string, HTMLCanvasElement>,
  key: string,
  w: number,
  h: number,
): { canvas: HTMLCanvasElement; ctx: Ctx2D } | null {
  let c = store.get(key);
  if (!c) {
    c = document.createElement("canvas");
    store.set(key, c);
  }
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const ctx = getCtx(c);
  return ctx ? { canvas: c, ctx } : null;
}

function num(v: unknown, d: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}
function pair(v: unknown, d: number): [number, number] {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === "number"
    ? [v[0], v[1]]
    : [d, d];
}

/* ---- D43 text-channel engine: unit layout + seeded helpers ---- */

const SCRAM_POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@";

interface ChUnit {
  text: string;
  /** left edge within its line */
  x: number;
  /** advance width (incl. tracking) */
  w: number;
  /** stagger order fraction 0..1 */
  f: number;
  line: number;
}
interface ChLayout {
  units: ChUnit[];
  lineW: number[];
  lines: number;
  maxW: number;
}
interface GlitchSpec {
  rgb?: number;
  rows?: number;
  scan?: number;
  flicker?: number;
}

function orderFrac(f: number, order: string, seed: number, i: number): number {
  if (order === "rev") return 1 - f;
  if (order === "center") return Math.abs(f - 0.5) * 2;
  if (order === "rand") return mulberry32(seed + i * 97)();
  return f;
}

/** Seeded glyph noise for scramble/decode — characters lock in as p → 1. */
function scrambleUnit(s: string, seed: number, prog: number): string {
  const r = mulberry32(seed);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const rv = r();
    out += rv < prog ? s[i] : SCRAM_POOL[Math.floor(r() * SCRAM_POOL.length)];
  }
  return out;
}

/* measure cache — text layout asks for the same strings every single
   frame; widths never change for a given font+string, so a small LRU
   turns the per-frame measureText storm into map lookups. This is the
   biggest CPU cost of animated text on phones. Pixel-identical output:
   the same font measures the same widths. */
const MEASURE_MAX = 2048;
const measureCache = new Map<string, number>();
function measureW(lc: Ctx2D, text: string): number {
  const key = `${lc.font} ${text}`;
  const hit = measureCache.get(key);
  if (hit !== undefined) return hit;
  const w = lc.measureText(text).width;
  if (measureCache.size >= MEASURE_MAX) {
    let n = MEASURE_MAX >> 2; // drop the oldest quarter (insertion order)
    for (const k of measureCache.keys()) {
      measureCache.delete(k);
      if (--n <= 0) break;
    }
  }
  measureCache.set(key, w);
  return w;
}

/** Wrap text into lines, then split into animation units by word/char/line. */
function layoutTextCh(
  lc: Ctx2D,
  text: string,
  maxW: number,
  trackPx: number,
  by: string,
  order: string,
  seed: number,
): ChLayout {
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    let cur = "";
    for (const word of raw.split(" ")) {
      const probe = cur ? `${cur} ${word}` : word;
      if (cur && measureW(lc, probe) + trackPx * probe.length > maxW) {
        lines.push(cur);
        cur = word;
      } else cur = probe;
    }
    lines.push(cur);
  }
  const spaceW = measureW(lc, " ") + trackPx;
  const lineW: number[] = [];
  const units: ChUnit[] = [];
  let nWords = 0;
  let nChars = 0;
  for (const l of lines) nWords += l.split(" ").filter(Boolean).length;
  for (const l of lines) for (const c of l) if (c !== " ") nChars++;
  let gWord = 0;
  let gChar = 0;
  for (let li = 0; li < lines.length; li++) {
    const l = lines[li];
    const w = measureW(lc, l) + trackPx * l.length;
    lineW.push(w);
    if (by === "line") {
      units.push({
        text: l,
        x: 0,
        w,
        f: orderFrac(lines.length > 1 ? li / (lines.length - 1) : 0, order, seed, li),
        line: li,
      });
      continue;
    }
    let x = 0;
    for (const word of l.split(" ")) {
      const wordW = measureW(lc, word) + trackPx * word.length;
      if (by === "word") {
        if (word)
          units.push({
            text: word,
            x,
            w: wordW,
            f: orderFrac(nWords > 1 ? gWord / (nWords - 1) : 0, order, seed, gWord),
            line: li,
          });
        if (word) gWord++;
        x += wordW + spaceW;
      } else {
        for (const ch of word) {
          const cw = measureW(lc, ch) + trackPx;
          if (ch !== " ")
            units.push({
              text: ch,
              x,
              w: cw,
              f: orderFrac(nChars > 1 ? gChar / (nChars - 1) : 0, order, seed, gChar),
              line: li,
            });
          x += cw;
          if (ch !== " ") gChar++;
        }
        x += spaceW;
      }
    }
  }
  const maxLW = lineW.reduce((a, b) => Math.max(a, b), 0);
  return { units, lineW, lines: lines.length, maxW: maxLW };
}

/** Progress inside an entry; `loop` keeps oscillating instead of clamping. */
function progressOf(e: ScheduleEntry, t: number): number {
  if (e.dur <= 0) return 1;
  const raw = (t - e.t) / e.dur;
  if (e.params.loop === true) return ((raw % 1) + 1) % 1;
  return raw < 0 ? 0 : raw > 1 ? 1 : raw;
}

/** Sticky lookup (Rule: a slot motion holds its end pose until superseded). */
function stickyEntry(
  entries: ScheduleEntry[],
  target: string,
  kinds: string[],
  t: number,
): ScheduleEntry | undefined {
  let found: ScheduleEntry | undefined;
  for (const e of entries) {
    if (e.target !== target || e.t > t || !kinds.includes(e.kind)) continue;
    if (!found || e.t >= found.t) found = e;
  }
  return found;
}

/* ---------------- the renderer ---------------- */

interface SlotMod {
  alpha: number;
  dx: number;
  dy: number;
  scale: number;
  clip: { x: number; y: number; w: number; h: number } | null;
}

export class FrameRenderer {
  private layers = new Map<string, HTMLCanvasElement>();
  private snap: HTMLCanvasElement | null = null;
  private chan: HTMLCanvasElement | null = null;
  private grainTile: HTMLCanvasElement | null = null;

  render(
    main: Ctx2D,
    W: number,
    H: number,
    s: Schedule,
    bindings: Bindings,
    t: number,
  ): void {
    const VW = s.canvas.width;
    const VH = s.canvas.height;
    const scale = W / VW;
    const entries = s.entries;

    main.setTransform(scale, 0, 0, scale, 0, 0);
    main.globalAlpha = 1;
    main.filter = "none";
    main.globalCompositeOperation = "source-over";
    main.fillStyle = "#0B1120";
    main.fillRect(0, 0, VW, VH);

    /* --- transition modifiers (Rule 5: window straddles the cut) --- */
    const mods = new Map<string, SlotMod>();
    const getMod = (id: string): SlotMod => {
      let m = mods.get(id);
      if (!m) {
        m = { alpha: 1, dx: 0, dy: 0, scale: 1, clip: null };
        mods.set(id, m);
      }
      return m;
    };
    let flash = 0;
    let glitch = 0;
    for (const e of entries) {
      if (e.kind !== "transition" || t < e.t || t >= e.t + e.dur) continue;
      const seam = e.target.split(":")[1] ?? "";
      const [outId, inId] = seam.split("|");
      const raw = progressOf(e, t);
      const p = applyEase(String(e.params.ease ?? "linear"), raw);
      switch (e.do) {
        case "transition.dissolve":
          getMod(inId).alpha = p;
          break;
        case "transition.wipe": {
          const dir = String(e.params.dir ?? "right");
          const m = getMod(inId);
          m.clip =
            dir === "right"
              ? { x: 0, y: 0, w: VW * p, h: VH }
              : dir === "left"
                ? { x: VW * (1 - p), y: 0, w: VW * p, h: VH }
                : dir === "up"
                  ? { x: 0, y: 0, w: VW, h: VH * p }
                  : { x: 0, y: VH * (1 - p), w: VW, h: VH * p };
          break;
        }
        case "transition.slide_push": {
          const right = String(e.params.dir ?? "right") === "right";
          getMod(inId).dx = (right ? 1 : -1) * (1 - p) * VW;
          getMod(outId).dx = (right ? -1 : 1) * p * VW * 0.35;
          break;
        }
        case "transition.zoom_reveal": {
          const z = pair(e.params.zoom, 1.15);
          getMod(inId).scale = lerp(z[0], z[1], p);
          break;
        }
        case "transition.flash":
          flash = Math.max(flash, num(e.params.flashPeak, 0.8) * Math.sin(Math.PI * raw));
          break;
        case "transition.glitch_cut":
          glitch = Math.max(glitch, num(e.params.glitch, 0.7) * Math.sin(Math.PI * raw));
          break;
        default:
          getMod(inId).alpha = Math.min(getMod(inId).alpha, p);
      }
    }

    /* --- seam shake (whole frame) --- */
    let shakeX = 0;
    let shakeY = 0;
    let shaking = false;
    for (const e of entries) {
      if (e.kind !== "motion" || !e.target.startsWith("seam:")) continue;
      if (t < e.t || t >= e.t + e.dur) continue;
      const amp = num(e.params.shakeAmp, 0);
      if (amp <= 0) continue;
      const f = num(e.params.shakeFreq, 25);
      shakeX += amp * Math.sin(t * f * TAU);
      shakeY += amp * 0.7 * Math.cos(t * f * 1.31 * TAU);
      shaking = true;
    }

    main.save();
    if (shaking) {
      main.translate(VW / 2 + shakeX, VH / 2 + shakeY);
      main.scale(1.02, 1.02); // hide shake edges
      main.translate(-VW / 2, -VH / 2);
    }

    /* --- media slots, in index order (incoming lands on top) --- */
    const plan = buildMediaPlan(s);
    const active = plan.filter((p) => t >= p.showStart && t < p.showEnd);
    for (const item of active) {
      this.drawSlot(main, s, item, bindings, t, W, H, VW, VH, mods.get(item.slotId));
    }

    /* --- glitch slices displace the picture (before text, so text stays clean) --- */
    if (glitch > 0.02) {
      const snap = this.buf("snap", W, H);
      if (snap) {
        snap.ctx.setTransform(1, 0, 0, 1, 0, 0);
        snap.ctx.clearRect(0, 0, W, H);
        snap.ctx.drawImage(main.canvas, 0, 0, W, H);
        main.setTransform(scale, 0, 0, scale, 0, 0);
        const bands = 7;
        const tick = Math.floor(t * 30);
        for (let i = 0; i < bands; i++) {
          const y = (i / bands) * VH;
          const h = VH / bands;
          const dx = glitch * 42 * Math.sin(i * 3.7 + tick * 0.9);
          main.drawImage(snap.canvas, 0, y * scale, W, h * scale, dx, y, VW, h);
        }
      }
    }

    /* --- text overlays --- */
    for (const e of entries) {
      if (e.kind !== "text" || t < e.t || t >= e.t + e.dur) continue;
      this.drawText(main, e, t, VW, VH);
    }

    /* --- sticker & logo overlays (D46) — always on top --- */
    for (const e of entries) {
      if (e.kind !== "image" || t < e.t || t >= e.t + e.dur) continue;
      this.drawImageOverlay(main, e, VW, VH);
    }

    main.restore(); // end shake wrap

    /* --- seam effects over the whole frame (zoom_punch rgb split, grain) --- */
    for (const e of entries) {
      if (e.kind !== "effect" || !e.target.startsWith("seam:")) continue;
      if (t < e.t || t >= e.t + e.dur) continue;
      if (e.do === "effect.rgb_split") {
        const o = lerp(...pair(e.params.offset, 4), applyEase("out", progressOf(e, t)));
        if (o > 0.4) this.compositeSplit(main, main.canvas, W, H, VW, VH, o, 0);
      } else if (e.do === "effect.grain") {
        const a = lerp(...pair(e.params.alpha, 0.1), progressOf(e, t));
        this.drawGrain(main, VW, VH, a, num(e.params.seed, 7), t);
      }
    }

    /* --- flash overlay --- */
    if (flash > 0.003) {
      main.globalAlpha = Math.min(1, flash);
      main.fillStyle = "#FFFFFF";
      main.fillRect(0, 0, VW, VH);
      main.globalAlpha = 1;
    }
    main.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* -------- one slot: motion → media/placeholder → block effects → composite -------- */

  private drawSlot(
    main: Ctx2D,
    s: Schedule,
    item: MediaPlanItem,
    bindings: Bindings,
    t: number,
    W: number,
    H: number,
    VW: number,
    VH: number,
    mod: SlotMod | undefined,
  ): void {
    const store = this.layers;
    const layer = ensureCanvas(store, `slot:${item.slotId}`, W, H);
    if (!layer) return;
    const { ctx: lc, canvas: layerCanvas } = layer;
    lc.setTransform(W / VW, 0, 0, W / VW, 0, 0);
    lc.globalAlpha = 1;
    lc.filter = "none";
    lc.globalCompositeOperation = "source-over";
    lc.clearRect(0, 0, VW, VH);

    /* motion (sticky until superseded) */
    const motion = stickyEntry(s.entries, item.slotId, ["motion"], t);
    lc.save();
    if (motion) this.applyMotion(lc, motion, t, VW, VH);

    /* Composition (D56): split/collage panes draw first; a slot with no
       pane media at all falls back to the designed full-frame path */
    if (paneCount(item.layout) > 1 && this.drawPanes(lc, s, item, bindings, VW, VH)) {
      /* panes drawn — each cover-cropped in its own rounded rect */
    } else {
      const b = bindings[item.slotId];
      if (b) {
        /* light filter (D45) — baked into the media draw; save/restore
           clears it and placeholders are never filtered */
        const mf = mediaFilterOf(s.entries, item.slotId);
        lc.filter = mf ? filterCss(mf) : "none";
      }
      if (b && this.drawSource(lc, b, item, VW, VH)) {
        /* drawn */
      } else {
        lc.filter = "none";
        this.drawPlaceholder(lc, s.meta, VW, VH);
      }
    }
    lc.restore();

    /* video-animation treatments (D44) — media behaviour on the layer */
    for (const e of s.entries) {
      if (e.kind !== "effect" || e.target !== item.slotId || e.t > t) continue;
      if (e.do.startsWith("vanim."))
        this.applyVanim(lc, e, t, VW, VH, layerCanvas, W, H);
    }

    /* block effects (sticky, clamped progress) */
    for (const e of s.entries) {
      if (e.kind !== "effect" || e.target !== item.slotId || e.t > t) continue;
      if (e.do.startsWith("vanim.")) continue;
      this.applySlotEffect(lc, e, t, VW, VH, layerCanvas, W, H);
    }

    /* composite onto main with transition modifier */
    main.save();
    let blurPx = 0;
    const blurE = stickyEntry(s.entries, item.slotId, ["effect"], t);
    if (blurE && blurE.do === "effect.blur_in") {
      blurPx = lerp(...pair(blurE.params.blur, 0), applyEase("out", progressOf(blurE, t)));
    }
    if (mod) {
      main.globalAlpha = mod.alpha;
      main.translate(VW / 2 + mod.dx, VH / 2 + mod.dy);
      main.scale(mod.scale, mod.scale);
      main.translate(-VW / 2, -VH / 2);
      if (mod.clip) {
        main.beginPath();
        main.rect(mod.clip.x, mod.clip.y, mod.clip.w, mod.clip.h);
        main.clip();
      }
    }
    const splitE = stickyEntry(s.entries, item.slotId, ["effect"], t);
    let splitO = 0;
    if (splitE && splitE.do === "effect.rgb_split") {
      splitO = lerp(...pair(splitE.params.offset, 4), applyEase("out", progressOf(splitE, t)));
    }
    if (splitO > 0.4) {
      this.compositeSplit(main, layerCanvas, W, H, VW, VH, splitO, blurPx);
    } else {
      main.filter = blurPx > 0.3 ? `blur(${blurPx}px)` : "none";
      main.drawImage(layerCanvas, 0, 0, VW, VH);
      main.filter = "none";
    }
    main.restore();
  }

  private applyMotion(lc: Ctx2D, e: ScheduleEntry, t: number, VW: number, VH: number): void {
    const pRaw = progressOf(e, t);
    const ph = num(e.params.phase, 1);
    const pr = e.params.loop === true ? pRaw : Math.min(1, pRaw / (ph > 0 ? ph : 1));
    const p = applyEase(String(e.params.ease ?? "linear"), pr);
    let tx = 0;
    let ty = 0;
    if (Array.isArray(e.params.x)) {
      const x = pair(e.params.x, 0);
      tx = lerp(x[0], x[1], p) * VW;
    }
    if (Array.isArray(e.params.y)) {
      const y = pair(e.params.y, 0);
      ty = lerp(y[0], y[1], p) * VH;
    }
    let sc = 1;
    if (Array.isArray(e.params.scale)) {
      const s = pair(e.params.scale, 1);
      sc = lerp(s[0], s[1], p);
    }
    if (Array.isArray(e.params.alpha)) {
      const a = pair(e.params.alpha, 1);
      lc.globalAlpha *= lerp(a[0], a[1], p);
    }
    if (e.params.shakeAmp !== undefined) {
      const amp = num(e.params.shakeAmp, 0);
      const f = num(e.params.shakeFreq, 24);
      tx += amp * Math.sin(t * f * TAU);
      ty += amp * 0.7 * Math.cos(t * f * 1.31 * TAU);
      sc = Math.max(sc, 1.015); // keep edges covered
    }
    lc.translate(VW / 2 + tx, VH / 2 + ty);
    lc.scale(sc, sc);
    lc.translate(-VW / 2, -VH / 2);
  }

  /**
   * D44 — video animations: media-behaviour treatments. The slot's
   * layer is copied to a scratch buffer, cleared, then composited back
   * through the preset's primitive (grid / shatter / strip / pixelate /
   * glitch / clone / ghost / plane / zoom / depth / mask / camera /
   * morph). Time-map presets (freeze / slow / ramp) touch no pixels —
   * syncMedia remaps clip time instead. All randomness is seeded from
   * entry identity + time (preview ≡ export).
   */
  private applyVanim(
    lc: Ctx2D,
    e: ScheduleEntry,
    t: number,
    VW: number,
    VH: number,
    layerCanvas: HTMLCanvasElement,
    W: number,
    H: number,
  ): void {
    /* time-map only (freeze/slow/ramp) — the pixels stay clean */
    if (e.params.op === undefined) return;
    const op = String(e.params.op ?? "");
    if (!op) return;
    const raw = Math.min(1, Math.max(0, (t - e.t) / Math.max(0.001, e.dur)));
    const inFrac = Math.min(0.9, Math.max(0.05, num(e.params.inFrac, 0.45)));
    const pIn = Math.min(1, raw / inFrac);
    const ek = applyEase(String(e.params.ease ?? "out"), pIn);
    const g = t - e.t;
    const seed =
      (Math.floor(e.t * 1000) * 31 + e.target.length * 13 + e.do.length * 7) | 0;
    const sc = W / VW;
    const scratch = this.buf("snap", W, H);
    if (!scratch) return;
    scratch.ctx.setTransform(1, 0, 0, 1, 0, 0);
    scratch.ctx.clearRect(0, 0, W, H);
    scratch.ctx.drawImage(layerCanvas, 0, 0, W, H);
    lc.setTransform(sc, 0, 0, sc, 0, 0);
    lc.globalAlpha = 1;
    lc.filter = "none";
    lc.globalCompositeOperation = "source-over";
    lc.clearRect(0, 0, VW, VH);
    const SRC = scratch.canvas;

    switch (op) {
      case "grid": {
        const cols = Math.max(1, Math.round(num(e.params.cols, 2)));
        const rows = Math.max(1, Math.round(num(e.params.rows, 1)));
        const mode = String(e.params.mode ?? "slice");
        const stag = Math.min(0.9, Math.max(0, num(e.params.stagger, 0.5)));
        const force = num(e.params.force, 0.4);
        const rotMax = num(e.params.rot, 10);
        const zoomVar = num(e.params.zoomVar, 0.12);
        const cw = VW / cols;
        const chh = VH / rows;
        const nAll = cols * rows;
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            const n = j * cols + i;
            const f = nAll > 1 ? n / (nAll - 1) : 0;
            const k = Math.min(1, Math.max(0, pIn * (1 + stag) - f * stag));
            const ke = applyEase("out", k);
            const inv = 1 - ke;
            const rr = mulberry32(seed + n * 29);
            const sgn = rr() < 0.5 ? -1 : 1;
            const sx = i * cw;
            const sy = j * chh;
            lc.save();
            lc.globalAlpha = Math.min(1, ke * 1.7);
            if (mode === "collage") {
              const zoom = 1 + (n % 3) * zoomVar;
              lc.translate(VW / 2, VH / 2);
              lc.scale(lerp(0.82, zoom, ke), lerp(0.82, zoom, ke));
              lc.translate(-VW / 2, -VH / 2);
              lc.drawImage(SRC, sx * sc, sy * sc, cw * sc, chh * sc, sx, sy, cw, chh);
            } else if (mode === "cube") {
              const a = inv * (Math.PI / 2) * (stag > 0.55 ? sgn : 1);
              lc.translate(sx + cw / 2, sy + chh / 2);
              lc.transform(
                Math.max(0.04, Math.abs(Math.cos(a))),
                0,
                Math.sin(a) * 0.55,
                1,
                0,
                0,
              );
              lc.translate(-cw / 2, -chh / 2);
              lc.drawImage(SRC, sx * sc, sy * sc, cw * sc, chh * sc, 0, 0, cw, chh);
            } else {
              lc.translate(
                sx + cw / 2 + inv * force * VW * sgn,
                sy + chh / 2 + inv * force * 0.4 * VH * (rr() - 0.5) * 2,
              );
              lc.rotate(((inv * rotMax * Math.PI) / 180) * sgn);
              lc.translate(-cw / 2, -chh / 2);
              lc.drawImage(SRC, sx * sc, sy * sc, cw * sc, chh * sc, 0, 0, cw, chh);
            }
            lc.restore();
          }
        }
        break;
      }

      case "shatter": {
        const cols = Math.max(2, Math.round(num(e.params.cols, 8)));
        const rows = Math.max(2, Math.round(num(e.params.rows, 12)));
        const force = num(e.params.force, 0.5);
        const gravity = num(e.params.gravity, 0.15);
        const spin = num(e.params.spin, 60);
        const cw = VW / cols;
        const chh = VH / rows;
        const nAll = cols * rows;
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            const n = j * cols + i;
            const f = nAll > 1 ? n / (nAll - 1) : 0;
            const k = Math.min(1, Math.max(0, pIn * 1.35 - f * 0.35));
            const inv = 1 - applyEase("out", k);
            const sx = i * cw * sc;
            const sy = j * chh * sc;
            if (inv <= 0.002) {
              lc.drawImage(SRC, sx, sy, cw * sc, chh * sc, i * cw, j * chh, cw, chh);
              continue;
            }
            const rr = mulberry32(seed + n * 37);
            const dx = (rr() - 0.5) * 2 * force * VW * inv;
            const dy =
              (rr() - 0.5) * 2 * force * 0.5 * VH * inv +
              gravity * VH * inv * inv;
            const rz = ((rr() - 0.5) * 2 * spin * inv * Math.PI) / 180;
            lc.save();
            lc.globalAlpha = Math.min(1, (1 - inv) * 1.6);
            lc.translate(i * cw + cw / 2 + dx, j * chh + chh / 2 + dy);
            lc.rotate(rz);
            lc.translate(-cw / 2, -chh / 2);
            lc.drawImage(SRC, sx, sy, cw * sc + 1, chh * sc + 1, 0, 0, cw + 1, chh + 1);
            lc.restore();
          }
        }
        break;
      }

      case "strip": {
        const mode = String(e.params.mode ?? "wave");
        const amp = num(e.params.amp, 0.06);
        const freq = num(e.params.freq, 2.2);
        const speed = num(e.params.speed, 0.8);
        const power = num(e.params.power, 1);
        const osc = mode === "wave" || mode === "liquid" || mode === "ripple";
        const k = osc ? 1 : 1 - ek; // waves keep living; warps settle
        const N = 56;
        const sw = VW / N;
        for (let i = 0; i < N; i++) {
          const u = (i + 0.5) / N;
          let dx = 0;
          let dy = 0;
          let rot = 0;
          if (mode === "wave") {
            dy = Math.sin(u * Math.PI * 2 * freq + g * speed * 2) * amp * VH * k;
          } else if (mode === "ripple") {
            dy =
              Math.sin(Math.abs(u - 0.5) * 2 * Math.PI * freq + g * speed * 2) *
              amp * VH * k;
          } else if (mode === "liquid") {
            dy =
              (Math.sin(u * Math.PI * 2 * freq + g * speed * 2) +
                0.45 * Math.sin(u * Math.PI * 2 * freq * 2.3 + g * speed * 2.8)) *
              amp * VH * k;
          } else if (mode === "twist") {
            rot = (u - 0.5) * power * 2.4 * k;
          } else if (mode === "bend") {
            dx = Math.sin(u * Math.PI) * power * amp * VW * k;
          } else if (mode === "swirl") {
            const a = power * k * 2.2 * (0.5 - u) * 2;
            lc.save();
            lc.translate(VW / 2, VH / 2);
            lc.rotate(a);
            lc.translate(-VW / 2, -VH / 2);
            lc.drawImage(SRC, i * sw * sc, 0, sw * sc + 1, H, i * sw - 0.5, 0, sw + 1, VH);
            lc.restore();
            continue;
          } else {
            lc.drawImage(SRC, 0, 0, VW, VH);
            break;
          }
          lc.save();
          lc.translate(i * sw + sw / 2 + dx, VH / 2 + dy);
          if (rot !== 0) lc.rotate(rot);
          lc.drawImage(SRC, i * sw * sc, 0, sw * sc + 1, H, -sw / 2 - 0.5, -VH / 2, sw + 1, VH);
          lc.restore();
        }
        break;
      }

      case "pixelate": {
        const from = num(e.params.from, 0.12);
        const to = num(e.params.to, 0);
        const b = Math.max(1, lerp(from, to, ek) * VH);
        if (b <= 1.6) {
          lc.drawImage(SRC, 0, 0, VW, VH);
          break;
        }
        const bw = Math.max(2, Math.round(VW / b));
        const bh = Math.max(2, Math.round(VH / b));
        const chan = this.buf("chan", W, H);
        if (!chan) {
          lc.drawImage(SRC, 0, 0, VW, VH);
          break;
        }
        chan.ctx.setTransform(1, 0, 0, 1, 0, 0);
        chan.ctx.clearRect(0, 0, bw, bh);
        chan.ctx.imageSmoothingEnabled = true;
        chan.ctx.drawImage(SRC, 0, 0, W, H, 0, 0, bw, bh);
        lc.imageSmoothingEnabled = false;
        lc.drawImage(chan.canvas, 0, 0, bw, bh, 0, 0, VW, VH);
        lc.imageSmoothingEnabled = true;
        break;
      }

      case "glitch": {
        const rgb = num(e.params.rgb, 0);
        const rowsN = num(e.params.rows, 0);
        const scan = num(e.params.scan, 0);
        const flicker = num(e.params.flicker, 0);
        const gA = pIn < 1 ? 1 - pIn : 0.22;
        const tick = Math.floor(g * 22);
        lc.globalAlpha = Math.max(
          0.2,
          Math.min(1, 1 - flicker * gA * 0.45 * mulberry32(seed + tick * 131)()),
        );
        if (rgb > 0.02) {
          this.compositeSplit(lc, SRC, W, H, VW, VH, rgb * gA * 9, 0);
        } else if (rowsN > 0.02) {
          const bands = 7;
          for (let b = 0; b < bands; b++) {
            const yy = (b / bands) * VH;
            const hh = VH / bands;
            const jx =
              (mulberry32(seed + b * 97 + tick * 7)() - 0.5) * 2 * rowsN * gA * VW * 0.05;
            lc.drawImage(SRC, 0, yy * sc, W, hh * sc, jx, yy, VW, hh);
          }
        } else {
          lc.drawImage(SRC, 0, 0, VW, VH);
        }
        lc.globalAlpha = 1;
        if (scan > 0.02) {
          lc.save();
          lc.fillStyle = `rgba(0,0,0,${(0.3 * scan * (0.4 + gA)).toFixed(3)})`;
          const step = Math.max(3, VH * 0.008);
          for (let yy = 0; yy < VH; yy += step) lc.fillRect(0, yy, VW, step * 0.4);
          lc.restore();
        }
        break;
      }

      case "clone": {
        const n = Math.min(6, Math.max(1, Math.round(num(e.params.n, 3))));
        const dx = num(e.params.dx, 0.04) * VW;
        const dy = num(e.params.dy, 0.02) * VH;
        const echo = num(e.params.echo, 0) > 0.5;
        for (let i = n; i >= 1; i--) {
          const kk = i / n;
          lc.globalAlpha = (echo ? (1 - kk) * 0.65 : 0.55) * Math.min(1, pIn * 2);
          lc.drawImage(SRC, 0, 0, W, H, dx * i * ek, dy * i * ek, VW, VH);
        }
        lc.globalAlpha = 1;
        lc.drawImage(SRC, 0, 0, VW, VH);
        break;
      }

      case "ghost": {
        const n = Math.min(10, Math.max(2, Math.round(num(e.params.n, 6))));
        const dx = num(e.params.dx, 0.08) * VW;
        const dy = num(e.params.dy, 0) * VH;
        const ss = num(e.params.scaleStep, 0);
        for (let i = n; i >= 1; i--) {
          const kk = i / n;
          lc.globalAlpha = 0.28 * (1 - kk * 0.75);
          const s2 = 1 + ss * kk;
          lc.save();
          lc.translate(VW / 2 + dx * kk * ek, VH / 2 + dy * kk * ek);
          lc.scale(s2, s2);
          lc.translate(-VW / 2, -VH / 2);
          lc.drawImage(SRC, 0, 0, VW, VH);
          lc.restore();
        }
        lc.globalAlpha = 1;
        lc.drawImage(SRC, 0, 0, VW, VH);
        break;
      }

      case "plane": {
        const rx = num(e.params.rx, 0);
        const ry = num(e.params.ry, 0);
        const rz = num(e.params.rz, 0);
        const sway = num(e.params.sway, 0);
        const inv = 1 - ek;
        const srx = rx * inv + sway * 0.04 * Math.sin(g * 1.7);
        const sry = ry * inv + sway * 0.05 * Math.sin(g * 1.3);
        const srz = rz * inv + (sway ? 0.02 * sway * Math.sin(g * 0.9) : 0);
        lc.save();
        lc.translate(VW / 2, VH / 2);
        lc.rotate(srz);
        lc.transform(
          Math.max(0.05, Math.abs(Math.cos(sry))),
          Math.sin(srx) * 0.5,
          Math.sin(sry) * 0.6,
          Math.max(0.05, Math.abs(Math.cos(srx))),
          0,
          0,
        );
        lc.translate(-VW / 2, -VH / 2);
        lc.drawImage(SRC, 0, 0, VW, VH);
        lc.restore();
        break;
      }

      case "zoom": {
        const from = num(e.params.from, 1);
        const to = num(e.params.to, 1.2);
        const s2 = lerp(from, to, ek);
        lc.save();
        lc.translate(VW / 2, VH / 2);
        lc.scale(s2, s2);
        lc.translate(-VW / 2, -VH / 2);
        lc.drawImage(SRC, 0, 0, VW, VH);
        lc.restore();
        break;
      }

      case "depth": {
        const layers = Math.min(4, Math.max(1, Math.round(num(e.params.layers, 3))));
        const zStep = num(e.params.zoomStep, 0.08);
        const drift = num(e.params.drift, 0.06) * VW;
        for (let i = layers - 1; i >= 1; i--) {
          const ke = applyEase("out", Math.min(1, Math.max(0, pIn * 1.4 - i * 0.12)));
          const s2 = 1 + i * zStep;
          lc.globalAlpha = 0.5;
          lc.save();
          lc.translate(VW / 2 - drift * i * ke, VH / 2);
          lc.scale(s2, s2);
          lc.translate(-VW / 2, -VH / 2);
          lc.drawImage(SRC, 0, 0, VW, VH);
          lc.restore();
        }
        lc.globalAlpha = 1;
        const s1 = lerp(0.985, 1, ek);
        lc.save();
        lc.translate(VW / 2, VH / 2);
        lc.scale(s1, s1);
        lc.translate(-VW / 2, -VH / 2);
        lc.drawImage(SRC, 0, 0, VW, VH);
        lc.restore();
        break;
      }

      case "mask": {
        const shape = String(e.params.shape ?? "circle");
        const k = ek;
        lc.save();
        if (shape === "circle") {
          const r = (k * Math.hypot(VW, VH)) / 1.4;
          lc.beginPath();
          lc.arc(VW / 2, VH / 2, r, 0, Math.PI * 2);
          lc.clip();
        } else if (shape === "blinds") {
          const n = 8;
          const bh = VH / n;
          lc.beginPath();
          for (let i = 0; i < n; i++) lc.rect(0, i * bh + (bh * (1 - k)) / 2, VW, bh * k);
          lc.clip();
        } else if (shape === "diag") {
          const kk = k * (VW + VH);
          lc.beginPath();
          lc.moveTo(0, 0);
          lc.lineTo(kk, 0);
          lc.lineTo(0, kk);
          lc.closePath();
          lc.clip();
        } else {
          const n = 6;
          const bw2 = VW / n;
          lc.beginPath();
          for (let i = 0; i < n; i++) lc.rect(i * bw2 + (bw2 * (1 - k)) / 2, 0, bw2 * k, VH);
          lc.clip();
        }
        lc.drawImage(SRC, 0, 0, VW, VH);
        lc.restore();
        break;
      }

      case "camera": {
        const x = pair(e.params.x, 0);
        const y = pair(e.params.y, 0);
        const z = pair(e.params.zoom, 1);
        const cx2 = lerp(x[0], x[1], ek) * VW;
        const cy2 = lerp(y[0], y[1], ek) * VH;
        const s2 = lerp(z[0], z[1], ek);
        lc.save();
        lc.translate(VW / 2 + cx2, VH / 2 + cy2);
        lc.scale(s2, s2);
        lc.translate(-VW / 2, -VH / 2);
        lc.drawImage(SRC, 0, 0, VW, VH);
        lc.restore();
        break;
      }

      case "morph": {
        const amount = num(e.params.amount, 0.6);
        const freq = num(e.params.freq, 2.4);
        const inv = (1 - ek) * amount;
        if (inv < 0.02) {
          lc.drawImage(SRC, 0, 0, VW, VH);
          break;
        }
        lc.globalAlpha = 1 - inv;
        lc.drawImage(SRC, 0, 0, VW, VH);
        lc.globalAlpha = inv;
        const N = 40;
        const sw = VW / N;
        for (let i = 0; i < N; i++) {
          const u = (i + 0.5) / N;
          const dy = Math.sin(u * Math.PI * 2 * freq + g * 1.5) * inv * 0.14 * VH;
          const sx2 = 1 + Math.sin(u * Math.PI * freq * 0.7 + g) * inv * 0.3;
          lc.save();
          lc.translate(i * sw + sw / 2, VH / 2 + dy);
          lc.scale(sx2, 1);
          lc.drawImage(SRC, i * sw * sc, 0, sw * sc + 1, H, -sw / 2 - 0.5, -VH / 2, sw + 1, VH);
          lc.restore();
        }
        lc.globalAlpha = 1;
        break;
      }

      default: {
        lc.drawImage(SRC, 0, 0, VW, VH);
      }
    }
  }

  /**
   * D46 — sticker & logo overlays. Emoji draw as system glyphs, shapes
   * as procedural paths (zero binary assets), logos from their embedded
   * data URL via a shared image cache. Centre-anchored, free rotation,
   * free opacity — preview and export draw the identical call.
   */
  private drawImageOverlay(
    main: Ctx2D,
    e: ScheduleEntry,
    VW: number,
    VH: number,
  ): void {
    const src = e.params.source as
      | { kind?: string; sticker?: string; tone?: string; data?: string }
      | undefined;
    if (!src) return;
    const x = num(e.params.x, 0.5) * VW;
    const y = num(e.params.y, 0.5) * VH;
    const size = num(e.params.size, 0.25) * VW;
    const rot = (num(e.params.rotation, 0) * Math.PI) / 180;
    const alpha = Math.min(1, Math.max(0, num(e.params.opacity, 1)));
    main.save();
    main.globalAlpha = alpha;
    main.translate(x, y);
    if (rot !== 0) main.rotate(rot);
    if (src.kind === "sticker") {
      const asset = stickerOf(src.sticker ?? "");
      if (asset?.glyph) {
        main.font = `${size * 1.15}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        main.textAlign = "center";
        main.textBaseline = "middle";
        main.fillText(asset.glyph, 0, size * 0.04);
      } else if (asset) {
        drawStickerShape(main, asset.id, size, src.tone ?? "#FFFFFF");
      }
    } else if (src.kind === "logo" && src.data) {
      let el = logoCache.get(src.data);
      if (!el) {
        el = new Image();
        el.src = src.data;
        logoCache.set(src.data, el);
      }
      if (el.complete && el.naturalWidth > 0) {
        const h = (size * el.naturalHeight) / el.naturalWidth;
        main.drawImage(el, -size / 2, -h / 2, size, h);
      }
    }
    main.restore();
  }

  /**
   * Composition (D56): the slot's media panes — split screen / collage.
   * Each pane's media is cover-cropped inside its own rounded rect (a
   * small gap separates the panes); filters and effects still act on the
   * whole composite — they belong to the slot, not the panes. An unfilled
   * pane is an honest empty frame, never invented media. Returns false
   * when NO pane has drawable media, so the slot falls back to its
   * designed placeholder.
   */
  private drawPanes(
    lc: Ctx2D,
    s: Schedule,
    item: MediaPlanItem,
    bindings: Bindings,
    VW: number,
    VH: number,
  ): boolean {
    const rects = layoutRects(item.layout);
    const mf = mediaFilterOf(s.entries, item.slotId);
    const rad = LAYOUT_RADIUS * VW;
    let any = false;
    for (let p = 0; p < rects.length; p++) {
      const r = rects[p];
      const x = r.x * VW;
      const y = r.y * VH;
      const w = r.w * VW;
      const h = r.h * VH;
      const b = bindings[paneKey(item.slotId, p)];
      lc.save();
      lc.beginPath();
      if (typeof lc.roundRect === "function") lc.roundRect(x, y, w, h, rad);
      else lc.rect(x, y, w, h);
      lc.clip();
      if (b) {
        lc.filter = mf ? filterCss(mf) : "none";
        if (this.drawSourceIn(lc, b, item, x, y, w, h)) any = true;
      } else {
        lc.fillStyle = "rgba(0,0,0,0.28)";
        lc.fillRect(x, y, w, h);
      }
      lc.restore();
    }
    return any;
  }

  /** Draw a binding's current frame filling the whole frame (full bleed). */
  private drawSource(
    lc: Ctx2D,
    b: MediaBinding,
    item: MediaPlanItem,
    VW: number,
    VH: number,
  ): boolean {
    return this.drawSourceIn(lc, b, item, 0, 0, VW, VH);
  }

  /** Like drawSource, but into an arbitrary rect (pane drawing). */
  private drawSourceIn(
    lc: Ctx2D,
    b: MediaBinding,
    item: MediaPlanItem,
    x: number,
    y: number,
    w: number,
    h: number,
  ): boolean {
    let sw = 0;
    let sh = 0;
    if (b.type === "image") {
      const img = b.el as HTMLImageElement;
      if (!img.complete || img.naturalWidth === 0) return false;
      sw = img.naturalWidth;
      sh = img.naturalHeight;
    } else {
      const v = b.el as HTMLVideoElement;
      if (v.readyState < 2 || v.videoWidth === 0) return false;
      sw = v.videoWidth;
      sh = v.videoHeight;
    }
    const cover = item.crop !== "fit";
    const k = cover ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
    const dw = sw * k;
    const dh = sh * k;
    lc.drawImage(b.el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    return true;
  }

  private drawPlaceholder(
    lc: Ctx2D,
    meta: Schedule["meta"],
    VW: number,
    VH: number,
  ): void {
    /* a plain black or white plate — no gradient, no emoji, no slot labels
       (they only ever cluttered the frame) */
    lc.fillStyle = meta.background === "white" ? "#FFFFFF" : "#000000";
    lc.fillRect(0, 0, VW, VH);
  }

  private applySlotEffect(
    lc: Ctx2D,
    e: ScheduleEntry,
    t: number,
    VW: number,
    VH: number,
    layerCanvas: HTMLCanvasElement,
    W: number,
    H: number,
  ): void {
    const raw = progressOf(e, t);
    const p = applyEase(String(e.params.ease ?? "linear"), raw);
    switch (e.do) {
      case "effect.color_grade": {
        lc.globalCompositeOperation = String(
          e.params.blend ?? "soft-light",
        ) as GlobalCompositeOperation;
        lc.globalAlpha = 1;
        lc.fillStyle = String(e.params.tint ?? "rgba(255,170,90,0.2)");
        lc.fillRect(0, 0, VW, VH);
        lc.globalCompositeOperation = "source-over";
        break;
      }
      case "effect.vignette": {
        const a = lerp(...pair(e.params.alpha, 0.3), p);
        const g = lc.createRadialGradient(
          VW / 2,
          VH / 2,
          VH * 0.32,
          VW / 2,
          VH / 2,
          VH * 0.78,
        );
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, `rgba(0,0,0,${a})`);
        lc.fillStyle = g;
        lc.fillRect(0, 0, VW, VH);
        break;
      }
      case "effect.grain": {
        const a = lerp(...pair(e.params.alpha, 0.1), p);
        this.drawGrain(lc, VW, VH, a, num(e.params.seed, 7), t);
        break;
      }
      case "effect.duotone": {
        const snap = this.buf("snap", W, H);
        if (!snap) break;
        snap.ctx.setTransform(1, 0, 0, 1, 0, 0);
        snap.ctx.clearRect(0, 0, W, H);
        snap.ctx.drawImage(layerCanvas, 0, 0);
        lc.setTransform(W / VW, 0, 0, W / VW, 0, 0);
        lc.clearRect(0, 0, VW, VH);
        lc.filter = "grayscale(1)";
        lc.drawImage(snap.canvas, 0, 0, VW, VH);
        lc.filter = "none";
        lc.globalCompositeOperation = "multiply";
        lc.fillStyle = String(e.params.light ?? "#C6F24E");
        lc.fillRect(0, 0, VW, VH);
        lc.globalCompositeOperation = "screen";
        lc.fillStyle = String(e.params.dark ?? "#0B1120");
        lc.fillRect(0, 0, VW, VH);
        lc.globalCompositeOperation = "source-over";
        const strength = num(e.params.strength, 1);
        if (strength < 1) {
          lc.globalAlpha = 1 - strength;
          lc.drawImage(snap.canvas, 0, 0, VW, VH);
          lc.globalAlpha = 1;
        }
        break;
      }
      default:
        break; // blur_in / rgb_split handled at composite time
    }
  }

  /** 3-channel offset composite — the honest way to do RGB split on canvas. */
  private compositeSplit(
    main: Ctx2D,
    source: HTMLCanvasElement,
    W: number,
    H: number,
    VW: number,
    VH: number,
    o: number,
    blurPx: number,
  ): void {
    const snap = this.buf("snap", W, H);
    const chan = this.buf("chan", W, H);
    if (!snap || !chan) {
      main.drawImage(source, 0, 0, VW, VH);
      return;
    }
    snap.ctx.setTransform(1, 0, 0, 1, 0, 0);
    snap.ctx.clearRect(0, 0, W, H);
    snap.ctx.drawImage(source, 0, 0, W, H);

    main.save();
    main.setTransform(main.getTransform());
    main.globalCompositeOperation = "source-over";
    main.fillStyle = "#000000";
    main.fillRect(0, 0, VW, VH);
    const channels: Array<[string, number]> = [
      ["#FF0000", -o],
      ["#00FF00", 0],
      ["#0000FF", o],
    ];
    for (const [color, dx] of channels) {
      chan.ctx.setTransform(1, 0, 0, 1, 0, 0);
      chan.ctx.clearRect(0, 0, W, H);
      chan.ctx.drawImage(snap.canvas, 0, 0);
      chan.ctx.globalCompositeOperation = "multiply";
      chan.ctx.fillStyle = color;
      chan.ctx.fillRect(0, 0, W, H);
      chan.ctx.globalCompositeOperation = "source-over";
      main.globalCompositeOperation = "lighter";
      main.filter = blurPx > 0.3 ? `blur(${blurPx}px)` : "none";
      main.drawImage(chan.canvas, (dx * W) / VW, 0, W, H);
    }
    main.filter = "none";
    main.globalCompositeOperation = "source-over";
    main.restore();
  }

  private drawGrain(
    lc: Ctx2D,
    VW: number,
    VH: number,
    alpha: number,
    seed: number,
    t: number,
  ): void {
    if (alpha <= 0.004) return;
    if (!this.grainTile) {
      const tile = document.createElement("canvas");
      tile.width = 256;
      tile.height = 256;
      const tc = getCtx(tile);
      if (!tc) return;
      const rnd = mulberry32(seed + 1);
      const img = tc.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 128 + (rnd() * 2 - 1) * 127;
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      tc.putImageData(img, 0, 0);
      this.grainTile = tile;
    }
    const pat = lc.createPattern(this.grainTile, "repeat");
    if (!pat) return;
    const frame = Math.floor(t * 24);
    lc.save();
    lc.globalAlpha = alpha;
    lc.globalCompositeOperation = "overlay";
    lc.translate((frame * 37) % 256, (frame * 61) % 256);
    lc.fillStyle = pat;
    lc.fillRect(-256, -256, VW + 512, VH + 512);
    lc.restore();
  }

  private buf(
    key: string,
    W: number,
    H: number,
  ): { canvas: HTMLCanvasElement; ctx: Ctx2D } | null {
    if (key === "snap") {
      if (!this.snap) this.snap = document.createElement("canvas");
      if (this.snap.width !== W || this.snap.height !== H) {
        this.snap.width = W;
        this.snap.height = H;
      }
      const ctx = getCtx(this.snap);
      return ctx ? { canvas: this.snap, ctx } : null;
    }
    if (!this.chan) this.chan = document.createElement("canvas");
    if (this.chan.width !== W || this.chan.height !== H) {
      this.chan.width = W;
      this.chan.height = H;
    }
    const ctx = getCtx(this.chan);
    return ctx ? { canvas: this.chan, ctx } : null;
  }

  /* -------- text overlays -------- */

  private drawText(lc: Ctx2D, e: ScheduleEntry, t: number, VW: number, VH: number): void {
    const value = String(e.params.value ?? "");
    if (!value) return;
    /* D43 channel presets (and any exit) go through the unit engine */
    if (e.params.ch !== undefined || e.params.out !== undefined) {
      this.drawTextCh(lc, e, t, VW, VH, value);
      return;
    }
    const style = (e.params.style ?? {}) as {
      fontFamily?: string;
      weight?: number;
      sizeRel?: number;
      color?: string;
      align?: CanvasTextAlign;
      xRel?: number;
      yRel?: number;
      stroke?: string;
      uppercase?: boolean;
    };
    const mode = String(e.params.mode ?? "pop");
    const inFrac = num(e.params.inFrac, 0.35);
    const p = applyEase(
      String(e.params.ease ?? "out"),
      Math.min(1, Math.max(0, (t - e.t) / (e.dur * Math.max(0.05, inFrac)))),
    );

    let text = style.uppercase ? value.toUpperCase() : value;
    if (mode === "type") {
      const chars = Math.max(1, Math.round(p * text.length));
      text = text.slice(0, chars);
    }
    if (mode === "type" && text.length === 0) return;

    const size = (style.sizeRel ?? 0.065) * VH;
    /* explicit horizontal position (D47) centres the text on xRel — the
       align-based margins are only the fallback when no xRel was authored;
       mirrors the channel renderer's anchorX exactly */
    const x =
      style.xRel !== undefined
        ? style.xRel * VW
        : style.align === "left"
          ? VW * 0.08
          : style.align === "right"
            ? VW * 0.92
            : VW / 2;
    const y = (style.yRel ?? 0.76) * VH;

    lc.save();
    lc.font = `${style.weight ?? 700} ${size}px "${style.fontFamily ?? "Inter"}", sans-serif`;
    lc.textAlign =
      style.xRel !== undefined ? "center" : (style.align ?? "center");
    lc.textBaseline = "middle";

    let dy = 0;
    let alpha = 1;
    let sc = 1;
    if (mode === "rise") {
      dy = (1 - p) * VH * 0.06;
      alpha = p;
    } else if (mode === "pop") {
      sc = lerp(0.55, 1, p);
      alpha = Math.min(1, p * 2.2);
    }
    lc.globalAlpha = alpha;
    lc.translate(x, y + dy);
    lc.scale(sc, sc);
    if (style.stroke) {
      lc.lineWidth = size * 0.12;
      lc.strokeStyle = style.stroke;
      lc.lineJoin = "round";
      lc.strokeText(text, 0, 0);
    }
    lc.fillStyle = style.color ?? "#FFFFFF";
    lc.fillText(text, 0, 0);
    lc.restore();
  }

  /**
   * D43 — the text-channel engine. A preset is a composition of motion
   * channels over a per-unit (line/word/letter) layout: alpha, slide,
   * scale, fake-3D rotations, blur, tracking, wipe/feather masks, split,
   * stagger, typewriter/scramble gates, glitch (RGB/rows/scan/flicker),
   * shimmer, wave, float, marquee, parallax ghosts, extrusion, paths.
   * `params.out` owns the exit phase (in → hold → out); absent = the
   * text holds until its window ends. All randomness is seeded from
   * entry identity + time — preview ≡ export.
   */
  private drawTextCh(
    lc: Ctx2D,
    e: ScheduleEntry,
    t: number,
    VW: number,
    VH: number,
    value: string,
  ): void {
    const style = (e.params.style ?? {}) as {
      fontFamily?: string;
      weight?: number;
      sizeRel?: number;
      color?: string;
      align?: CanvasTextAlign;
      yRel?: number;
      xRel?: number;
      tracking?: number;
      stroke?: string;
      uppercase?: boolean;
    };
    const spec = e.params as Record<string, unknown>;
    const hasOut = spec.out !== undefined;
    const outSpec = (spec.out ?? {}) as Record<string, unknown>;
    const chIn = (spec.ch ?? {}) as Record<string, unknown>;
    const chOut = (outSpec.ch ?? {}) as Record<string, unknown>;
    let size = (style.sizeRel ?? 0.065) * VH;
    const weight = style.weight ?? 700;
    const family = String(spec.font ?? style.fontFamily ?? "Inter");
    const text = style.uppercase ? value.toUpperCase() : value;
    if (!text) return;

    /* ---- timing: in → hold → out (fractions of the slot span) ---- */
    const dur = Math.max(0.001, e.dur);
    let inFrac = num(spec.inFrac, 0.4);
    let outFrac = hasOut ? num(outSpec.outFrac, 0.25) : 0;
    if (inFrac + outFrac > 0.95) {
      const k = 0.95 / (inFrac + outFrac);
      inFrac *= k;
      outFrac *= k;
    }
    inFrac = Math.min(0.9, Math.max(0.05, inFrac));
    outFrac = Math.min(0.6, Math.max(0, outFrac));
    const inDur = dur * inFrac;
    const outDur = dur * outFrac;
    const tin = Math.min(1, Math.max(0, (t - e.t) / inDur));
    const outStart = e.t + dur - outDur;
    const phaseOut = outDur > 0 && t >= outStart;
    const tout = phaseOut ? Math.min(1, Math.max(0, (t - outStart) / outDur)) : 0;
    const easeIn = String(spec.ease ?? "out");
    const easeOut = String(outSpec.ease ?? "in");

    /* ---- stagger / gates ---- */
    const stagIn = (spec.stag ?? undefined) as
      | { by?: string; amt?: number; order?: string }
      | undefined;
    const stagOut = (outSpec.stag ?? undefined) as
      | { by?: string; amt?: number; order?: string }
      | undefined;
    const stagBy = String(stagIn?.by ?? "char");
    const typeGate = spec.type === true;
    const scramOn = spec.scram === true;

    /* ---- deterministic seeds (t-driven, never wall-clock) ---- */
    const seed =
      (Math.floor(e.t * 1000) * 31 + value.length * 7 + e.target.length) | 0;

    /* ---- tracking animates the layout itself (static base = D47) ---- */
    const trBase = num(style.tracking, 0);
    const trIn = pair(chIn.track, trBase);
    const trackV = phaseOut
      ? chOut.track !== undefined
        ? lerp(pair(chOut.track, 0)[0], pair(chOut.track, 0)[1], applyEase(easeOut, tout))
        : trIn[1]
      : lerp(trIn[0], trIn[1], applyEase(easeIn, tin));
    let trackPx = trackV * size;

    lc.save();
    lc.font = `${weight} ${size}px "${family}", sans-serif`;
    lc.textBaseline = "middle";
    const stagOrder = String(
      (phaseOut ? stagOut?.order : stagIn?.order) ?? "fwd",
    );
    let layout = layoutTextCh(
      lc,
      text,
      VW * 0.86,
      trackPx,
      stagBy,
      stagOrder,
      seed,
    );
    /* auto-shrink guard (D47) — an unbreakable word wider than the frame
       scales the whole block down; text never overflows the screen */
    if (layout.maxW > VW * 0.9 && layout.maxW > 0) {
      size *= (VW * 0.9) / layout.maxW;
      trackPx = trackV * size;
      lc.font = `${weight} ${size}px "${family}", sans-serif`;
      layout = layoutTextCh(
        lc,
        text,
        VW * 0.86,
        trackPx,
        stagBy,
        stagOrder,
        seed,
      );
    }
    const maxW = layout.maxW;

    /* ---- line anchor per alignment (matches the legacy text look) ---- */
    const anchorX = (lineW: number): number =>
      style.xRel !== undefined
        ? style.xRel * VW - lineW / 2
        : style.align === "left"
          ? VW * 0.08
          : style.align === "right"
            ? VW * 0.92 - lineW
            : VW / 2 - lineW / 2;
    const baseY = (style.yRel ?? 0.76) * VH;
    const lineY = (line: number): number =>
      baseY + (line - (layout.lines - 1) / 2) * size * 1.25;

    /* ---- hold-phase motions ---- */
    const fl = (spec.float ?? undefined) as
      | { amp?: number; freq?: number; speed?: number }
      | undefined;
    const floatY = fl
      ? Math.sin((t - e.t) * num(fl.freq, 0.35) * Math.PI * 2) * num(fl.amp, 0.01) * VH
      : 0;
    const floatX = fl
      ? Math.sin((t - e.t) * num(fl.freq, 0.35) * 1.3 * Math.PI * 2) *
        num(fl.amp, 0.01) * VH * 0.4
      : 0;
    const mq = (spec.marquee ?? undefined) as
      | { speed?: number; gap?: number }
      | undefined;
    const marqueeSpan = mq ? maxW + num(mq.gap, 0.6) * VW : 0;
    const marqueeX = mq ? -(((t - e.t) * num(mq.speed, 0.12)) % 1) * marqueeSpan : 0;
    const pulseS =
      1 + num(spec.pulse, 0) * 0.05 * ((Math.sin((t - e.t) * 4.2) + 1) / 2);
    const path = (spec.path ?? undefined) as
      | { shape?: string; bend?: number; amp?: number; freq?: number; speed?: number }
      | undefined;

    /* ---- glitch envelope: fades with the phase it belongs to ---- */
    const glIn = (spec.glitch ?? undefined) as GlitchSpec | undefined;
    const glOut = (outSpec.glitch ?? undefined) as GlitchSpec | undefined;
    const gl = phaseOut ? glOut : glIn;
    const gAmt = gl ? (phaseOut ? tout : 1 - tin) : 0;
    const tick = Math.floor((t - e.t) * 24);
    const flickerMul = 1 - num(gl?.flicker, 0) * gAmt * 0.55 * mulberry32(seed + tick * 131)();

    /* ---- wipe / feather mask state ---- */
    const wipeIn = pair(chIn.wipe, 1);
    const wipeV = phaseOut
      ? chOut.wipe !== undefined
        ? lerp(pair(chOut.wipe, 1)[0], pair(chOut.wipe, 1)[1], applyEase(easeOut, tout))
        : wipeIn[1]
      : lerp(wipeIn[0], wipeIn[1], applyEase(easeIn, tin));
    const wipeAxis = String(
      phaseOut ? (outSpec.wipeAxis ?? spec.wipeAxis ?? "x") : (spec.wipeAxis ?? "x"),
    );
    const featherPx =
      num(phaseOut ? (outSpec.feather ?? spec.feather) : spec.feather, 0) * size;

    /* ---- fill: tint / gradient ---- */
    const baseFill = style.color ?? "#FFFFFF";
    const tint = spec.tint !== undefined ? String(spec.tint) : undefined;
    const fillGrad = spec.fill === "gradient";
    const mkFill = (ctx: Ctx2D, y0: number, y1: number): string | CanvasGradient => {
      if (!fillGrad) return tint ?? baseFill;
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, tint ?? baseFill);
      g.addColorStop(1, baseFill);
      return g;
    };

    /* ---- offscreen path (feathered mask / row glitch) ---- */
    const rowsI = num(gl?.rows, 0) * gAmt;
    const needOff = (wipeV < 0.999 && featherPx > 0.2) || rowsI > 0.02;
    const sc = Math.max(0.1, lc.getTransform().a || 1);
    const off = needOff
      ? this.buf("chan", Math.round(VW * sc), Math.round(VH * sc))
      : null;
    const target: Ctx2D = off ? off.ctx : lc;
    if (off) {
      target.setTransform(sc, 0, 0, sc, 0, 0);
      target.clearRect(0, 0, VW, VH);
    }
    target.save();
    target.font = `${weight} ${size}px "${family}", sans-serif`;
    target.textBaseline = "middle";

    /* ---- hard-edge wipe clip (feathered masks go through the offscreen) ---- */
    if (wipeV < 0.999 && featherPx <= 0.2) {
      const x0 = anchorX(maxW);
      if (wipeAxis === "y") {
        const h = layout.lines * size * 1.25;
        const yBottom = baseY + h / 2 + size * 0.2;
        target.beginPath();
        target.rect(
          x0 - size,
          yBottom - wipeV * (h + size * 0.4),
          maxW + size * 2,
          wipeV * (h + size * 0.4),
        );
        target.clip();
      } else {
        target.beginPath();
        target.rect(x0 - size * 0.5, baseY - size, wipeV * (maxW + size), size * 2);
        target.clip();
      }
    }

    /* ---- the per-unit pass ---- */
    const drawUnits = (
      ctx: Ctx2D,
      offX: number,
      fillOverride: string | CanvasGradient | null,
      alphaMul: number,
      mainPass: boolean,
    ): void => {
      const extr = mainPass ? num(spec.extrude, 0) : 0;
      const par = mainPass ? num(spec.parallax, 0) : 0;
      for (let i = 0; i < layout.units.length; i++) {
        const u = layout.units[i];
        const amtI = num(stagIn?.amt, 0);
        const rawIn =
          amtI > 0 ? Math.min(1, Math.max(0, (tin - u.f * amtI) / (1 - amtI))) : tin;
        const amtO = num(stagOut?.amt, 0);
        const rawOut =
          amtO > 0 ? Math.min(1, Math.max(0, (tout - u.f * amtO) / (1 - amtO))) : tout;
        const pIn = applyEase(easeIn, rawIn);
        const pOut = hasOut ? applyEase(easeOut, rawOut) : 0;
        const locked = rawIn >= 0.999;
        if (typeGate && !scramOn && !locked) continue;
        if (scramOn && !locked && rawIn <= 0) continue;
        const scr = scramOn && !locked;

        /* channels: an out-phase channel wins when present, else in-rest */
        const chan = (key: string, rest: number): number => {
          if (phaseOut) {
            return chOut[key] !== undefined
              ? lerp(pair(chOut[key], rest)[0], pair(chOut[key], rest)[1], pOut)
              : pair(chIn[key], rest)[1];
          }
          const pr = pair(chIn[key], rest);
          return lerp(pr[0], pr[1], pIn);
        };

        let alpha = chan("alpha", 1) * alphaMul * flickerMul;
        if (scr) alpha = Math.max(alpha, 0.85);
        if (alpha <= 0.004) continue;

        const s = chan("scale", 1) * pulseS;
        let sx = chan("scaleX", s);
        let sy = chan("scaleY", s);
        const rx = (chan("rotX", 0) * Math.PI) / 180;
        const ry = (chan("rotY", 0) * Math.PI) / 180;
        sy *= Math.max(0.06, Math.abs(Math.cos(rx)));
        sx *= Math.max(0.06, Math.abs(Math.cos(ry)));
        const skew = Math.sin(ry) * 0.35;
        const rot = chan("rot", 0);

        let dx = chan("dx", 0) * VW + floatX + marqueeX;
        let dy = chan("dy", 0) * VH + floatY;
        const split = chan("dxSplit", 0);
        if (split !== 0) {
          dx +=
            ((u.x + u.w / 2) / Math.max(1, layout.lineW[u.line]) - 0.5) * 2 * split * VW;
        }
        const bAmt = num(spec.burst, 0) + (phaseOut ? num(outSpec.burst, 0) : 0);
        if (bAmt > 0) {
          const rr = mulberry32(seed + i * 17);
          const k = phaseOut ? pOut : 1 - pIn;
          dx += (rr() - 0.5) * 2 * bAmt * VW * k;
          dy += (rr() - 0.5) * 2 * bAmt * VW * 0.7 * k;
        }
        const wv = (spec.wave ?? undefined) as
          | { amp?: number; freq?: number; speed?: number }
          | undefined;
        if (wv) {
          dy +=
            Math.sin(
              ((u.x + u.w / 2) / size) * num(wv.freq, 3) +
                (t - e.t) * num(wv.speed, 1.4) * Math.PI * 2,
            ) * num(wv.amp, 0.2) * size;
        }
        const mo = num(spec.morph, 0) * (1 - pIn);
        let blurPx = chan("blur", 0) * size;
        if (mo > 0) {
          sx *= 1 + mo * 0.6;
          sy *= 1 + mo * 0.6;
          blurPx += mo * size * 0.05;
          alpha *= 1 - mo * 0.35;
        }

        /* path placement overrides the box position */
        let px = anchorX(layout.lineW[u.line]) + u.x;
        if (path) {
          const lw = Math.max(1, layout.lineW[u.line]);
          const u01 = (u.x + u.w / 2) / lw;
          if (String(path.shape ?? "arc") === "arc") {
            const bend = num(path.bend, 1);
            const R = lw / Math.max(0.2, bend);
            const ang = (u01 - 0.5) * bend;
            px = anchorX(lw) + lw / 2 + Math.sin(ang) * R - u.w / 2;
            dy += (1 - Math.cos(ang)) * R * 0.45 - size * 0.3;
          } else {
            const amp = num(path.amp, 0.3) * size;
            const ph =
              u01 * Math.PI * 2 * num(path.freq, 1.2) +
              (t - e.t) * num(path.speed, 0.5) * Math.PI * 2;
            dy += Math.sin(ph) * amp;
          }
        }
        const py = lineY(u.line) + dy;

        const glyph = scr
          ? scrambleUnit(u.text, seed + i * 101 + tick * 13, rawIn)
          : u.text;
        if (!glyph) continue;

        const draw = (
          ddx: number,
          ddy: number,
          fill: string | CanvasGradient | null,
          aMul: number,
        ) => {
          ctx.save();
          if (blurPx > 0.15) ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
          ctx.globalAlpha = Math.max(0, Math.min(1, alpha * aMul));
          ctx.translate(px + offX + ddx + u.w / 2 + dx, py + ddy);
          ctx.rotate((rot * Math.PI) / 180);
          ctx.transform(sx, 0, skew, sy, 0, 0);
          ctx.fillStyle = fill ?? mkFill(ctx, py - size * 0.6, py + size * 0.6);
          if (style.stroke) {
            ctx.lineWidth = size * 0.12;
            ctx.strokeStyle = style.stroke;
            ctx.lineJoin = "round";
            ctx.strokeText(glyph, -u.w / 2, 0);
          }
          ctx.fillText(glyph, -u.w / 2, 0);
          ctx.restore();
        };

        /* depth: parallax ghosts behind, extruded stack behind-right */
        for (let gI = 1; gI <= par; gI++) {
          const gp = 1 - Math.min(1, pIn);
          draw(-gI * size * (0.1 + gp * 0.12), -gI * size * 0.04 * gp, null, 0.16);
        }
        for (let gI = 1; gI <= extr; gI++) {
          draw(gI * size * 0.02, gI * size * 0.028, "rgba(0,0,0,0.5)", 1);
        }
        draw(0, 0, fillOverride, 1);
      }
    };

    /* main + marquee wrap + RGB split passes */
    drawUnits(target, 0, null, 1, true);
    if (mq) drawUnits(target, marqueeSpan, null, 1, false);
    const rgbI = num(gl?.rgb, 0) * gAmt;
    if (rgbI > 0.02) {
      const o = rgbI * (size * 0.09 + 2);
      target.save();
      target.globalCompositeOperation = "lighter";
      drawUnits(target, -o, "rgba(255,40,90,0.5)", rgbI, false);
      drawUnits(target, o, "rgba(60,220,255,0.5)", rgbI, false);
      target.restore();
    }

    /* shimmer: a looping highlight sweep across the units */
    const sh = num(spec.shimmer, 0) * (phaseOut ? 1 - tout : 1);
    if (sh > 0.02) {
      const cyc = ((t - e.t) / 2.6) % 1;
      const hx = anchorX(maxW) - size + cyc * (maxW + size * 2);
      target.save();
      target.globalCompositeOperation = "lighter";
      const g = target.createLinearGradient(hx - size, 0, hx + size, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, `rgba(255,255,255,${(0.7 * sh).toFixed(3)})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      drawUnits(target, 0, g, 1, false);
      target.restore();
    }

    /* feathered wipe mask (destination-in gradient on the offscreen) */
    if (off && wipeV < 0.999) {
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.globalCompositeOperation = "destination-in";
      const mask = target.createLinearGradient(
        wipeAxis === "y" ? 0 : (anchorX(maxW) - size * 0.5) * sc,
        wipeAxis === "y" ? (baseY + (layout.lines * size * 1.25) / 2 + size * 0.2) * sc : 0,
        wipeAxis === "y" ? 0 : (anchorX(maxW) - size * 0.5 + wipeV * (maxW + size) + featherPx) * sc,
        wipeAxis === "y"
          ? (baseY + (layout.lines * size * 1.25) / 2 + size * 0.2 - wipeV * (layout.lines * size * 1.25 + size * 0.4) - featherPx) * sc
          : 0,
      );
      const span =
        wipeAxis === "y"
          ? wipeV * (layout.lines * size * 1.25 + size * 0.4) * sc
          : wipeV * (maxW + size) * sc;
      const solid = featherPx > 0.01 ? Math.min(0.999, span / Math.max(1, span + featherPx * sc)) : 1;
      mask.addColorStop(0, "rgba(0,0,0,1)");
      mask.addColorStop(solid, "rgba(0,0,0,1)");
      mask.addColorStop(1, "rgba(0,0,0,0)");
      target.fillStyle = mask;
      target.fillRect(0, 0, off.canvas.width, off.canvas.height);
      target.globalCompositeOperation = "source-over";
    }
    target.restore();

    /* blit (band-shifted when row glitch is active) */
    if (off) {
      if (rowsI > 0.02) {
        const bands = 6;
        for (let b = 0; b < bands; b++) {
          const yy = (b / bands) * VH;
          const hh = VH / bands;
          const jx = (mulberry32(seed + b * 97 + tick * 7)() - 0.5) * 2 * rowsI * VW * 0.03;
          lc.drawImage(off.canvas, 0, yy * sc, off.canvas.width, hh * sc, jx, yy, VW, hh);
        }
      } else {
        lc.drawImage(off.canvas, 0, 0, VW, VH);
      }
    }

    /* scanlines over the text block */
    const scanI = num(gl?.scan, 0) * gAmt;
    if (scanI > 0.02) {
      const x0 = anchorX(maxW);
      const h = layout.lines * size * 1.25 + size * 0.3;
      lc.save();
      lc.fillStyle = `rgba(0,0,0,${(0.35 * scanI).toFixed(3)})`;
      const step = Math.max(3, size * 0.38);
      for (let yy = baseY - h / 2; yy < baseY + h / 2; yy += step) {
        lc.fillRect(x0 - size * 0.5, yy, maxW + size, step * 0.32);
      }
      lc.restore();
    }
    lc.restore();
  }
}
