/**
 * BEAT DETECTION (timing family) — local, on-device, no service: the
 * imported song is decoded with Web Audio and read straight from PCM.
 *
 * How it hears a tempo: RMS onset envelope per ~11.6ms hop → positive
 * flux (energy rises) → autocorrelation inside a musical lag window
 * (55–200 BPM) with parabolic refinement → tempo; then a comb score
 * over the envelope finds the phase (where beat zero sits in the song).
 *
 * Honest limits: it's an ESTIMATE — steady, driving music works best;
 * the result only feeds the director's duration picks (which are stored
 * as plain seconds, so nothing downstream — engine, preview, export —
 * ever depends on BPM). Returns null when there is nothing to beat to.
 */

export interface Beat {
  /** beats per minute, 55–200 */
  bpm: number;
  /** where beat zero falls inside the song, seconds from its start */
  phase: number;
}

/** envelope resolution: one RMS frame per hop (~11.6ms at 44.1k) */
const HOP = 512;
const BPM_MIN = 55;
const BPM_MAX = 200;
/** below this peak the track is silence — nothing to sync to */
const SILENCE = 1e-4;

/** Autocorrelation of the flux envelope at one lag. */
function autocorr(flux: Float32Array, lag: number): number {
  let score = 0;
  for (let f = 0; f + lag < flux.length; f++) score += flux[f] * flux[f + lag];
  return score;
}

/**
 * Read a tempo out of one channel of PCM. Null when the buffer is too
 * short to carry a tempo, or silent.
 */
export function detectBeat(
  channel: Float32Array,
  sampleRate: number,
): Beat | null {
  const frames = Math.floor(channel.length / HOP);
  const lagMin = Math.max(2, Math.floor((60 / BPM_MAX) * (sampleRate / HOP)));
  const lagMax = Math.max(lagMin + 2, Math.ceil((60 / BPM_MIN) * (sampleRate / HOP)));
  if (frames < lagMax * 2) return null; // too short to hear a tempo

  /* 1) the onset envelope: RMS per hop */
  const env = new Float32Array(frames);
  let peak = 0;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = f * HOP;
    for (let i = 0; i < HOP; i++) {
      const x = channel[base + i];
      sum += x * x;
    }
    env[f] = Math.sqrt(sum / HOP);
    if (env[f] > peak) peak = env[f];
  }
  if (peak < SILENCE) return null; // silence — nothing to beat to

  /* 2) positive flux: where the energy RISES (the onsets) */
  const flux = new Float32Array(frames);
  let mean = 0;
  for (let f = 1; f < frames; f++) {
    const d = env[f] - env[f - 1];
    flux[f] = d > 0 ? d : 0;
    mean += flux[f];
  }
  mean /= frames;
  for (let f = 0; f < frames; f++) flux[f] -= mean;

  /* 3) autocorrelation over the tempo window → the beat period */
  let bestLag = lagMin;
  let bestScore = -Infinity;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    const score = autocorr(flux, lag);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestScore <= 0) return null; // no repeating pattern at all

  /* parabolic refinement between the neighbours for sub-lag precision */
  let lag = bestLag;
  if (bestLag > lagMin && bestLag < lagMax) {
    const a = autocorr(flux, bestLag - 1);
    const c = autocorr(flux, bestLag + 1);
    const denom = a - 2 * bestScore + c;
    if (Math.abs(denom) > 1e-12) {
      const delta = (0.5 * (a - c)) / denom;
      if (Math.abs(delta) < 1) lag = bestLag + delta;
    }
  }
  const hopSec = HOP / sampleRate;
  const bpm = 60 / (lag * hopSec);

  /* 4) phase: which offset lines the envelope up with the beat grid */
  const period = Math.round(lag);
  let bestOff = 0;
  let bestPhase = -Infinity;
  for (let off = 0; off < period; off++) {
    let score = 0;
    for (let k = 0; off + k * period < frames; k++) score += env[off + k * period];
    if (score > bestPhase) {
      bestPhase = score;
      bestOff = off;
    }
  }
  return { bpm, phase: bestOff * hopSec };
}
