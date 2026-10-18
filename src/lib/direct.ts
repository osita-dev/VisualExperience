/**
 * AUTO-DIRECT — the director. The system assembles the edit; the user
 * shuffles it. Pure and dependency-free: every function takes plain draft
 * data and returns NEW data (nothing is mutated), so each call can sit in
 * exactly one undo step.
 *
 * The rules as aligned:
 *   durations   — photos: punchy 1–3s on the 0.5s grid. Videos: a 3–5s
 *                 window starting at a RANDOM point inside the clip (the
 *                 start is STORED as the slot trim, so preview ≡ export
 *                 stays honest); a clip shorter than its window plays in
 *                 full. Everything keeps the 1s floor and clamps into
 *                 MAX_TOTAL_SEC. Random WITHIN sensible ranges — no fake
 *                 intelligence yet ("the system learns what deserves more
 *                 seconds" is a later conversation).
 *   look        — a random light filter per slot (often inheriting the
 *                 template look; occasionally raw/off).
 *   motion      — a random motion/effect preset + video animation, with an
 *                 honest chance of "none" so it never gets dizzy.
 *   transitions — a varied transition on every cut (never the same cut N
 *                 times in a row).
 *   sounds      — a random SFX per slot from the RIGHT catalog category
 *                 (cut → Cuts, transition → Transitions, effect →
 *                 Cinematic): "random just as filter", per the user. A slot
 *                 with no effect keeps its effect sound on "auto".
 *   texts       — random entrance + (often) exit animation; their reveal
 *                 sounds are left alone.
 *   MUSIC IS NEVER TOUCHED — it stays the user's choice, always.
 *
 * Randomness happens HERE, once, on button press — the result is plain
 * data that renders deterministically afterwards (preview ≡ export).
 */

import { MAX_TOTAL_SEC, MIN_SLOT_SEC, presetKey } from "@/core/model/types";
import { SFX_LIBRARY } from "@/core/audio/sfxCatalog";
import {
  EFFECTS,
  FILTER_PRESETS,
  MOTIONS,
  TEXT_PRESETS,
  TRANSITIONS,
  VANIM_PRESETS,
} from "@/presets/data";
import { TEXT_EXITS } from "@/presets/textCatalog";

/* the builder's SlotDraft sentinels, mirrored here (lib must not import
 * the page): effect/transition sounds use SOUND_AUTO, soundCut "none".
 * The director now SPARES sound — it sets "none" on the cuts it leaves
 * quiet, so a slot only sounds off where the moment earned it. */
const SOUND_AUTO = "auto";
const SOUND_OFF = "none";

/** How many cut/transition/effect SFX the director will place in a whole
 *  edit (D58). An SFX on every cut is noise; a few spaced hits read as
 *  deliberate. Slot 0 has no cut of its own, so it never takes a hit. */
export const SFX_MAX = 3;
/** two hits closer than this many slots read as a flurry, not accents */
const SFX_MIN_GAP = 1;

/* ------------------------------------------------------------------ *
 * pools — every value below is a legal pick for its field (V8 clean)
 * ------------------------------------------------------------------ */

const EFFECT_POOL = [...MOTIONS, ...EFFECTS].map((p) =>
  presetKey(p.id, p.version),
);
const SEAM_POOL = TRANSITIONS.map((p) => presetKey(p.id, p.version));
const VANIM_POOL = VANIM_PRESETS.map((p) => presetKey(p.id, p.version));
const FILTER_POOL = FILTER_PRESETS.map((p) => p.id); // ids are plain (D45)
const ENTRANCE_POOL = TEXT_PRESETS.filter((p) => p.tags[0] !== "exit").map(
  (p) => presetKey(p.id, p.version),
);
const EXIT_POOL = TEXT_EXITS.map((p) => presetKey(p.id, p.version));
const CUT_SFX = SFX_LIBRARY.filter((d) => d.category === "cuts").map(
  (d) => d.id,
);
const TRANS_SFX = SFX_LIBRARY.filter((d) => d.category === "transitions").map(
  (d) => d.id,
);
const FX_SFX = SFX_LIBRARY.filter((d) => d.category === "cinematic").map(
  (d) => d.id,
);

/* ------------------------------------------------------------------ *
 * bounds — computed UI + tests read these, never literals
 * ------------------------------------------------------------------ */

export const PHOTO_SEC_MIN = 1;
export const PHOTO_SEC_MAX = 3;
export const VIDEO_SEC_MIN = 3;
export const VIDEO_SEC_MAX = 5;
const GRID = 0.5;

/* timing family — how the director picks slot lengths */
export const UNIFORM_SEC = 2; // "fixed duration": every cut the same
export const RAMP_START_SEC = 3; // "stagger": cuts tighten toward the end
export const RAMP_END_SEC = 1;

/** The director's timing mode. Beat sync carries the song's locally
 *  detected grid (see lib/beat.ts); it never touches the template —
 *  durations are still stored as plain seconds. */
export type Pacing =
  | { kind: "random" }
  | { kind: "uniform" }
  | { kind: "ramp" }
  | { kind: "beats"; bpm: number; phase: number; songStart: number };

/** What the director needs to know about a slot's media. */
export interface MediaInfo {
  isVideo: boolean;
  duration: number;
}

/** The SlotDraft fields the director writes (structurally compatible). */
export interface SlotDressing {
  dur: number;
  effect: string;
  vanim: string;
  filterSel: string;
  filterAmount: number;
  transitionIn: string;
  soundCut: string;
  soundEffect: string;
  soundTransition: string;
}

export interface DirectOpts {
  /** indices to touch — a bulk upload dresses only the slots it just
   *  filled, leaving the user's own tuning alone */
  only?: readonly number[];
  /** timing mode (default random) — fixed, stagger, or beat-synced */
  pacing?: Pacing;
}

const inScope = (only: readonly number[] | undefined, i: number): boolean =>
  !only || only.includes(i);

const rndInt = (n: number): number => Math.floor(Math.random() * n);
const pick = <T>(arr: readonly T[]): T => arr[rndInt(arr.length)];
/** random on a grid: stepRnd(1, 3, 0.5) → 1, 1.5 … 3 */
const stepRnd = (min: number, max: number, step: number): number =>
  min + rndInt(Math.round((max - min) / step) + 1) * step;

/* ------------------------------------------------------------------ *
 * durations — punchy photos, video windows at a random stored start
 * ------------------------------------------------------------------ */

/**
 * Assign durations (and the matching stored trims) per media kind.
 * Empty slots keep their length; unscoped slots are untouched. The chain
 * is then clamped into MAX_TOTAL_SEC by shrinking the longest slots
 * toward the 1s floor.
 *
 * `trims[i] === null` means "leave this slot's trim as it was".
 */
export function directDurations<T extends { dur: number }>(
  slots: readonly T[],
  media: readonly (MediaInfo | undefined)[],
  opts?: DirectOpts,
): { slots: T[]; trims: (number | null)[] } {
  const pacing = opts?.pacing ?? { kind: "random" as const };

  /* beat grid, in VIDEO time: beats at phase − songStart + k·beatSec */
  let beatSec = 0;
  let beats: number[] = []; // whole-beat candidates that clear the 1s floor
  let firstBeat = 0; // first beat at/after t=0 (slot 0 absorbs this)
  if (pacing.kind === "beats") {
    beatSec = 60 / pacing.bpm;
    beats = [1, 2, 4]
      .map((k) => k * beatSec)
      .filter((d) => d >= MIN_SLOT_SEC - 1e-9);
    /* a blazing song can push every candidate under the floor — fall
     * back to the smallest whole-beat length that clears it */
    if (!beats.length) beats = [Math.ceil(MIN_SLOT_SEC / beatSec) * beatSec];
    const start = pacing.phase - pacing.songStart;
    firstBeat = start + Math.ceil(-start / beatSec) * beatSec;
    if (firstBeat < 0) firstBeat += beatSec; // float dust
  }

  /** the length this slot WANTS under the active pacing */
  const target = (i: number, m: MediaInfo): number => {
    if (pacing.kind === "uniform") return UNIFORM_SEC;
    if (pacing.kind === "ramp") {
      const t = slots.length <= 1 ? 0 : i / (slots.length - 1);
      return (
        Math.round((RAMP_START_SEC + (RAMP_END_SEC - RAMP_START_SEC) * t) * 10) /
        10
      );
    }
    if (pacing.kind === "beats") return pick(beats);
    return m.isVideo
      ? stepRnd(VIDEO_SEC_MIN, VIDEO_SEC_MAX, GRID)
      : stepRnd(PHOTO_SEC_MIN, PHOTO_SEC_MAX, GRID);
  };

  const trims: (number | null)[] = slots.map(() => null);
  const out = slots.map((s, i) => {
    if (!inScope(opts?.only, i)) return s;
    const m = media[i];
    if (!m) return s; // nothing uploaded — keep the manual length
    let want = target(i, m);
    /* beat sync: slot 0 absorbs the offset to the first beat, so every
       LATER cut lands ON a beat (as long as every length stays whole) */
    if (pacing.kind === "beats" && i === 0 && firstBeat > 1e-4)
      want += firstBeat;
    if (!m.isVideo) {
      // photos: take the pacing's length, starting at 0
      trims[i] = 0;
      return { ...s, dur: want };
    }
    // videos: the pacing's window clamped to the clip (a shorter clip
    // plays in full — honest, we never invent frames) at a random spot
    const dur = Math.max(MIN_SLOT_SEC, Math.min(want, m.duration));
    const rest = Math.max(0, m.duration - dur);
    trims[i] = Math.round(Math.random() * rest * 10) / 10; // 0.1s grid
    return { ...s, dur };
  });
  return { slots: clampTotal(out, opts?.only), trims };
}

/** Shrink slots toward the 1s floor until the chain fits the budget.
 *  Scoped runs shrink ONLY their own slots (a batch can never touch the
 *  user's tuning — its own assignments always have room to give back);
 *  unscoped runs may shrink anything. If everything is at the floor the
 *  chain is left for V12 to report honestly. */
function clampTotal<T extends { dur: number }>(
  slots: T[],
  only?: readonly number[],
): T[] {
  const out = [...slots];
  const shrinkable = (i: number): boolean => out[i].dur > MIN_SLOT_SEC;
  const mine = (i: number): boolean => !only || only.includes(i);
  let total = out.reduce((a, s) => a + s.dur, 0);
  for (;;) {
    const excess = total - MAX_TOTAL_SEC;
    if (excess <= 1e-9) return out;
    let idx = -1;
    for (let i = 0; i < out.length; i++)
      if (mine(i) && shrinkable(i) && (idx === -1 || out[i].dur > out[idx].dur))
        idx = i;
    if (idx === -1) {
      /* nothing of ours left to shrink — only then, defensively, fall
       * back to any shrinkable slot (V12 still guards the end state) */
      for (let i = 0; i < out.length; i++)
        if (shrinkable(i) && (idx === -1 || out[i].dur > out[idx].dur)) idx = i;
      if (idx === -1) return out;
    }
    const take = Math.min(excess, out[idx].dur - MIN_SLOT_SEC);
    const dur = Math.round((out[idx].dur - take) * 10) / 10;
    total -= out[idx].dur - dur;
    out[idx] = { ...out[idx], dur };
  }
}

/* ------------------------------------------------------------------ *
 * the dressing — look, motion, transitions, sounds, texts
 * ------------------------------------------------------------------ */

/** A random light filter per slot: usually inherited, sometimes raw. */
export function directLook<
  T extends { filterSel: string; filterAmount: number },
>(slots: readonly T[], opts?: DirectOpts): T[] {
  return slots.map((s, i) => {
    if (!inScope(opts?.only, i)) return s;
    const roll = Math.random();
    if (roll < 0.35) return { ...s, filterSel: "template" };
    if (roll < 0.45) return { ...s, filterSel: "off" };
    return {
      ...s,
      filterSel: pick(FILTER_POOL),
      filterAmount: stepRnd(6, 10, 1) / 10, // 0.6–1.0
    };
  });
}

/** A random motion/effect + video animation, with an honest "none" roll. */
export function directMotion<
  T extends { effect: string; vanim: string },
>(slots: readonly T[], opts?: DirectOpts): T[] {
  return slots.map((s, i) => {
    if (!inScope(opts?.only, i)) return s;
    const effect = Math.random() < 0.3 ? "none" : pick(EFFECT_POOL);
    const vanim = Math.random() < 0.3 ? "none" : pick(VANIM_POOL);
    return { ...s, effect, vanim };
  });
}

/** A transition on every cut — and never the same one all the way down. */
export function directTransitions<
  T extends { transitionIn: string },
>(slots: readonly T[], opts?: DirectOpts): T[] {
  const out = slots.map((s, i) =>
    inScope(opts?.only, i) ? { ...s, transitionIn: pick(SEAM_POOL) } : s,
  );
  /* variety guard: if every seam landed on the same preset, flip the
   * middle seam so a re-roll can never produce twenty identical cuts */
  const seams = out
    .map((_, i) => (i > 0 && inScope(opts?.only, i) ? i : -1))
    .filter((i) => i >= 0);
  if (seams.length >= 2) {
    const first = out[seams[0]].transitionIn;
    if (seams.every((i) => out[i].transitionIn === first)) {
      const mid = seams[Math.floor(seams.length / 2)];
      const alt = SEAM_POOL.find((k) => k !== first) ?? first;
      out[mid] = { ...out[mid], transitionIn: alt };
    }
  }
  return out;
}

/**
 * The few slots that EARN an SFX this pass (D58). At most `cap` of them,
 * never two neighbours (a flurry), and slot 0 is skipped — it has no cut
 * of its own. Random, but decided here once and then stored, so the
 * preview and the export always agree.
 */
function sfxSpots(count: number, cap = SFX_MAX, skipFirst = true): Set<number> {
  const first = skipFirst ? 1 : 0;
  const eligible: number[] = [];
  for (let i = first; i < count; i++) eligible.push(i);
  const shuffled = shuffledIndices(eligible.length);
  const chosen = new Set<number>();
  for (const idx of shuffled) {
    if (chosen.size >= cap) break;
    const slot = eligible[idx];
    /* never land right next to a hit we already placed */
    let tooClose = false;
    for (const placed of chosen)
      if (Math.abs(placed - slot) <= SFX_MIN_GAP) tooClose = true;
    if (!tooClose) chosen.add(slot);
  }
  return chosen;
}

/**
 * A few strong SFX across the edit, not one on every cut (D58). Cut,
 * transition and effect sounds each pick their OWN moments, so they can
 * line up or stagger on their own — but each is limited to `cap` hits.
 * Slots left quiet get the honest "none" sentinel.
 */
export function directSounds<
  T extends {
    effect: string;
    soundCut: string;
    soundEffect: string;
    soundTransition: string;
  },
>(slots: readonly T[], opts?: DirectOpts): T[] {
  const scoped = new Set(
    slots.map((_, i) => i).filter((i) => inScope(opts?.only, i)),
  );
  /* one chooser per sound kind — moments are picked independently */
  const cutSpots = sfxSpots(slots.length);
  const transSpots = sfxSpots(slots.length);
  const fxSpots = sfxSpots(slots.length);
  return slots.map((s, i) => {
    /* out of scope (bulk dress): untouched, keep whatever it had */
    if (!scoped.has(i)) return s;
    /* no effect → nothing to override: stay on the honest default */
    const fxable = s.effect !== "none";
    return {
      ...s,
      soundCut: cutSpots.has(i) ? pick(CUT_SFX) : SOUND_OFF,
      soundTransition: transSpots.has(i) ? pick(TRANS_SFX) : SOUND_OFF,
      soundEffect: !fxable
        ? SOUND_AUTO
        : fxSpots.has(i)
          ? pick(FX_SFX)
          : SOUND_AUTO,
    };
  });
}

/** Random text animations: a new entrance always, an exit half the time
 *  ("" = hold). Reveal sounds are left alone. */
export function directTexts<T extends { anim: string; outAnim: string }>(
  texts: readonly T[],
): T[] {
  return texts.map((t) => ({
    ...t,
    anim: pick(ENTRANCE_POOL),
    outAnim: Math.random() < 0.5 ? "" : pick(EXIT_POOL),
  }));
}

/* ------------------------------------------------------------------ *
 * text placement (D57) — where each text SITS on the 9:16 frame
 * ------------------------------------------------------------------ */

/** A text's placement shape, in canvas fractions (0..1). */
export interface TextShape {
  /** horizontal centre 0..1 */
  x: number;
  /** vertical centre 0..1 */
  y: number;
  /** half-width of the text's box, as a fraction of canvas WIDTH */
  w: number;
  /** half-height of the text's box, as a fraction of canvas HEIGHT */
  h: number;
  /** when the text is on screen, absolute seconds */
  start: number;
  /** how long it stays, seconds */
  dur: number;
}

/* designed good spots (x, y) on a 9:16 frame — thirds, bands and
 * corners. Spread apart so a scatter reads as composed, not spilled. */
/* Designed good spots on a 9:16 frame, grouped into MIXES. A single flat
 * list can't vary: with 2 texts on screen, a lone "middle" band blocks
 * every same-height side spot, so every roll landed on the same two
 * positions. Instead each roll picks ONE shape (a vertical band, or a
 * center/side, left/right or 2-column arrangement) and fills it. Shape
 * now changes visibly between rolls, like transitions/motion do. */
const SPOT_BANDS = {
  top: [0.16],
  upper: [0.32],
  middle: [0.5],
  lower: [0.68],
  bottom: [0.84],
} as const;
type BandKey = keyof typeof SPOT_BANDS;
const BAND_KEYS = Object.keys(SPOT_BANDS) as BandKey[];

/* one text, dropped into a named vertical band */
const SOLO: readonly [number, number][] = BAND_KEYS.map((k) => [
  0.5,
  SPOT_BANDS[k][0],
]);

/* two texts side by side, in a chosen band */
const SIDE_BY_SIDE: readonly (readonly [number, number])[] = BAND_KEYS.flatMap(
  (k): (readonly [number, number])[] => [
    [0.28, SPOT_BANDS[k][0]],
    [0.72, SPOT_BANDS[k][0]],
    [0.3, SPOT_BANDS[k][0]],
    [0.7, SPOT_BANDS[k][0]],
  ],
);

/* center above side, or a loose diagonal */
const CENTER_THEN_SIDE: readonly (readonly [number, number])[] = [
  [0.5, 0.34],
  [0.28, 0.66],
  [0.5, 0.34],
  [0.72, 0.66],
  [0.3, 0.28],
  [0.7, 0.72],
  [0.7, 0.28],
  [0.3, 0.72],
];

/* nothing may sit in these slivers: the top ~6% and bottom ~8% are
 * where 9:16 apps draw their own chrome, so text there gets covered */
const SAFE_TOP = 0.07;
const SAFE_BOTTOM = 0.92;
const SAFE_SIDE = 0.04;
/* two texts closer than this (in box terms) read as stacked */
const OVERLAP_PAD = 0.02;

/** Honest overlap test between two placed boxes (both centre-anchored,
 *  half-extents). True when they'd visually collide. */
export function textBoxesClash(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    Math.abs(a.x - b.x) < a.w + b.w + OVERLAP_PAD &&
    Math.abs(a.y - b.y) < a.h + b.h + OVERLAP_PAD
  );
}

/** Is this box clear of the safe slivers and inside the frame? */
function boxInSafeArea(b: {
  x: number;
  y: number;
  w: number;
  h: number;
}): boolean {
  return (
    b.x - b.w >= SAFE_SIDE &&
    b.x + b.w <= 1 - SAFE_SIDE &&
    b.y - b.h >= SAFE_TOP &&
    b.y + b.h <= SAFE_BOTTOM
  );
}

/**
 * Place texts across the frame by rolling a SHAPE each time, so the
 * arrangement visibly changes between rolls instead of collapsing onto
 * the same two spots. Texts ON SCREEN AT THE SAME TIME can never clash;
 * the biggest/longest texts go first so nothing is pushed off-frame.
 *
 * The roll is random but decided once and stored by the caller, so
 * preview ≡ export.
 *
 * Returns one {x, y} per input text, in input order.
 */
export function placeTexts(
  texts: readonly TextShape[],
): { x: number; y: number }[] {
  /* biggest box first; tie-break on the earlier text */
  const order = texts.map((_, i) => i).sort((a, b) => {
    const area = (i: number) => texts[i].w * texts[i].h;
    return area(b) - area(a) || a - b;
  });

  /* one shape for the whole arrangement, rolled fresh each call */
  const kind = pick(["solo", "side", "stagger"] as const);
  const band = SPOT_BANDS[pick(BAND_KEYS)];

  /* the shape's candidate rows, in the rolled band */
  const rows: readonly [number, number][] =
    kind === "side"
      ? ([
          [0.28, band[0]],
          [0.72, band[0]],
        ] as const)
      : kind === "stagger"
        ? ([
            [0.5, band[0]],
            [0.28, Math.min(0.84, band[0] + 0.2)],
            [0.72, band[0]],
            [0.5, Math.max(0.16, band[0] - 0.2)],
          ] as const)
        : ([
            [0.5, band[0]],
            [0.5, band[0]],
            [0.5, band[0]],
            [0.5, band[0]],
          ] as const);

  const placed: ({ x: number; y: number } | null)[] = texts.map(() => null);
  /* for each text, the spots already taken while it is on screen */
  const busyFor = texts.map(
    () => [] as { x: number; y: number; w: number; h: number }[],
  );

  for (const i of order) {
    const t = texts[i];
    /* the shape's rows first, then every other band as an honest
     * fallback so a big text never falls back to its stale spot */
    const cand: { x: number; y: number }[] = [
      ...rows.map(([x, y]) => ({ x, y })),
      ...SOLO.map(([x, y]) => ({ x, y })),
      ...SIDE_BY_SIDE.map(([x, y]) => ({ x, y })),
      ...CENTER_THEN_SIDE.map(([x, y]) => ({ x, y })),
    ];

    let chosen: { x: number; y: number } | null = null;
    for (const spot of cand) {
      const b = { x: spot.x, y: spot.y, w: t.w, h: t.h };
      if (!boxInSafeArea(b)) continue; // this spot can't hold a box this size
      if (busyFor[i].some((o) => textBoxesClash(b, o))) continue;
      chosen = { x: spot.x, y: spot.y };
      break;
    }

    /* every spot clashed or was too small — keep the text's own spot
     * rather than hide it or shove it off-frame (honest) */
    if (!chosen) chosen = { x: t.x, y: t.y };
    placed[i] = chosen;

    /* reserve this box against every text visible at the same time */
    const b = { x: chosen.x, y: chosen.y, w: t.w, h: t.h };
    for (let j = 0; j < texts.length; j++) {
      if (j === i) continue;
      const o = texts[j];
      const sameTime = t.start < o.start + o.dur && o.start < t.start + t.dur;
      if (sameTime) busyFor[j].push(b);
    }
  }

  return placed.map((p) => p ?? { x: 0.5, y: 0.5 });
}

/** Honest placeholder copy for an ADDED text — the creator replaces it
 *  with their own words (same as a template's `default` today). These
 *  are prompts, never presented as the finished line. */
const PLACEHOLDER_COPY = [
  "YOUR TITLE",
  "ADD A LINE",
  "ONE MORE THING",
  "WATCH THIS",
  "WAIT FOR IT",
  "NO WAY",
];

/** Cap on texts the director will add per template (D57). */
export const TEXT_TARGET_MAX = 4;

/**
 * Make sure a template has enough texts to scatter (up to
 * `target`, capped at TEXT_TARGET_MAX): existing texts are re-placed;
 * missing ones are ADDED with placeholder copy and a spread start time.
 *
 * `existing` supplies the placement shape for texts already present;
 * each added text inherits the shape of the text it was counted against
 * (so a template with one big title still gets a fitting second line).
 *
 * We can't invent `T`'s other fields, so the caller passes a `make`
 * factory that fills them in (look, weight, animation…); we hand it the
 * placeholder copy and the start/dur we chose.
 */
export function directTextPlacement<
  T extends { start: number; dur: number; value?: string },
>(
  existing: readonly (T & TextShape)[],
  totalSec: number,
  make: (seed: { start: number; dur: number; value: string }) => T,
  target = TEXT_TARGET_MAX,
): {
  texts: T[];
  /** index → {x, y} for every returned text (existing + added) */
  placed: { x: number; y: number }[];
} {
  const want = Math.max(1, Math.min(target, TEXT_TARGET_MAX));
  const out: T[] = existing.map((t) => ({ ...t }));
  /* the shape each out[i] sits in — existing keep theirs; an added text
   * echoes the text it was counted against, a touch smaller */
  const shapes: TextShape[] = existing.map((s) => ({
    x: s.x,
    y: s.y,
    w: s.w,
    h: s.h,
    start: s.start,
    dur: s.dur,
  }));

  const pool = shuffledIndices(PLACEHOLDER_COPY.length);
  let next = 0;
  /* add missing texts, spreading their starts across the video */
  while (out.length < want) {
    const k = out.length;
    const start = Math.round(((totalSec * k) / want / 0.5)) * 0.5;
    const dur = Math.max(0.5, Math.min(2.5, totalSec - start));
    /* echo a text that already exists, or a plain default if there
     * were none to begin with (a template can start with zero texts) */
    const src = shapes.length
      ? shapes[Math.floor(k / 2) % shapes.length]
      : { x: 0.5, y: 0.5, w: 0.3, h: 0.05 };
    /* a fresh line sits a touch smaller than the text it echoes, so a
     * scatter never out-shouts the title it sits beside */
    shapes.push({
      x: src.x,
      y: src.y,
      w: src.w * 0.8,
      h: src.h * 0.8,
      start,
      dur,
    });
    out.push(make({ start, dur, value: PLACEHOLDER_COPY[pool[next++ % pool.length]] }));
  }

  const placed = placeTexts(shapes);
  const texts = out.map((t, i) => ({
    ...t,
    x: placed[i].x,
    y: placed[i].y,
  }));
  return { texts, placed };
}

/* ------------------------------------------------------------------ *
 * the full pass + the order shuffle
 * ------------------------------------------------------------------ */

/** Everything at once: durations (with stored trims) + look + motion +
 *  transitions + sounds. Music is untouched, texts are separate. */
export function directAll<T extends SlotDressing>(
  slots: readonly T[],
  media: readonly (MediaInfo | undefined)[],
  opts?: DirectOpts,
): { slots: T[]; trims: (number | null)[] } {
  const dur = directDurations(slots, media, opts);
  return {
    slots: directSounds(
      directTransitions(
        directMotion(directLook(dur.slots, opts), opts),
        opts,
      ),
      opts,
    ),
    trims: dur.trims,
  };
}

/** Fisher–Yates permutation of 0..n-1 — the "shuffle order" roll. */
export function shuffledIndices(n: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = rndInt(i + 1);
    const tmp = idx[i];
    idx[i] = idx[j];
    idx[j] = tmp;
  }
  return idx;
}
