/**
 * Pure easing functions — shared by preview and export so motion is identical.
 * Named ids only appear in schedules; the actual math lives here (Rule 2).
 */

export type EasingName =
  | "linear"
  | "out"
  | "in"
  | "inOut"
  | "overshoot"
  | "pulse"
  | "bounce"
  | "elastic";

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function easeLinear(x: number): number {
  return clamp01(x);
}

export function easeOut(x: number): number {
  x = clamp01(x);
  return 1 - Math.pow(1 - x, 3);
}

export function easeIn(x: number): number {
  x = clamp01(x);
  return x * x * x;
}

export function easeInOut(x: number): number {
  x = clamp01(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Slight overshoot then settle — the "natural bounce" from the brief. */
export function easeOvershoot(x: number): number {
  x = clamp01(x);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/** Continuous 0..1 oscillation for looping behaviors (pulse). */
export function easePulse(x: number): number {
  return (Math.sin(x * Math.PI * 2 - Math.PI / 2) + 1) / 2;
}

/** Gravity bounce — word bounce, gravity drop (D43 kinetic). */
export function easeBounce(x: number): number {
  x = clamp01(x);
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

/** Springy elastic settle — elastic entrances (D43 kinetic). */
export function easeElastic(x: number): number {
  x = clamp01(x);
  if (x === 0 || x === 1) return x;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
}

const EASINGS: Record<EasingName, (x: number) => number> = {
  linear: easeLinear,
  out: easeOut,
  in: easeIn,
  inOut: easeInOut,
  overshoot: easeOvershoot,
  pulse: easePulse,
  bounce: easeBounce,
  elastic: easeElastic,
};

export function applyEase(name: string, x: number): number {
  const fn = EASINGS[name as EasingName];
  return fn ? fn(x) : easeLinear(x);
}

/** Deterministic pseudo-random in [0,1) — no Math.random anywhere (parity!). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
