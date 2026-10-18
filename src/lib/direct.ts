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
 * the page): effect/transition sounds use SOUND_AUTO, soundCut "none" —
 * the director never sets "none" on cuts: cuts always get a random SFX */
const SOUND_AUTO = "auto";

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

/** A random SFX per slot from the right catalog category. */
export function directSounds<
  T extends {
    effect: string;
    soundCut: string;
    soundEffect: string;
    soundTransition: string;
  },
>(slots: readonly T[], opts?: DirectOpts): T[] {
  return slots.map((s, i) => {
    if (!inScope(opts?.only, i)) return s;
    return {
      ...s,
      soundCut: pick(CUT_SFX),
      soundTransition: pick(TRANS_SFX),
      // no effect → nothing to override: stay on the honest default
      soundEffect: s.effect === "none" ? SOUND_AUTO : pick(FX_SFX),
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
