/**
 * BEAT + SEGMENT ANALYSIS (timing family) — local, on-device, no
 * service: the imported song is decoded with Web Audio and read from
 * its own PCM.
 *
 * How it hears a tempo: RMS onset envelope per ~11.6ms hop → positive
 * flux (energy rises) → autocorrelation inside a musical lag window
 * (55–200 BPM) with parabolic refinement → tempo; then a comb score
 * over the envelope finds the phase (where beat zero sits).
 *
 * The same envelope answers "WHERE should the song play?": pickSegment
 * scans the beat grid for a spot that both lands on a beat and opens
 * onto a strong section, while always leaving enough song for the
 * video. It returns plain seconds — the template stores a number and
 * nothing downstream depends on BPM.
 *
 * Honest limits: it's an ESTIMATE — steady, driving music works best.
 * Returns null when there is nothing to beat to.
 */

export interface Beat {
  /** beats per minute, 55–200 */
  bpm: number;
  /** where beat zero falls inside the song, seconds from its start */
  phase: number;
}

/** One pass over the audio: the tempo plus the energy map it reads. */
export interface SongProfile {
  beat: Beat;
  /** RMS onset envelope, one frame per hop */
  env: Float32Array;
  /** seconds per envelope frame */
  hopSec: number;
}

/** envelope resolution: one RMS frame per hop (~11.6ms at 44.1k) */
const HOP = 512;
const BPM_MIN = 55;
const BPM_MAX = 200;
/** below this peak the track is silence — nothing to sync to */
const SILENCE = 1e-4;
/** how much song a segment pick must "open onto" when scoring strength */
const LOOKAHEAD_SEC = 2;
/** the fraction of beat candidates kept as "strong" before the random roll */
const TOP_QUARTILE = 0.25;

/** RMS energy per hop — the envelope every other answer is read from. */
function envelope(channel: Float32Array): Float32Array {
  const frames = Math.floor(channel.length / HOP);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = f * HOP;
    for (let i = 0; i < HOP; i++) {
      const x = channel[base + i];
      sum += x * x;
    }
    env[f] = Math.sqrt(sum / HOP);
  }
  return env;
}

/** Autocorrelation of the flux envelope at one lag. */
function autocorr(flux: Float32Array, lag: number): number {
  let score = 0;
  for (let f = 0; f + lag < flux.length; f++) score += flux[f] * flux[f + lag];
  return score;
}

/** Tempo + phase, read from an envelope (null = nothing to beat to). */
function beatFromEnv(env: Float32Array, hopSec: number): Beat | null {
  const frames = env.length;
  const lagMin = Math.max(2, Math.floor((60 / BPM_MAX) / hopSec));
  const lagMax = Math.max(lagMin + 2, Math.ceil((60 / BPM_MIN) / hopSec));
  if (frames < lagMax * 2) return null; // too short to hear a tempo

  let peak = 0;
  for (let f = 0; f < frames; f++) if (env[f] > peak) peak = env[f];
  if (peak < SILENCE) return null; // silence — nothing to beat to

  /* positive flux: where the energy RISES (the onsets) */
  const flux = new Float32Array(frames);
  let mean = 0;
  for (let f = 1; f < frames; f++) {
    const d = env[f] - env[f - 1];
    flux[f] = d > 0 ? d : 0;
    mean += flux[f];
  }
  mean /= frames;
  for (let f = 0; f < frames; f++) flux[f] -= mean;

  /* autocorrelation over the tempo window → the beat period */
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
  const bpm = 60 / (lag * hopSec);

  /* phase: which offset lines the envelope up with the beat grid */
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

/** Read a tempo out of one channel of PCM (null when there is none). */
export function detectBeat(
  channel: Float32Array,
  sampleRate: number,
): Beat | null {
  return beatFromEnv(envelope(channel), HOP / sampleRate);
}

/** One pass: the tempo plus the envelope the segment picker scores. */
export function songProfile(
  channel: Float32Array,
  sampleRate: number,
): SongProfile | null {
  const env = envelope(channel);
  const hopSec = HOP / sampleRate;
  const beat = beatFromEnv(env, hopSec);
  return beat ? { beat, env, hopSec } : null;
}

/**
 * WHERE should the song play? A random spot ON the beat grid that opens
 * onto a strong section (top-quartile energy over the next 2s of real
 * audio) and still leaves `needSec` of song for the video. Falls back to
 * the plain beat zero when the song can't cover the video anywhere (the
 * track then ends early — the app says so honestly), and to 0 with no
 * profile at all.
 */
export function pickSegment(
  profile: SongProfile | null,
  songDur: number,
  needSec: number,
): number {
  if (!profile) return 0; // no analysis — honest: plays from the top
  const { beat, env, hopSec } = profile;
  const beatSec = 60 / beat.bpm;
  const maxStart = Math.max(0, songDur - needSec);
  const frames = env.length;

  /* score every beat-grid start by the energy it opens onto */
  const scored: { t: number; score: number }[] = [];
  for (let t = beat.phase; t <= maxStart + 1e-9; t += beatSec) {
    const f0 = Math.round(t / hopSec);
    const f1 = Math.min(frames, f0 + Math.round(LOOKAHEAD_SEC / hopSec));
    if (f1 <= f0) continue;
    let sum = 0;
    for (let f = f0; f < f1; f++) sum += env[f];
    scored.push({ t, score: sum / (f1 - f0) });
  }
  if (!scored.length) return beat.phase; // song shorter than the video

  /* keep the strongest quarter, then roll the dice among them */
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.max(1, Math.ceil(scored.length * TOP_QUARTILE)));
  return top[Math.floor(Math.random() * top.length)].t;
}
