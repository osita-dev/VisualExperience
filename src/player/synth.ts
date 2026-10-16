/**
 * Procedural audio synthesis — SFX and music are GENERATED in the browser
 * (no binary assets ship with the project, no licensing exposure: D8/D9/D17).
 * All synthesis is deterministic (seeded PRNG) so preview ≡ export.
 */

import { mulberry32 } from "@/core/resolve/easing";
import type { ToneDef } from "@/core/audio/tones";

/* ---------------- low-level helpers ---------------- */

function makeBuffer(ctx: BaseAudioContext, seconds: number, channels = 1): AudioBuffer {
  const sr = ctx.sampleRate;
  return ctx.createBuffer(channels, Math.max(1, Math.round(seconds * sr)), sr);
}

/** Soft-clip so nothing ever hits digital harshness. */
function sat(x: number): number {
  return Math.tanh(x);
}

function normalize(data: Float32Array, target = 0.85): void {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  if (max > target && max > 0) {
    const g = target / max;
    for (let i = 0; i < data.length; i++) data[i] *= g;
  }
}

/* ---------------- SFX ---------------- */

function sfxWhoosh(ctx: BaseAudioContext, seconds: number, reverse: boolean): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const rnd = mulberry32(reverse ? 424242 : 1337);
  let lp = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const pos = reverse ? x : 1 - Math.abs(2 * x - 1); // ramp up vs bell
    const bell = reverse ? x : Math.sin(Math.PI * Math.min(1, Math.max(0, pos)));
    const noise = rnd() * 2 - 1;
    const cut = reverse ? 0.04 + 0.45 * x : 0.05 + 0.5 * Math.pow(bell, 1.4);
    lp += cut * (noise - lp);
    const env = reverse ? Math.pow(x, 2.2) : Math.pow(bell, 1.2);
    let v = lp * env * 1.7;
    if (reverse && x > 0.97) v *= (1 - x) / 0.03; // abrupt cut = swell into the beat
    out[i] = sat(v * 0.8);
  }
  normalize(out);
  return buf;
}

function sfxHit(ctx: BaseAudioContext, f0: number, f1: number, seconds: number): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const sr = ctx.sampleRate;
  const out = buf.getChannelData(0);
  const rnd = mulberry32(99);
  let ph = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const f = f0 * Math.pow(f1 / f0, x);
    ph += (2 * Math.PI * f) / sr;
    const env = Math.exp(-x * 5.5);
    let v = Math.sin(ph) * env * 1.1;
    const clickLen = Math.round(0.004 * sr);
    if (i < clickLen) v += (rnd() * 2 - 1) * 0.5 * (1 - i / clickLen);
    out[i] = sat(v);
  }
  normalize(out);
  return buf;
}

function sfxRiser(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const sr = ctx.sampleRate;
  const out = buf.getChannelData(0);
  const rnd = mulberry32(777);
  let lp = 0;
  let ph = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const noise = rnd() * 2 - 1;
    const cut = 0.02 + 0.42 * x;
    lp += cut * (noise - lp);
    const hp = noise - lp;
    const f = 180 * Math.pow(1200 / 180, x);
    ph += (2 * Math.PI * f) / sr;
    let env = Math.pow(x, 1.5);
    if (x > 0.94) env *= (1 - x) / 0.06;
    out[i] = sat((hp * 0.55 + Math.sin(ph) * 0.3) * env);
  }
  normalize(out);
  return buf;
}

function sfxClick(ctx: BaseAudioContext, seconds = 0.03): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const sr = ctx.sampleRate;
  const out = buf.getChannelData(0);
  const rnd = mulberry32(31);
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const v =
      (rnd() * 2 - 1) * Math.exp(-x * 40) * 0.7 +
      Math.sin((2 * Math.PI * 2200 * i) / sr) * Math.exp(-x * 60) * 0.5;
    out[i] = v;
  }
  normalize(out);
  return buf;
}

function sfxPop(ctx: BaseAudioContext, seconds = 0.12): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const sr = ctx.sampleRate;
  const out = buf.getChannelData(0);
  let ph = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const f = 480 * Math.pow(920 / 480, x);
    ph += (2 * Math.PI * f) / sr;
    const env = Math.min(1, i / (0.003 * sr)) * Math.pow(1 - x, 1.4);
    out[i] = Math.sin(ph) * env;
  }
  normalize(out);
  return buf;
}

function sfxShutter(ctx: BaseAudioContext, seconds = 0.09): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const sr = ctx.sampleRate;
  const out = buf.getChannelData(0);
  const rnd = mulberry32(555);
  let lp = 0;
  const n = out.length;
  const hits = [0, 0.045];
  for (let i = 0; i < n; i++) {
    const x = i / sr;
    const noise = rnd() * 2 - 1;
    lp += 0.35 * (noise - lp);
    const hp = noise - lp;
    let v = 0;
    for (const h of hits) {
      if (x >= h && x < h + 0.03) {
        const dx = (x - h) / 0.03;
        v += hp * Math.exp(-dx * 9) * (dx < 0.08 ? 1 : 0.6);
      }
    }
    out[i] = sat(v * 1.2);
  }
  normalize(out);
  return buf;
}

function sfxImpactSub(ctx: BaseAudioContext, seconds = 0.6): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const sr = ctx.sampleRate;
  const out = buf.getChannelData(0);
  let ph = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const f = 55 * Math.pow(28 / 55, x);
    ph += (2 * Math.PI * f) / sr;
    out[i] = sat(Math.sin(ph) * Math.exp(-x * 4) * 1.2);
  }
  normalize(out, 0.95);
  return buf;
}

/* ---------------- D41: the catalog generators ----------------
 * ~17 archetypes parameterised into the 85-sound SFX catalog.
 * Everything is seeded (mulberry32) so preview ≡ export, and every
 * generator only touches ctx.sampleRate + ctx.createBuffer, which is
 * what lets verify-core smoke-test the whole catalog headlessly.
 */

/** Always scale to a fixed peak so picked sounds sit at one loudness. */
function gainTo(data: Float32Array, target = 0.85): void {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  if (max > 1e-6) {
    const g = target / max;
    for (let i = 0; i < data.length; i++) data[i] *= g;
  }
}

/** Mix generated buffers into one at given offsets (composites). */
function sfxMix(
  ctx: BaseAudioContext,
  parts: [AudioBuffer, number, number][],
): AudioBuffer {
  const sr = ctx.sampleRate;
  let total = 0;
  for (const [b, at] of parts) total = Math.max(total, at * sr + b.length);
  const buf = makeBuffer(ctx, total / sr);
  const out = buf.getChannelData(0);
  for (const [b, at, gain] of parts) {
    const s = Math.round(at * sr);
    const data = b.getChannelData(0);
    for (let i = 0; i < data.length && s + i < out.length; i++) {
      out[s + i] += data[i] * gain;
    }
  }
  gainTo(out, 0.9);
  return buf;
}

/**
 * Noise band sweep — the whoosh/sweep/swish family.
 * `pass` adds a pass-by cutoff arc (doppler); `snap` adds a crack near
 * the end (whip).
 */
function sfxNoiseSweep(
  ctx: BaseAudioContext,
  seconds: number,
  cut0: number,
  cut1: number,
  opts: {
    bright?: number;
    bell?: boolean;
    pass?: number;
    snap?: number;
    seed?: number;
  } = {},
): AudioBuffer {
  const bright = opts.bright ?? 1;
  const bell = opts.bell ?? false;
  const pass = opts.pass ?? 0;
  const snap = opts.snap ?? 0;
  const rnd = mulberry32(opts.seed ?? 4242);
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  let lp = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const cut = pass > 0 ? cut0 + pass * Math.sin(Math.PI * x) : cut0 + (cut1 - cut0) * x;
    const noise = rnd() * 2 - 1;
    lp += Math.min(0.92, Math.max(0.008, cut)) * (noise - lp);
    const hp = (noise - lp) * bright;
    const env = bell
      ? Math.sin(Math.PI * x)
      : Math.min(1, x / 0.15) * Math.pow(1 - x, 1.1);
    let v = (hp + lp * 0.6) * env * 1.6;
    if (snap > 0 && x > 0.9) v += (rnd() * 2 - 1) * snap * ((x - 0.9) / 0.1);
    out[i] = sat(v);
  }
  gainTo(out);
  return buf;
}

/** Oscillator sweep — zaps, zooms, digital sweeps. */
function sfxTone(
  ctx: BaseAudioContext,
  seconds: number,
  freqAt: (x: number) => number,
  opts: {
    wave?: "sine" | "saw" | "square" | "tri";
    noise?: number;
    crackle?: boolean;
    click?: number;
    trem?: number;
    attack?: number;
    seed?: number;
  } = {},
): AudioBuffer {
  const wave = opts.wave ?? "sine";
  const noise = opts.noise ?? 0;
  const crackle = opts.crackle ?? false;
  const click = opts.click ?? 0;
  const trem = opts.trem ?? 0;
  const attack = opts.attack ?? 0.06;
  const rnd = mulberry32(opts.seed ?? 555);
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const clickLen = Math.round(0.003 * sr);
  let ph = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const t = i / sr;
    ph += (2 * Math.PI * freqAt(x)) / sr;
    const frac = (ph / (2 * Math.PI)) % 1;
    const osc =
      wave === "saw"
        ? 2 * frac - 1
        : wave === "square"
          ? frac < 0.5
            ? 1
            : -1
          : wave === "tri"
            ? 4 * Math.abs(frac - 0.5) - 1
            : Math.sin(ph);
    const env = Math.min(1, x / attack) * Math.pow(1 - x, 1.15);
    const amp = trem > 0 ? 0.65 + 0.35 * Math.sin(2 * Math.PI * trem * t) : 1;
    let v = osc * env * amp * 1.1;
    if (noise > 0) {
      const nz = rnd() * 2 - 1;
      const gate = crackle ? (rnd() < 0.32 ? 1.4 : 0.12) : 1;
      v += nz * noise * env * gate;
    }
    if (i < clickLen) v += (rnd() * 2 - 1) * click * (1 - i / clickLen);
    out[i] = sat(v);
  }
  gainTo(out);
  return buf;
}

/** Impact family: pitched drop + noise burst + click transient. */
function sfxHitN(
  ctx: BaseAudioContext,
  p: {
    f0: number;
    f1: number;
    dur: number;
    noise?: number;
    nDecay?: number;
    click?: number;
    seed?: number;
  },
): AudioBuffer {
  const noise = p.noise ?? 0;
  const nDecay = p.nDecay ?? 6;
  const click = p.click ?? 0.5;
  const rnd = mulberry32(p.seed ?? 99);
  const buf = makeBuffer(ctx, p.dur);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const clickLen = Math.round(0.004 * sr);
  let ph = 0;
  let lp = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const f = p.f0 * Math.pow(p.f1 / p.f0, x);
    ph += (2 * Math.PI * f) / sr;
    const env = Math.exp(-x * 5.5);
    let v = Math.sin(ph) * env * 1.1;
    if (noise > 0) {
      const nz = rnd() * 2 - 1;
      lp += 0.25 * (nz - lp);
      v += ((nz - lp) * 0.75 + lp * 0.35) * noise * Math.exp(-x * nDecay);
    }
    if (i < clickLen) v += (rnd() * 2 - 1) * click * (1 - i / clickLen);
    out[i] = sat(v);
  }
  gainTo(out);
  return buf;
}

/** Sub drop — the bass-drop family (parametrised impact_sub). */
function sfxSubDrop(
  ctx: BaseAudioContext,
  seconds: number,
  f0: number,
  f1: number,
): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  let ph = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const f = f0 * Math.pow(f1 / f0, x);
    ph += (2 * Math.PI * f) / sr;
    out[i] = sat(Math.sin(ph) * Math.exp(-x * 4) * 1.2);
  }
  gainTo(out, 0.95);
  return buf;
}

/** Riser family — rising tone + rising noise (dramatic / tension). */
function sfxRiserX(
  ctx: BaseAudioContext,
  seconds: number,
  f0: number,
  f1: number,
  noiseMix: number,
  pow: number,
): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const rnd = mulberry32(8181);
  let lp = 0;
  let ph = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const nz = rnd() * 2 - 1;
    const cut = 0.02 + 0.42 * x;
    lp += cut * (nz - lp);
    const hp = nz - lp;
    const f = f0 * Math.pow(f1 / f0, x);
    ph += (2 * Math.PI * f) / sr;
    let env = Math.pow(x, pow);
    if (x > 0.94) env *= (1 - x) / 0.06;
    out[i] = sat((hp * noiseMix + Math.sin(ph) * 0.35) * env * 1.5);
  }
  gainTo(out);
  return buf;
}

/** Reverse cymbal — bright noise swell that cuts abruptly on the beat. */
function sfxRevCymbal(ctx: BaseAudioContext, seconds = 0.7): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const rnd = mulberry32(6060);
  let lp = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const nz = rnd() * 2 - 1;
    const cut = 0.05 + 0.5 * Math.pow(x, 1.3);
    lp += cut * (nz - lp);
    const hp = nz - lp;
    let env = Math.pow(x, 2.4);
    if (x > 0.96) env *= (1 - x) / 0.04;
    out[i] = sat((hp * 1.4 + lp * 0.4) * env * 1.5);
  }
  gainTo(out);
  return buf;
}

/** Transient family — one or two micro clicks/ticks/snaps. */
function sfxTransient(
  ctx: BaseAudioContext,
  p: {
    dur: number;
    freq: number;
    noise: number;
    second?: number;
    seed?: number;
  },
): AudioBuffer {
  const second = p.second ?? -1;
  const total = Math.max(p.dur, second >= 0 ? second + p.dur * 0.8 : 0);
  const buf = makeBuffer(ctx, total);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const rnd = mulberry32(p.seed ?? 31);
  const hit = (t: number, t0: number, amp: number): number => {
    if (t < t0) return 0;
    const u = (t - t0) / p.dur;
    if (u > 1) return 0;
    const nz = (rnd() * 2 - 1) * p.noise;
    const tn = Math.sin(2 * Math.PI * p.freq * (t - t0)) * 0.6;
    return (nz + tn) * Math.exp(-u * 26) * amp;
  };
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = hit(t, 0, 1);
    if (second >= 0) v += hit(t, second, 0.6);
    out[i] = sat(v);
  }
  gainTo(out);
  return buf;
}

/** Glitch family — gated, crushed noise + square jitter. */
function sfxGlitchX(
  ctx: BaseAudioContext,
  seconds: number,
  gateHz: number,
  baseFreq: number,
  stepInc: number,
  bands: number,
  steps: number,
): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const rnd = mulberry32(2024);
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const gate = Math.floor(i / (sr / gateHz)) % 2 === 0 ? 1 : 0.25;
    const nz = rnd() * 2 - 1;
    const crushed = Math.round(nz * steps) / steps;
    const freq = baseFreq + stepInc * Math.floor(x * bands);
    const sq = Math.sin((2 * Math.PI * freq * i) / sr) >= 0 ? 1 : -1;
    const env = Math.pow(1 - x, 1.2) * Math.min(1, i / 200);
    out[i] = sat((crushed * 0.6 + sq * 0.35) * gate * env);
  }
  gainTo(out);
  return buf;
}

/** Record scratch — bandpassed noise with a cyclical speed wobble. */
function sfxScratch(ctx: BaseAudioContext, seconds = 0.45): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const rnd = mulberry32(1733);
  let lp = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const t = i / sr;
    const nz = rnd() * 2 - 1;
    const cut = 0.3 + 0.18 * Math.sin(2 * Math.PI * 6 * t);
    lp += cut * (nz - lp);
    const hp = nz - lp;
    const am = 0.3 + 0.7 * Math.max(0, Math.sin(2 * Math.PI * 8.5 * t));
    const env = Math.min(1, x / 0.05) * Math.min(1, (1 - x) / 0.12);
    out[i] = sat((hp * 0.9 + lp * 0.5) * am * env * 1.7);
  }
  gainTo(out);
  return buf;
}

/** Typing — a deterministic cluster of micro keystroke clicks. */
function sfxTyping(ctx: BaseAudioContext, seconds = 0.6): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const rnd = mulberry32(4907);
  let t = 0.02;
  while (t < seconds - 0.06) {
    const at = Math.round(t * sr);
    const len = Math.round(0.008 * sr);
    for (let j = 0; j < len && at + j < out.length; j++) {
      const u = j / len;
      out[at + j] +=
        ((rnd() * 2 - 1) * 0.9 + Math.sin((2 * Math.PI * 1900 * j) / sr) * 0.35) *
        Math.exp(-u * 11);
    }
    t += 0.045 + rnd() * 0.07;
  }
  for (let i = 0; i < out.length; i++) out[i] = sat(out[i]);
  gainTo(out);
  return buf;
}

/** Mechanical clunk — two low knocks plus a noise tap. */
function sfxClunk(ctx: BaseAudioContext, seconds = 0.26): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const rnd = mulberry32(9090);
  const thump = (t: number, t0: number, f0: number, f1: number, dec: number): number => {
    const u = (t - t0) / 0.09;
    if (t < t0 || u > 1) return 0;
    const dt = t - t0;
    const ph = 2 * Math.PI * (f0 * dt + ((f1 - f0) * dt * dt) / (2 * 0.09));
    return Math.sin(ph) * Math.exp(-u * dec);
  };
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const nz = (rnd() * 2 - 1) * (t < 0.014 ? Math.exp(-t * 150) : 0);
    out[i] = sat(thump(t, 0, 135, 80, 16) + thump(t, 0.095, 95, 60, 18) * 0.85 + nz * 0.5);
  }
  gainTo(out);
  return buf;
}

/** Cartoon boing — resonant pitch bend up and back. */
function sfxBoing(ctx: BaseAudioContext, seconds = 0.4): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  let ph = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const f = 190 + 400 * Math.sin(Math.PI * Math.min(1, x * 1.35));
    ph += (2 * Math.PI * f) / sr;
    const w = Math.sin(ph) + 0.35 * Math.sin(2 * ph);
    const env = Math.min(1, x / 0.03) * Math.exp(-x * 4.2);
    out[i] = sat(w * env * 1.1);
  }
  gainTo(out);
  return buf;
}

/** Hologram — fluttering high tone (square-ish amplitude modulation). */
function sfxHologram(ctx: BaseAudioContext, seconds = 0.6): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  let ph = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const t = i / sr;
    const f = 1180 + 320 * x;
    ph += (2 * Math.PI * f) / sr;
    const am = Math.sin(2 * Math.PI * 21 * t) > 0 ? 0.9 : 0.4;
    const env = Math.min(1, x / 0.08) * Math.pow(1 - x, 1.1);
    out[i] = sat((Math.sin(ph) * 0.8 + Math.sin(2.01 * ph) * 0.25) * am * env);
  }
  gainTo(out);
  return buf;
}

/** Futuristic scan — rising sweep with tremolo, ending on a blip. */
function sfxScan(ctx: BaseAudioContext, seconds = 0.55): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  let ph = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const t = i / sr;
    const f = 460 * Math.pow(4.3, x);
    ph += (2 * Math.PI * f) / sr;
    let v = Math.sin(ph) * (0.65 + 0.35 * Math.sin(2 * Math.PI * 14 * t));
    if (x > 0.86) {
      const u = (x - 0.86) / 0.14;
      v += Math.sin(2 * Math.PI * 2750 * u * 0.5) * 0.7 * Math.sin(Math.PI * u);
    }
    const env = Math.min(1, x / 0.05) * Math.pow(1 - x, 0.8);
    out[i] = sat(v * env);
  }
  gainTo(out);
  return buf;
}

/** Warp — a three-stage frequency detour. */
function sfxWarp(ctx: BaseAudioContext, seconds = 0.45): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const rnd = mulberry32(31337);
  let ph = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const f =
      x < 0.4
        ? 260 * Math.pow(1200 / 260, x / 0.4)
        : x < 0.7
          ? 1200 * Math.pow(380 / 1200, (x - 0.4) / 0.3)
          : 380 * Math.pow(1600 / 380, (x - 0.7) / 0.3);
    ph += (2 * Math.PI * f) / sr;
    const frac = (ph / (2 * Math.PI)) % 1;
    const env = Math.min(1, x / 0.05) * Math.pow(1 - x, 0.9);
    out[i] = sat(((2 * frac - 1) * 0.5 + Math.sin(ph) * 0.7 + (rnd() * 2 - 1) * 0.12) * env);
  }
  gainTo(out);
  return buf;
}

/** Shimmer — two close high tones with a slow tremolo, gliding. */
function sfxShimmer(
  ctx: BaseAudioContext,
  seconds: number,
  f0: number,
  f1: number,
): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  let pa = 0;
  let pb = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const t = i / sr;
    const f = f0 * Math.pow(f1 / f0, x);
    pa += (2 * Math.PI * f) / sr;
    pb += (2 * Math.PI * f * 1.007) / sr;
    const trem = 0.55 + 0.45 * Math.sin(2 * Math.PI * 5.5 * t);
    const env = Math.min(1, x / 0.1) * Math.pow(1 - x, 1.0);
    out[i] = sat((Math.sin(pa) + Math.sin(pb) * 0.8) * 0.55 * trem * env);
  }
  gainTo(out);
  return buf;
}

/** Sparkle — an ascending deterministic run of tiny blips. */
function sfxSparkle(
  ctx: BaseAudioContext,
  seconds: number,
  f0: number,
  count: number,
  seed: number,
): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const rnd = mulberry32(seed);
  for (let k = 0; k < count; k++) {
    const t0 = (k / count) * seconds * 0.72;
    const freq = f0 * (1 + 0.32 * k) + rnd() * f0 * 0.18;
    const amp = 0.5 + rnd() * 0.5;
    const at = Math.round(t0 * sr);
    const len = Math.round(0.07 * sr);
    for (let j = 0; j < len && at + j < out.length; j++) {
      const u = j / len;
      out[at + j] +=
        Math.sin((2 * Math.PI * freq * j) / sr) * Math.exp(-u * 7) * Math.min(1, u * 12) * amp;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = sat(out[i]);
  gainTo(out);
  return buf;
}

/** Beep family — explicit [freq, start, dur] tone notes. */
function sfxBeeps(
  ctx: BaseAudioContext,
  seconds: number,
  notes: [number, number, number][],
): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    for (const [f, t0, d] of notes) {
      if (t < t0 || t >= t0 + d) continue;
      const u = (t - t0) / d;
      v +=
        Math.sin(2 * Math.PI * f * (t - t0)) *
        Math.min(1, (t - t0) * 90) *
        Math.pow(1 - u, 1.6) *
        0.9;
    }
    out[i] = sat(v * 1.1);
  }
  gainTo(out);
  return buf;
}

/** Pop family — quick pitch-up blip with an optional click. */
function sfxPopX(
  ctx: BaseAudioContext,
  seconds: number,
  f0: number,
  f1: number,
  click: number,
): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const rnd = mulberry32(404);
  const clickLen = Math.round(0.003 * sr);
  let ph = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const f = f0 * Math.pow(f1 / f0, x);
    ph += (2 * Math.PI * f) / sr;
    const env = Math.min(1, i / (0.003 * sr)) * Math.pow(1 - x, 1.4);
    let v = Math.sin(ph) * env;
    if (i < clickLen) v += (rnd() * 2 - 1) * click * (1 - i / clickLen);
    out[i] = sat(v);
  }
  gainTo(out);
  return buf;
}

/** Rumble family — low noise bed with a slow swell (rumble / room tone). */
function sfxRumbleForSfx(
  ctx: BaseAudioContext,
  seconds: number,
  cut: number,
  am: number,
): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const rnd = mulberry32(6421);
  let lp = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const t = i / sr;
    const nz = rnd() * 2 - 1;
    lp += cut * (nz - lp);
    const env = Math.min(1, x / 0.2) * Math.pow(1 - x, 1.4);
    const trem = 1 - Math.min(1, am) * 0.35 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 1.4 * t));
    out[i] = sat(lp * 2.4 * env * trem);
  }
  gainTo(out);
  return buf;
}

/** Shutter family — mechanical hit pattern (+ optional motor whirr). */
function sfxShutterX(
  ctx: BaseAudioContext,
  seconds: number,
  hits: number[],
  motor?: [number, number],
): AudioBuffer {
  const buf = makeBuffer(ctx, seconds);
  const out = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const rnd = mulberry32(555);
  let lp = 0;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const nz = rnd() * 2 - 1;
    lp += 0.35 * (nz - lp);
    const hp = nz - lp;
    let v = 0;
    for (const h of hits) {
      if (t >= h && t < h + 0.03) {
        const u = (t - h) / 0.03;
        v += hp * Math.exp(-u * 9) * (u < 0.08 ? 1 : 0.6);
      }
    }
    if (motor && t >= motor[0] && t < motor[1]) {
      const u = (t - motor[0]) / (motor[1] - motor[0]);
      v += lp * (0.5 + 0.5 * Math.sin(2 * Math.PI * 32 * t)) * Math.sin(Math.PI * u) * 1.4;
    }
    out[i] = sat(v * 1.2);
  }
  gainTo(out);
  return buf;
}

/* The table: every catalog id → its generator (D41). */
type SfxGen = (ctx: BaseAudioContext) => AudioBuffer;

const SFX_TABLE: Record<string, SfxGen> = {
  /* Cuts */
  "sfx.whoosh_hit": (c) =>
    sfxMix(c, [
      [sfxWhoosh(c, 0.3, false), 0, 0.9],
      [sfxHit(c, 150, 45, 0.25), 0.13, 0.9],
    ]),
  "sfx.hit_02": (c) => sfxHit(c, 95, 35, 0.35),
  "sfx.punch": (c) => sfxHitN(c, { f0: 230, f1: 70, dur: 0.16, noise: 0.4, nDecay: 9, click: 0.6 }),
  "sfx.glitch_sting": (c) => sfxGlitchX(c, 0.18, 50, 180, 60, 12, 3),
  "sfx.record_scratch": (c) => sfxScratch(c),
  "sfx.click": (c) => sfxClick(c),
  "sfx.snap": (c) => sfxTransient(c, { dur: 0.06, freq: 3100, noise: 1.05 }),
  "sfx.bass_hit": (c) => sfxHitN(c, { f0: 110, f1: 40, dur: 0.22, noise: 0.15, nDecay: 6, click: 0.3 }),
  "sfx.hit_01": (c) => sfxHit(c, 150, 45, 0.25),

  /* Transitions */
  "sfx.whoosh_01": (c) => sfxWhoosh(c, 0.35, false),
  "sfx.sweep": (c) => sfxNoiseSweep(c, 0.5, 0.04, 0.5, { bright: 1.0 }),
  "sfx.swish": (c) => sfxNoiseSweep(c, 0.16, 0.1, 0.8, { bright: 1.5 }),
  "sfx.whip_whoosh": (c) => sfxNoiseSweep(c, 0.26, 0.06, 0.75, { bright: 1.4, snap: 0.6 }),
  "sfx.riser": (c) => sfxRiser(c, 0.8),
  "sfx.reverse_cymbal": (c) => sfxRevCymbal(c),
  "sfx.bass_drop": (c) => sfxSubDrop(c, 0.9, 72, 26),
  "sfx.impact_sub": (c) => sfxImpactSub(c),
  "sfx.transition_whoosh": (c) => sfxNoiseSweep(c, 0.42, 0.05, 0.55, { bright: 1.1, bell: true }),
  "sfx.cinematic_sweep": (c) => sfxNoiseSweep(c, 0.7, 0.03, 0.45, { bright: 0.9 }),
  "sfx.air_whoosh": (c) => sfxNoiseSweep(c, 0.38, 0.03, 0.35, { bright: 0.8, bell: true }),
  "sfx.whoosh_02": (c) => sfxWhoosh(c, 0.3, true),

  /* Visual Effects */
  "sfx.pop": (c) => sfxPop(c),
  "sfx.glitch": (c) => sfxGlitchX(c, 0.2, 40, 220, 80, 10, 4),
  "sfx.laser_zap": (c) =>
    sfxTone(c, 0.18, (x) => 2600 * Math.pow(320 / 2600, x), {
      wave: "saw",
      noise: 0.2,
      click: 0.5,
    }),
  "sfx.magic_sparkle": (c) => sfxSparkle(c, 0.5, 1100, 6, 77),
  "sfx.shimmer": (c) => sfxShimmer(c, 0.6, 2750, 2980),
  "sfx.ui_click": (c) => sfxTransient(c, { dur: 0.04, freq: 1950, noise: 0.45 }),
  "sfx.digital_beep": (c) => sfxBeeps(c, 0.15, [[880, 0, 0.12]]),
  "sfx.bubble_pop": (c) => sfxPopX(c, 0.09, 650, 1500, 0.35),
  "sfx.electric_zap": (c) =>
    sfxTone(c, 0.24, (x) => 3200 * Math.pow(400 / 3200, x), {
      wave: "saw",
      noise: 0.5,
      crackle: true,
      click: 0.4,
    }),
  "sfx.warp": (c) => sfxWarp(c),
  "sfx.mechanical_clunk": (c) => sfxClunk(c),
  "sfx.cartoon_boing": (c) => sfxBoing(c),
  "sfx.typing": (c) => sfxTyping(c),
  "sfx.notification_ping": (c) =>
    sfxBeeps(c, 0.5, [
      [1046, 0, 0.14],
      [1568, 0.15, 0.3],
    ]),
  "sfx.camera_flash": (c) => sfxTransient(c, { dur: 0.05, freq: 2700, noise: 1.0, second: 0.02 }),

  /* Logo & Text Reveals */
  "sfx.logo_reveal_impact": (c) =>
    sfxMix(c, [
      [sfxWhoosh(c, 0.4, false), 0, 0.85],
      [sfxHitN(c, { f0: 140, f1: 42, dur: 0.5, noise: 0.3 }), 0.3, 1],
    ]),
  "sfx.cinematic_hit": (c) =>
    sfxHitN(c, { f0: 150, f1: 48, dur: 0.5, noise: 0.35, nDecay: 5, click: 0.5 }),
  "sfx.deep_boom": (c) =>
    sfxHitN(c, { f0: 85, f1: 26, dur: 0.9, noise: 0.2, nDecay: 3, click: 0.3 }),
  "sfx.whoosh_impact": (c) =>
    sfxMix(c, [
      [sfxWhoosh(c, 0.3, false), 0, 0.95],
      [sfxHitN(c, { f0: 150, f1: 45, dur: 0.4, noise: 0.3 }), 0.14, 0.95],
    ]),
  "sfx.shimmer_reveal": (c) => sfxShimmer(c, 0.7, 1500, 3300),
  "sfx.sparkle_hit": (c) =>
    sfxMix(c, [
      [sfxHitN(c, { f0: 150, f1: 50, dur: 0.3, noise: 0.3 }), 0, 1],
      [sfxSparkle(c, 0.45, 1300, 5, 78), 0.1, 0.8],
    ]),
  "sfx.title_pop": (c) => sfxPopX(c, 0.16, 420, 1150, 0.5),
  "sfx.text_whoosh": (c) => sfxNoiseSweep(c, 0.3, 0.05, 0.6, { bright: 1.3, bell: true }),
  "sfx.bass_impact": (c) =>
    sfxHitN(c, { f0: 125, f1: 38, dur: 0.55, noise: 0.2, nDecay: 5, click: 0.4 }),
  "sfx.dramatic_riser": (c) => sfxRiserX(c, 1.1, 160, 980, 0.55, 1.4),

  /* Speed Ramps & Zooms */
  "sfx.speed_ramp_whoosh": (c) => sfxNoiseSweep(c, 0.4, 0.05, 0.85, { bright: 1.4, snap: 0.45 }),
  "sfx.velocity": (c) =>
    sfxTone(
      c,
      0.3,
      (x) => (x < 0.5 ? 320 * Math.pow(1600 / 320, x * 2) : 1600 * Math.pow(480 / 1600, (x - 0.5) * 2)),
      { wave: "saw", noise: 0.35 },
    ),
  "sfx.fast_whoosh": (c) => sfxNoiseSweep(c, 0.22, 0.08, 0.7, { bright: 1.4 }),
  "sfx.zoom_in": (c) => sfxTone(c, 0.28, (x) => 400 * Math.pow(4, x), { noise: 0.1 }),
  "sfx.zoom_out": (c) => sfxTone(c, 0.28, (x) => 1600 * Math.pow(0.25, x), { noise: 0.1 }),
  "sfx.punch_zoom": (c) =>
    sfxMix(c, [
      [sfxTone(c, 0.22, (x) => 350 * Math.pow(1500 / 350, x), { wave: "saw", noise: 0.2 }), 0, 0.9],
      [sfxHitN(c, { f0: 150, f1: 55, dur: 0.3, noise: 0.3 }), 0.16, 1],
    ]),
  "sfx.whip_pan": (c) =>
    sfxNoiseSweep(c, 0.26, 0.1, 0.1, { bell: true, pass: 0.45, bright: 1.4, snap: 0.5 }),
  "sfx.fast_swish": (c) => sfxNoiseSweep(c, 0.14, 0.15, 0.9, { bright: 1.6, snap: 0.3 }),
  "sfx.doppler_whoosh": (c) =>
    sfxMix(c, [
      [sfxNoiseSweep(c, 0.55, 0.1, 0.1, { bell: true, pass: 0.5, bright: 1.2 }), 0, 1],
      [
        sfxTone(c, 0.55, (x) => 240 * Math.pow(3.4, Math.sin(Math.PI * x)), {
          attack: 0.1,
        }),
        0,
        0.5,
      ],
    ]),

  /* Cinematic */
  "sfx.cinematic_boom": (c) =>
    sfxMix(c, [
      [sfxHitN(c, { f0: 95, f1: 28, dur: 0.8, noise: 0.25, nDecay: 3, click: 0.4 }), 0, 1],
      [sfxRumbleForSfx(c, 1.0, 0.05, 1.2), 0, 0.6],
    ]),
  "sfx.deep_impact": (c) =>
    sfxHitN(c, { f0: 92, f1: 30, dur: 0.7, noise: 0.3, nDecay: 4, click: 0.4 }),
  "sfx.dark_rumble": (c) => sfxRumbleForSfx(c, 1.4, 0.05, 1.5),
  "sfx.tension_riser": (c) => sfxRiserX(c, 1.6, 120, 640, 0.8, 1.7),
  "sfx.epic_hit": (c) =>
    sfxMix(c, [
      [sfxHitN(c, { f0: 165, f1: 45, dur: 0.6, noise: 0.5, nDecay: 4.5, click: 0.6 }), 0, 1],
      [sfxRumbleForSfx(c, 0.8, 0.06, 1.0), 0, 0.55],
    ]),
  "sfx.trailer_hit": (c) =>
    sfxMix(c, [
      [sfxHitN(c, { f0: 170, f1: 50, dur: 0.45, noise: 0.4 }), 0, 1],
      [sfxHitN(c, { f0: 130, f1: 40, dur: 0.5, noise: 0.45, seed: 100 }), 0.16, 0.85],
    ]),
  "sfx.low_bass_drop": (c) => sfxSubDrop(c, 1.1, 62, 20),
  "sfx.atmospheric_sweep": (c) =>
    sfxMix(c, [
      [sfxNoiseSweep(c, 1.1, 0.05, 0.3, { bright: 0.7, seed: 8899 }), 0, 1],
      [sfxRumbleForSfx(c, 1.1, 0.07, 1.1), 0, 0.7],
    ]),
  "sfx.thunder_impact": (c) =>
    sfxMix(c, [
      [sfxHitN(c, { f0: 130, f1: 38, dur: 0.55, noise: 0.5 }), 0, 1],
      [sfxRumbleForSfx(c, 1.2, 0.05, 1.6), 0.04, 0.75],
    ]),
  "sfx.heavy_slam": (c) =>
    sfxHitN(c, { f0: 210, f1: 45, dur: 0.5, noise: 0.7, nDecay: 10, click: 0.8 }),

  /* Photography & Studio */
  "sfx.shutter": (c) => sfxShutter(c),
  "sfx.dslr_shutter": (c) => sfxShutterX(c, 0.16, [0, 0.04, 0.095]),
  "sfx.flash_pop": (c) => sfxPopX(c, 0.1, 620, 1700, 0.45),
  "sfx.film_click": (c) => sfxTransient(c, { dur: 0.06, freq: 1900, noise: 0.85, second: 0.045 }),
  "sfx.focus_beep": (c) =>
    sfxBeeps(c, 0.23, [
      [1200, 0, 0.06],
      [1200, 0.12, 0.08],
    ]),
  "sfx.lens_zoom": (c) =>
    sfxTone(c, 0.45, (x) => 260 * Math.pow(950 / 260, x), {
      trem: 26,
      noise: 0.12,
      attack: 0.1,
    }),
  "sfx.photo_snap": (c) => sfxTransient(c, { dur: 0.055, freq: 3400, noise: 1.0 }),
  "sfx.polaroid_eject": (c) => sfxShutterX(c, 0.5, [0], [0.06, 0.48]),
  "sfx.studio_ambience": (c) => sfxRumbleForSfx(c, 1.6, 0.16, 0.8),
  "sfx.light_switch": (c) => sfxTransient(c, { dur: 0.08, freq: 720, noise: 0.9, second: 0.05 }),

  /* UI & Motion Graphics */
  "sfx.button_click": (c) => sfxTransient(c, { dur: 0.05, freq: 1500, noise: 0.5, second: 0.035 }),
  "sfx.mouse_click": (c) => sfxTransient(c, { dur: 0.04, freq: 2300, noise: 0.5, second: 0.05 }),
  "sfx.digital_tick": (c) => sfxTransient(c, { dur: 0.03, freq: 3300, noise: 0.18 }),
  "sfx.interface_beep": (c) =>
    sfxBeeps(c, 0.25, [
      [660, 0, 0.09],
      [880, 0.11, 0.11],
    ]),
  "sfx.notification_pop": (c) =>
    sfxMix(c, [
      [sfxPopX(c, 0.09, 520, 820, 0.3), 0, 0.9],
      [sfxPopX(c, 0.11, 880, 1380, 0.2), 0.085, 0.9],
    ]),
  "sfx.data_glitch": (c) => sfxGlitchX(c, 0.14, 90, 520, 120, 16, 5),
  "sfx.digital_sweep": (c) =>
    sfxTone(c, 0.35, (x) => 300 * Math.pow(6, x), {
      wave: "square",
      trem: 6,
      noise: 0.1,
      attack: 0.08,
    }),
  "sfx.tech_whoosh": (c) =>
    sfxMix(c, [
      [sfxNoiseSweep(c, 0.3, 0.1, 0.7, { bright: 1.5, bell: true, seed: 9090 }), 0, 1],
      [
        sfxTone(c, 0.3, () => 1650, { trem: 9, noise: 0.15, attack: 0.1, seed: 9091 }),
        0,
        0.4,
      ],
    ]),
  "sfx.futuristic_scan": (c) => sfxScan(c),
  "sfx.hologram": (c) => sfxHologram(c),
};

export function synthSfx(ctx: BaseAudioContext, asset: string): AudioBuffer | null {
  const gen = SFX_TABLE[asset];
  return gen ? gen(ctx) : null;
}

/* ---------------- music tones ---------------- */

type Out = Float32Array;

/** MIDI note → Hz (A4 = 69 = 440). */
function midiHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/**
 * One note of a tone, rendered per voice character. Envelopes are shaped
 * so consecutive notes of the motif stay distinct even at short `spb`.
 */
function addToneNote(
  out: Out,
  sr: number,
  voice: ToneDef["voice"],
  start: number,
  dur: number,
  freq: number,
): void {
  const s0 = Math.round(start * sr);
  const n = Math.max(1, Math.round(dur * sr));
  let ph = 0;
  let vibPh = 0;
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const x = i / n; // 0..1 across the note
    const attack = Math.min(1, i / (0.004 * sr));
    const release = x > 0.82 ? Math.max(0, (1 - x) / 0.18) : 1;
    let w: number;
    let env = attack * release;

    switch (voice) {
      case "square": {
        // classic monophonic beeper — hard edges, flat body
        vibPh += (2 * Math.PI * 6) / sr;
        ph += (2 * Math.PI * (freq * (1 + 0.004 * Math.sin(vibPh)))) / sr;
        w = Math.sin(ph) >= 0 ? 1 : -1;
        env *= 0.42 * (0.9 + 0.1 * release);
        break;
      }
      case "warble": {
        // vibrato-heavy old handset ring
        vibPh += (2 * Math.PI * 7.5) / sr;
        ph += (2 * Math.PI * (freq * (1 + 0.02 * Math.sin(vibPh)))) / sr;
        w = Math.sin(ph) + 0.3 * Math.sin(ph * 2);
        env *= 0.5 * attack;
        break;
      }
      case "poly": {
        // soft polyphonic body — fundamental + fifth shimmer
        ph += (2 * Math.PI * freq) / sr;
        w =
          Math.sin(ph) * 0.8 +
          Math.sin(ph * 1.5) * 0.25 +
          Math.sin(ph * 2) * 0.12;
        env *= 0.5;
        break;
      }
      case "marimba": {
        // mallet decay — fast exponential fade, hollow timbre
        ph += (2 * Math.PI * freq) / sr;
        w = Math.sin(ph) + 0.4 * Math.sin(ph * 4) * Math.exp(-x * 5);
        env *= 0.55 * Math.exp(-x * 2.4);
        break;
      }
      case "chime": {
        // bell-like — inharmonic partial, long shimmering tail
        ph += (2 * Math.PI * freq) / sr;
        w =
          Math.sin(ph) +
          0.5 * Math.sin(ph * 2.76) * Math.exp(-x * 3) +
          0.25 * Math.sin(ph * 5.4) * Math.exp(-x * 6);
        env *= 0.5 * Math.exp(-x * 1.6);
        break;
      }
    }
    out[s0 + i] += sat(w * env);
  }
}

/**
 * Render ONE pass of a tone motif into a buffer (mono — the music gain
 * chain owns level). Deterministic: same tone ⇒ identical samples, so
 * preview ≡ export. The audio engine loops this buffer for `loop` tones
 * and plays it once for alerts/beeps (by nature, settled).
 */
export function synthTone(ctx: BaseAudioContext, tone: ToneDef): AudioBuffer {
  const endBeat = tone.notes.reduce((m, [b, len]) => Math.max(m, b + len), 0);
  const seconds = Math.max(0.1, endBeat * tone.spb + 0.2);
  const buf = makeBuffer(ctx, seconds, 1);
  const sr = ctx.sampleRate;
  const out = buf.getChannelData(0);

  for (const [b, len, midi] of tone.notes) {
    addToneNote(
      out,
      sr,
      tone.voice,
      b * tone.spb,
      Math.max(0.05, len * tone.spb),
      midiHz(midi),
    );
  }

  normalize(out, 0.8);
  return buf;
}
