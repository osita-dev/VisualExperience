/**
 * FRAME engine verification — runs with plain `bun scripts/verify-core.ts`.
 * No dependencies, no install, no app run. Exit code 1 on any failure.
 *
 * Gate: "cut at 1.500s" (the unlocked seconds model) + determinism +
 * derived durations + V1–V12 validation + the tone catalog + the
 * v1→v2 migration + the D41 sound catalog (every asset synthesizes
 * headlessly).
 */

import { resolve } from "../src/core/resolve/resolve";
import { validateTemplate } from "../src/core/validate/validate";
import type { ResolveContent, Template } from "../src/core/model/types";
import {
  DEFAULT_SLOT_SEC,
  MAX_TOTAL_SEC,
  MIN_SLOT_SEC,
  NO_MUSIC_TRACK,
  isToneTrack,
  presetKey,
  toneTrackId,
} from "../src/core/model/types";
import { TONES, TONE_GROUPS, getTone, tonePassSeconds } from "../src/core/audio/tones";
import { PRESET_MAP, BUNDLES, MOTIONS, TRANSITIONS, EFFECTS, TEXT_PRESETS, VANIM_PRESETS, VANIM_FAMILIES, FILTER_PRESETS, FILTER_FAMILIES } from "../src/presets/data";import { TEXT_ANIMATIONS, TEXT_EXITS, TEXT_FAMILIES } from "../src/presets/textCatalog";
import { SFX_ASSETS, SFX_CATEGORIES, SFX_LIBRARY } from "../src/core/audio/sfxCatalog";
import { STICKER_ASSETS } from "../src/core/media/stickers";
import {
  FONT_FACES,
  FONT_GROUPS,
  TYPOGRAPHY_PRESETS,
  fontFace,
  nearestWeight,
} from "../src/core/text/fonts";
import { synthSfx, synthTone } from "../src/player/synth";
import { timelineStarts, trimAtBoundary } from "../src/lib/timeline";
import { maxTrimStart, storedFileMime, rebuildStoredFile, isUniversalVideo, type ProbedMedia } from "../src/lib/mediaUtils";
import { filledMediaTemplate } from "../src/core/media/filled";
import {
  OUT_NAME,
  convertArgs,
  convertedName,
  frameSequenceArgs,
  inNameFor,
} from "../src/lib/convert";
import { encodePcm16Wav } from "../src/exporter/wav";
import { existsSync, readFileSync } from "node:fs";
import { RAW_TEMPLATES } from "../src/templates/data";
import { metrics } from "../src/templates/registry";
import {
  PHOTO_SEC_MAX,
  PHOTO_SEC_MIN,
  RAMP_END_SEC,
  RAMP_START_SEC,
  UNIFORM_SEC,
  VIDEO_SEC_MAX,
  VIDEO_SEC_MIN,
  directAll,
  directDurations,
  directLook,
  directMotion,
  directSounds,
  SFX_MAX,
  directTexts,
  directTextPlacement,
  placeTexts,
  textBoxesClash,
  type TextShape,
  directTransitions,
  fitBulkDurs,
  shuffledIndices,
  type MediaInfo,
} from "../src/lib/direct";
import { detectBeat, pickSegment, songProfile } from "../src/lib/beat";
import {
  LAYOUT_GAP,
  LAYOUTS,
  layoutRects,
  paneCount,
  paneKey,
} from "../src/core/media/layouts";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function near(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

const content: ResolveContent = { texts: {}, trims: {}, soundOn: {} };

function get(id: string): Template {
  const t = RAW_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`template ${id} missing`);
  return t;
}

/* ---------- 1. Library counts (D8: 6 motions / 6 transitions / 6 effects / 3 bundles / 85 sfx) ---------- */
console.log("\n[1] Preset library (D8)");
check("6 motions", MOTIONS.length === 6, String(MOTIONS.length));
check("6 transitions", TRANSITIONS.length === 6, String(TRANSITIONS.length));
check("6 effects", EFFECTS.length === 6, String(EFFECTS.length));
check("the 3 classic text presets remain", ["text.pop","text.rise","text.type"].every((id) => PRESET_MAP[`${id}@1`] !== undefined));
check("3 bundles", BUNDLES.length === 3, String(BUNDLES.length));
check("all presets keyed id@version", Object.keys(PRESET_MAP).length === 6 + 6 + 6 + TEXT_PRESETS.length + VANIM_PRESETS.length + FILTER_PRESETS.length + 3);

/* ---------- 2. Validation V1–V12 on every template ---------- */
console.log("\n[2] Template validation (V1–V13)");
for (const raw of RAW_TEMPLATES) {
  const { issues } = validateTemplate(raw, PRESET_MAP);
  check(`${raw.id} valid`, issues.length === 0, issues.map((i) => `${i.rule}: ${i.message}`).join("; "));
}

/* ---------- 3. Derived durations ---------- */
console.log("\n[3] Derived durations (Stage 08 examples)");
const gh = resolve(get("tpl.golden_hour"), content, PRESET_MAP);
check("golden_hour = 12.0s", near(gh.duration, 12.0), String(gh.duration));
const mp = resolve(get("tpl.mini_punch"), content, PRESET_MAP);
check("mini_punch = 4.0s", near(mp.duration, 4.0), String(mp.duration));
const ps = resolve(get("tpl.product_spot"), content, PRESET_MAP);
check("product_spot = 10.0s @150BPM", near(ps.duration, 10.0), String(ps.duration));

/* ---------- 4. THE gate: the cut lands at exactly 1.500s ---------- */
console.log("\n[4] Exit gate: seconds model");
const s1Show = mp.entries.find((e) => e.kind === "media" && e.target === "s1" && e.do === "show");
check("cut (slot s1 end) = 1.500s", near(mp.cuts[0], 1.5), String(mp.cuts[0]));
const s1Info = mp.slots.find((s) => s.id === "s1");
check("slot s1: start 0, end 1.5", !!s1Info && near(s1Info.start, 0) && near(s1Info.end, 1.5));
check("slot s2 spans 1.5 → 2.5", (() => {
  const s2 = mp.slots.find((s) => s.id === "s2");
  return !!s2 && near(s2.start, 1.5) && near(s2.end, 2.5);
})());
check("media show entry exists for s1", !!s1Show);
check("Schedule carries no beat grid", !("beats" in mp), Object.keys(mp).join(","));

/* zoom_punch bundle at cut 1.5 (duration .35): window 1.325–1.675 */
const seam = "seam:s1|s2";
/* built-in cut SFX are OFF by default — the seam stays silent (no whoosh/hit) */
const seamAudio = mp.entries.filter((e) => e.kind === "audio");
check("no built-in cut sound auto-plays at the seam", seamAudio.length === 0,
  seamAudio.map((e) => `${e.target}@${e.t}`).join(","));
const trans = mp.entries.find((e) => e.kind === "transition" && e.target === seam);
check("transition on seam s1|s2", !!trans && trans.do === "transition.zoom_reveal", trans ? trans.do : "missing");

/* ---------- 5. Rule 5: transitions centered & overlapping (media extends past cut) ---------- */
console.log("\n[5] Overlap invariants (Rule 5)");
const s1ShowFull = mp.entries.find((e) => e.kind === "media" && e.target === "s1" && e.do === "show");
const s2ShowFull = mp.entries.find((e) => e.kind === "media" && e.target === "s2" && e.do === "show");
check("outgoing s1 extends past cut by half transition", !!s1ShowFull && s1ShowFull.t + s1ShowFull.dur > 1.5 + 1e-9,
  s1ShowFull ? `ends ${(s1ShowFull.t + s1ShowFull.dur).toFixed(3)}` : "missing");
check("incoming s2 begins before cut by half transition", !!s2ShowFull && s2ShowFull.t < 1.5 - 1e-9,
  s2ShowFull ? `starts ${s2ShowFull.t.toFixed(3)}` : "missing");

/* ---------- 6. Determinism: same input → identical schedule ---------- */
console.log("\n[6] Determinism");
for (const id of ["tpl.golden_hour", "tpl.product_spot", "tpl.urban_vibes"]) {
  const a = JSON.stringify(resolve(get(id), content, PRESET_MAP));
  const b = JSON.stringify(resolve(get(id), content, PRESET_MAP));
  check(`${id} resolves identically twice`, a === b);
}

/* ---------- 7. Rule 2: entries sorted by (t, phase) ---------- */
console.log("\n[7] Schedule ordering (Rule 2)");
const phaseOf = (kind: string, doo: string): number => {
  if (kind === "media") return doo === "hide" ? 0 : 1;
  return { text: 2, motion: 3, effect: 4, transition: 5, audio: 6, music: 7 }[kind] ?? 8;
};
let sorted = true;
for (const t of ["tpl.golden_hour", "tpl.beat_move", "tpl.fresh_food"]) {
  const s = resolve(get(t), content, PRESET_MAP);
  for (let i = 1; i < s.entries.length; i++) {
    const a = s.entries[i - 1];
    const b = s.entries[i];
    const ka = a.t < b.t || (a.t === b.t && phaseOf(a.kind, a.do) <= phaseOf(b.kind, b.do));
    if (!ka) { sorted = false; console.error(`    out of order at ${t}: [${a.t},${a.do}] → [${b.t},${b.do}]`); }
  }
}
check("all templates sorted by (t, phase)", sorted);

/* ---------- 8. Content changes stay inside slots (Rule 6) ---------- */
console.log("\n[8] Content cannot change structure (Rule 6)");
const custom: ResolveContent = { texts: { t1: "MY OWN WORDS" }, trims: { s1: 0.7 }, soundOn: { s1: true } };
const a1 = JSON.stringify(resolve(get("tpl.mini_punch"), content, PRESET_MAP));
const customSched = resolve(get("tpl.mini_punch"), custom, PRESET_MAP);
const b1 = JSON.stringify(customSched);
const stripValues = (json: string): string =>
  json.replace(/"value":"[^"]*"/g, '"value":"*"').replace(/"trimStart":[0-9.]+/g, '"trimStart":*');
check("same duration & slots with custom content", stripValues(a1) === stripValues(b1));
check("custom text lands in schedule", b1.includes("MY OWN WORDS"));
check("trim lands in schedule", b1.includes('"trimStart":0.7'));

/* ---------- 9. All template preset refs exist (V4 run separately for clarity) ---------- */
console.log("\n[9] Metrics are derived");
const m = metrics(get("tpl.golden_hour"));
check("golden_hour metrics: 12s / 6 media / 1 text / 7 slots",
  near(m.duration, 12) && m.mediaSlots === 6 && m.textSlots === 1 && m.totalSlots === 7,
  JSON.stringify(m));
check("cuts computed (5 cuts)", m.cuts.length === 5);

/* ---------- 10. Tone catalog, the seconds model & the v1→v2 migration ---------- */
console.log("\n[10] Tones, seconds model & migration");

const mpT = get("tpl.mini_punch");

/* --- the tone catalog (structure + integrity) --- */
check("55 tones in the catalog", TONES.length === 55, String(TONES.length));
check("7 groups, exactly the curated labels",
  TONE_GROUPS.length === 7 &&
    TONE_GROUPS.map((g) => g.label).join("|") ===
      "Classic Nokia Tones|Old Samsung Tones|Old Tecno Tones|Old Infinix Tones|Old Chinese Phone Tones|Notification Sounds|Feature Phone Sounds",
  TONE_GROUPS.map((g) => g.label).join("|"));
check("tone ids unique", new Set(TONES.map((t) => t.id)).size === TONES.length);
check("tone names unique", new Set(TONES.map((t) => t.name)).size === TONES.length);
check("every tone sits in a listed group",
  TONES.every((t) => TONE_GROUPS.some((g) => g.id === t.group)),
  TONES.filter((t) => !TONE_GROUPS.some((g) => g.id === t.group)).map((t) => t.id).join(","));
check("every group carries at least one tone",
  TONE_GROUPS.every((g) => TONES.some((t) => t.group === g.id)));
check("spb stays in a sane internal range (never surfaced as BPM)",
  TONES.every((t) => t.spb > 0.03 && t.spb < 1),
  TONES.filter((t) => !(t.spb > 0.03 && t.spb < 1)).map((t) => t.id).join(","));
let noteErr = "";
for (const t of TONES) {
  if (t.notes.length === 0) noteErr += `${t.id}:empty; `;
  for (const [start, len, midi] of t.notes) {
    if (!(start >= 0 && len > 0 && midi >= 0 && midi <= 127)) {
      noteErr += `${t.id}:[${start},${len},${midi}]; `;
      break;
    }
  }
}
check("every motif is well-formed (start ≥ 0, len > 0, midi 0–127)", noteErr === "", noteErr);
check("getTone resolves by bare id",
  !!getTone("nokia.tune") && getTone("nope.nope") === undefined);
check("every tone's pass is 0.2s–5s",
  TONES.every((t) => {
    const p = tonePassSeconds(t);
    return p >= 0.2 && p <= 5;
  }),
  TONES.filter((t) => {
    const p = tonePassSeconds(t);
    return !(p >= 0.2 && p <= 5);
  }).map((t) => `${t.id}:${tonePassSeconds(t).toFixed(2)}`).join(","));
check("some tones loop (ringtones) and some play once (alerts)",
  TONES.some((t) => t.loop) && TONES.some((t) => !t.loop));

/* --- every tone synthesizes headlessly (mock AudioContext) --- */
const mockCtx = {
  sampleRate: 48000,
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      length,
      numberOfChannels: channels,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: (i: number) => data[i],
    };
  },
} as unknown as BaseAudioContext;

let toneBad = "";
for (const tone of TONES) {
  let buf: AudioBuffer | null = null;
  try {
    buf = synthTone(mockCtx, tone);
  } catch (e) {
    toneBad = `${tone.id} threw ${String(e)}`;
    break;
  }
  if (!buf) { toneBad = `${tone.id} → null`; break; }
  if (!(buf.duration >= 0.1 && buf.duration <= 6)) {
    toneBad = `${tone.id} duration ${buf.duration.toFixed(3)}s`;
    break;
  }
  const data = buf.getChannelData(0);
  let peak = 0;
  let finite = true;
  for (let i = 0; i < data.length; i++) {
    if (!Number.isFinite(data[i])) { finite = false; break; }
    peak = Math.max(peak, Math.abs(data[i]));
  }
  if (!finite) { toneBad = `${tone.id} has non-finite samples`; break; }
  if (peak < 0.01 || peak > 1.01) { toneBad = `${tone.id} peak ${peak.toFixed(3)}`; break; }
}
check("all 55 tones synthesize (finite, audible)", toneBad === "", toneBad);
const tA = synthTone(mockCtx, getTone("nokia.tune")!);
const tB = synthTone(mockCtx, getTone("nokia.tune")!);
check("tone synthesis is deterministic (preview ≡ export)",
  tA.getChannelData(0)[500] === tB.getChannelData(0)[500]);

/* --- the unlocked model constants --- */
check("MIN_SLOT_SEC = 1s", MIN_SLOT_SEC === 1);
check("DEFAULT_SLOT_SEC = 10s", DEFAULT_SLOT_SEC === 10);
check("MAX_TOTAL_SEC = 300s (5 min)", MAX_TOTAL_SEC === 300);

/* --- music entry: soundtrack only (track + volume, no grid) --- */
const musicOf = (t: Template) =>
  resolve(t, content, PRESET_MAP).entries.find((e) => e.kind === "music");
check("music entry carries track + volume",
  !!musicOf(mpT) && typeof musicOf(mpT)!.params.track === "string" &&
    musicOf(mpT)!.params.volume === 0.9,
  musicOf(mpT) ? JSON.stringify(musicOf(mpT)!.params) : "missing");
check("music entry has no bpm/beats/offset grid",
  (() => {
    const p = musicOf(mpT)?.params ?? {};
    return p.bpm === undefined && p.beats === undefined && p.offset === undefined;
  })());
check("every built-in picks a real tone",
  RAW_TEMPLATES.every((t) => isToneTrack(t.music.track) && !!getTone(toneTrackId(t.music.track))),
  RAW_TEMPLATES.filter((t) => !isToneTrack(t.music.track)).map((t) => t.id).join(","));
check("every built-in is schemaVersion 2",
  RAW_TEMPLATES.every((t) => t.schemaVersion === 2));

/* --- V7: silent / known tone / valid local song --- */
check("track \"none\" validates clean (no music)",
  validateTemplate({ ...mpT, music: { track: NO_MUSIC_TRACK } }, PRESET_MAP).issues.length === 0);
check("a known tone validates clean",
  validateTemplate({ ...mpT, music: { track: "tone:nokia.tune" } }, PRESET_MAP).issues.length === 0);
const v7tone = validateTemplate({ ...mpT, music: { track: "tone.bogus.tone" } }, PRESET_MAP);
check("a garbage track shape is blocked (V7)",
  v7tone.template === undefined && v7tone.issues.some((i) => i.rule === "V7"),
  v7tone.issues.map((i) => i.rule).join(","));
const v7missing = validateTemplate({ ...mpT, music: { track: "tone:nope.nope" } }, PRESET_MAP);
check("an unknown tone is blocked (V7)",
  v7missing.template === undefined && v7missing.issues.some((i) => i.rule === "V7"),
  v7missing.issues.map((i) => i.message).join("; "));

/* mini_punch is 4.0s: a local song must cover the whole chain */
const localT: Template = {
  ...mpT,
  music: {
    track: "local:verify123",
    local: { name: "verify.mp3", duration: 8 },
  },
};
const okV7 = validateTemplate(localT, PRESET_MAP);
check("local song longer than the chain validates clean", okV7.issues.length === 0,
  okV7.issues.map((i) => `${i.rule}: ${i.message}`).join("; "));
const shortT: Template = {
  ...mpT,
  music: { track: "local:verify123", local: { name: "verify.mp3", duration: 2 } },
};
const badV7 = validateTemplate(shortT, PRESET_MAP);
check("chain beyond the song is blocked (V7)",
  badV7.template === undefined && badV7.issues.some((i) => i.rule === "V7"),
  badV7.issues.map((i) => i.rule).join(","));
const missingMeta: Template = { ...localT, music: { track: "local:verify123" } };
const badMeta = validateTemplate(missingMeta, PRESET_MAP);
check("local track without metadata is blocked (V7)",
  badMeta.template === undefined && badMeta.issues.some((i) => i.rule === "V7"),
  badMeta.issues.map((i) => i.rule).join(","));
const strayMeta = validateTemplate(
  { ...mpT, music: { track: NO_MUSIC_TRACK, local: { name: "x.mp3", duration: 9 } } },
  PRESET_MAP,
);
check("local metadata on a silent track is blocked (V7)",
  strayMeta.template === undefined && strayMeta.issues.some((i) => i.rule === "V7"));

/* --- V12: the 300s total cap (mini_punch has 3 slots, 100s each) --- */
const atCap: Template = {
  ...mpT,
  music: { track: NO_MUSIC_TRACK },
  tracks: { ...mpT.tracks, media: mpT.tracks.media.map((s) => ({ ...s, dur: 100 })) },
  connections: [],
};
check("exactly 300s (5 min) passes", validateTemplate(atCap, PRESET_MAP).issues.length === 0,
  validateTemplate(atCap, PRESET_MAP).issues.map((i) => `${i.rule}:${i.message}`).join("; "));
const overCap: Template = {
  ...atCap,
  tracks: { ...atCap.tracks, media: atCap.tracks.media.map((s, i) => (i === 0 ? { ...s, dur: 100.5 } : s)) },
};
const v12 = validateTemplate(overCap, PRESET_MAP);
check("300.5s is blocked (V12)",
  v12.template === undefined && v12.issues.some((i) => i.rule === "V12"),
  v12.issues.map((i) => i.rule).join(","));
const v2dur = validateTemplate(
  { ...mpT, music: { track: NO_MUSIC_TRACK }, tracks: { ...mpT.tracks, media: mpT.tracks.media.map((s) => ({ ...s, dur: 0 })) }, connections: [] },
  PRESET_MAP,
);
check("a zero-length slot is blocked (V2)",
  v2dur.template === undefined && v2dur.issues.some((i) => i.rule === "V2"));

/* --- the v1→v2 migration (runs through the validate gate) --- */
const v1: unknown = {
  id: "tpl.legacy",
  schemaVersion: 1,
  title: "Legacy",
  description: "",
  categories: [],
  palette: { from: "#000000", to: "#FFFFFF", emoji: "✨" },
  canvas: { ratio: "9:16", fps: 30, width: 1080, height: 1920 },
  music: {
    track: "song.sunset",
    bpm: 120,
    beats: [0, 0.5, 1, 1.5],
    bars: [0],
    drops: [],
  },
  tracks: {
    media: [
      { id: "s1", type: "media", accepts: ["photo", "video"], beats: [0, 4], crop: "fill" },
      { id: "s2", type: "media", accepts: ["photo", "video"], beats: [4, 8], crop: "fill" },
    ],
    overlay: [
      {
        id: "tx1", type: "text", beats: [0, 4], layer: 10, default: "HI",
        textPreset: "text.rise", version: 1, allowedControls: ["value"],
        style: { fontFamily: "Inter", weight: 700, sizeRel: 0.065, color: "#FFFFFF", align: "center", yRel: 0.76 },
      },
    ],
    images: [
      {
        id: "im1", type: "image", beats: [0, 8], layer: 20,
        source: { kind: "sticker", sticker: "emoji.fire", tone: "#FFFFFF" },
        x: 0.5, y: 0.2, size: 0.15, rotation: 0, opacity: 1,
      },
    ],
  },
  connections: [{ between: ["s1", "s2"], preset: "transition.dissolve", version: 1 }],
  userMay: ["fill_media"],
};
const mig = validateTemplate(v1, PRESET_MAP);
check("v1 template migrates and validates clean", mig.issues.length === 0,
  mig.issues.map((i) => `${i.rule}:${i.message}`).join("; "));
const mt = mig.template;
check("migration upgrades schemaVersion to 2", mt?.schemaVersion === 2, String(mt?.schemaVersion));
check("migration converts beats → dur (4 beats @120 = 2s each)",
  !!mt && near(mt.tracks.media[0].dur, 2) && near(mt.tracks.media[1].dur, 2),
  mt ? mt.tracks.media.map((s) => String(s.dur)).join(",") : "rejected");
check("migration maps text beats → absolute seconds",
  !!mt && near(mt.tracks.overlay[0].time[0], 0) && near(mt.tracks.overlay[0].time[1], 2),
  mt ? JSON.stringify(mt.tracks.overlay[0].time) : "rejected");
check("migration maps image beats → seconds covering the chain",
  !!mt && near(mt.tracks.images![0].time[0], 0) && near(mt.tracks.images![0].time[1], 4));
check("migration maps song.sunset → the documented tone",
  !!mt && mt.music.track === "tone:samsung.morning_flower",
  mt ? mt.music.track : "rejected");
check("migration drops the whole beat grid from music",
  !!mt && !("bpm" in mt.music) && !("beats" in mt.music));
check("migrated v1 resolves to the same 4.0s duration",
  !!mt && near(resolve(mt, content, PRESET_MAP).duration, 4.0),
  mt ? String(resolve(mt, content, PRESET_MAP).duration) : "rejected");
const again = validateTemplate(mt as unknown, PRESET_MAP);
check("migration is idempotent (v2 passes through untouched)",
  again.issues.length === 0 && JSON.stringify(again.template) === JSON.stringify(mt));
const v1pulse: unknown = { ...(v1 as Record<string, unknown>), music: { ...(v1 as { music: Record<string, unknown> }).music, track: "song.pulse" } };
const mp2 = validateTemplate(v1pulse, PRESET_MAP);
check("song.pulse maps to china.mtk_default",
  mp2.template?.music.track === "tone:china.mtk_default",
  mp2.template ? mp2.template.music.track : "rejected");
const v1other: unknown = { ...(v1 as Record<string, unknown>), music: { ...(v1 as { music: Record<string, unknown> }).music, track: "song.unknown" } };
const mo = validateTemplate(v1other, PRESET_MAP);
check("an unmapped old song migrates to silence (honest, not invented)",
  mo.template?.music.track === NO_MUSIC_TRACK,
  mo.template ? mo.template.music.track : "rejected");

/* ---------- 11. SFX catalog, synth & per-element sound overrides (D41) ---------- */
console.log("\n[11] Sound effects (D41)");

check("85 catalog sounds", SFX_LIBRARY.length === 85, String(SFX_LIBRARY.length));
check("8 SFX categories", SFX_CATEGORIES.length === 8, String(SFX_CATEGORIES.length));
check("catalog ids unique", new Set(SFX_ASSETS).size === SFX_ASSETS.length);
check("catalog names unique",
  new Set(SFX_LIBRARY.map((d) => d.name)).size === SFX_LIBRARY.length);
check("every id is sfx.*", SFX_ASSETS.every((id) => id.startsWith("sfx.")));
check("every entry sits in a known category",
  SFX_LIBRARY.every((d) => SFX_CATEGORIES.some((c) => c.id === d.category)));

/* every sound the PRESETS play must exist in the catalog */
const builtInSounds = new Set<string>();
for (const p of [...MOTIONS, ...TRANSITIONS, ...EFFECTS, ...TEXT_PRESETS])
  for (const s of p.sound ?? []) builtInSounds.add(s.asset);
for (const b of BUNDLES)
  for (const m of b.members) if (m.anchor !== undefined) builtInSounds.add(m.preset);
check("preset built-in sounds ⊆ catalog",
  [...builtInSounds].every((a) => SFX_ASSETS.includes(a)),
  [...builtInSounds].filter((a) => !SFX_ASSETS.includes(a)).join(","));

/* --- every catalog sound synthesizes headlessly (the mock AudioContext
 *     is defined in section 10) --- */
let synthBad = "";
for (const id of SFX_ASSETS) {
  let buf: AudioBuffer | null = null;
  try {
    buf = synthSfx(mockCtx, id);
  } catch (e) {
    synthBad = `${id} threw ${String(e)}`;
    break;
  }
  if (!buf) { synthBad = `${id} → null`; break; }
  if (!(buf.duration >= 0.02 && buf.duration <= 2.5)) {
    synthBad = `${id} duration ${buf.duration.toFixed(3)}s`;
    break;
  }
  const data = buf.getChannelData(0);
  let peak = 0;
  let finite = true;
  for (let i = 0; i < data.length; i++) {
    if (!Number.isFinite(data[i])) { finite = false; break; }
    peak = Math.max(peak, Math.abs(data[i]));
  }
  if (!finite) { synthBad = `${id} has non-finite samples`; break; }
  if (peak < 0.01 || peak > 1.01) { synthBad = `${id} peak ${peak.toFixed(3)}`; break; }
}
check("all 85 sounds synthesize (finite, audible, ≤ 2.5s)", synthBad === "", synthBad);
check("unknown sound id → null", synthSfx(mockCtx, "sfx.not_a_sound") === null);
const synthA = synthSfx(mockCtx, "sfx.whoosh_hit");
const synthB = synthSfx(mockCtx, "sfx.whoosh_hit");
check("synthesis is deterministic (preview ≡ export)",
  !!synthA && !!synthB &&
    synthA.getChannelData(0)[100] === synthB.getChannelData(0)[100]);

/* --- per-element overrides: as designed / silent / custom (D41) --- */
const defSched = resolve(mpT, content, PRESET_MAP);
const defAudio = defSched.entries.filter((e) => e.kind === "audio");
check("as designed: no built-in cut SFX auto-play (silent by default)",
  defAudio.length === 0, defAudio.map((e) => e.target).join(","));

/* transition sound: null / custom */
const tTransSilent: Template = {
  ...mpT,
  connections: mpT.connections.map((c) => ({ ...c, sound: null })),
};
const sTransSilent = resolve(tTransSilent, content, PRESET_MAP);
check("transition null: every built-in sound removed",
  sTransSilent.entries.every((e) => e.kind !== "audio"));
check("transition null: the transition visual still resolves",
  sTransSilent.entries.some((e) => e.kind === "transition"));

const tTransCustom: Template = {
  ...mpT,
  connections: mpT.connections.map((c) => ({
    ...c,
    sound: { asset: "sfx.snap", volume: 0.7 },
  })),
};
const sTransCustom = resolve(tTransCustom, content, PRESET_MAP);
const snaps = sTransCustom.entries.filter(
  (e) => e.kind === "audio" && e.target === "sfx.snap",
);
check("transition custom: fires once per cut", snaps.length === 2, String(snaps.length));
check("transition custom: lands exactly on the cuts (1.5s / 2.5s)",
  snaps.length === 2 && near(snaps[0].t, 1.5) && near(snaps[1].t, 2.5),
  snaps.map((e) => String(e.t)).join(","));
check("transition custom: carries its volume",
  snaps.every((e) => e.params.volume === 0.7));
check("transition custom: replaces the built-ins",
  sTransCustom.entries.every(
    (e) => e.kind !== "audio" || e.target === "sfx.snap",
  ));

/* slot cut sound */
const tCut: Template = {
  ...mpT,
  tracks: {
    ...mpT.tracks,
    media: mpT.tracks.media.map((s, i) =>
      i === 1 ? { ...s, sounds: { cut: { asset: "sfx.shutter", volume: 0.8 } } } : s,
    ),
  },
};
const cutHits = resolve(tCut, content, PRESET_MAP).entries.filter(
  (e) => e.kind === "audio" && e.target === "sfx.shutter",
);
check("cut sound: fires on the slot's cut (1.5s)",
  cutHits.length === 1 && near(cutHits[0].t, 1.5) && cutHits[0].params.volume === 0.8,
  cutHits.map((e) => String(e.t)).join(","));

/* effect sound: silence / replace a block bundle's built-in SFX */
const withBeatDrop = (snd: { effect: null | { asset: string; volume: number } }): Template => ({
  ...mpT,
  tracks: {
    ...mpT.tracks,
    media: mpT.tracks.media.map((s, i) =>
      i === 0
        ? {
            ...s,
            blockPresets: [{ preset: "bundle.beat_drop", version: 1 }],
            sounds: snd,
          }
        : s,
    ),
  },
  connections: mpT.connections.map((c) => ({ ...c, sound: null })),
});
const sEffSilent = resolve(withBeatDrop({ effect: null }), content, PRESET_MAP);
check("effect null: the bundle's riser/hit are silenced",
  sEffSilent.entries.every((e) => e.kind !== "audio"));
check("effect null: the bundle's visuals survive",
  sEffSilent.entries.some((e) => e.kind === "motion" && e.target === "s1"));
const sEffCustom = resolve(
  withBeatDrop({ effect: { asset: "sfx.glitch", volume: 0.5 } }),
  content,
  PRESET_MAP,
);
const effAudio = sEffCustom.entries.filter((e) => e.kind === "audio");
check("effect custom: one sound replaces the bundle's built-ins",
  effAudio.length === 1 && effAudio[0].target === "sfx.glitch",
  effAudio.map((e) => e.target).join(","));
check("effect custom: fires at the effect's start (0s)",
  effAudio.length === 1 && near(effAudio[0].t, 0));

/* text sound */
const tText: Template = {
  ...mpT,
  tracks: {
    ...mpT.tracks,
    overlay: mpT.tracks.overlay.map((t, i) =>
      i === 0 ? { ...t, sound: { asset: "sfx.magic_sparkle", volume: 0.9 } } : t,
    ),
  },
};
const textHits = resolve(tText, content, PRESET_MAP).entries.filter(
  (e) => e.kind === "audio" && e.target === "sfx.magic_sparkle",
);
check("text sound: fires on the text's reveal (0s)",
  textHits.length === 1 && near(textHits[0].t, 0));
check("text default: no sound until chosen",
  defAudio.every((e) => e.target !== "sfx.magic_sparkle"));

/* master switch */
const tMuted: Template = { ...mpT, sfxEnabled: false };
const sMuted = resolve(tMuted, content, PRESET_MAP);
check("master off: zero SFX entries", sMuted.entries.every((e) => e.kind !== "audio"));
check("master off: music keeps playing",
  sMuted.entries.some((e) => e.kind === "music"));
check("master off: drops ONLY the audio entries",
  JSON.stringify(sMuted.entries) ===
    JSON.stringify(defSched.entries.filter((e) => e.kind !== "audio")));

/* V8 gate */
const v8asset = validateTemplate(
  {
    ...mpT,
    tracks: {
      ...mpT.tracks,
      media: [
        { ...mpT.tracks.media[0], sounds: { cut: { asset: "sfx.nope", volume: 1 } } },
        ...mpT.tracks.media.slice(1),
      ],
    },
  },
  PRESET_MAP,
);
check("unknown sound asset is blocked (V8)",
  v8asset.template === undefined && v8asset.issues.some((i) => i.rule === "V8"),
  v8asset.issues.map((i) => `${i.rule}:${i.message}`).join("; "));
const v8vol = validateTemplate(
  {
    ...mpT,
    connections: [
      { ...mpT.connections[0], sound: { asset: "sfx.snap", volume: 1.5 } },
      ...mpT.connections.slice(1),
    ],
  },
  PRESET_MAP,
);
check("sound volume > 1 is blocked (V8)",
  v8vol.template === undefined && v8vol.issues.some((i) => i.rule === "V8"),
  v8vol.issues.map((i) => i.message).join("; "));
const v8ok = validateTemplate(
  {
    ...mpT,
    tracks: {
      ...mpT.tracks,
      media: [
        {
          ...mpT.tracks.media[0],
          sounds: { cut: { asset: "sfx.snap", volume: 0.9 }, effect: null },
        },
        ...mpT.tracks.media.slice(1),
      ],
    },
  },
  PRESET_MAP,
);
check("valid sound choices pass clean",
  v8ok.issues.length === 0,
  v8ok.issues.map((i) => `${i.rule}:${i.message}`).join("; "));
const v8null = validateTemplate(
  { ...mpT, connections: mpT.connections.map((c) => ({ ...c, sound: null })) },
  PRESET_MAP,
);
check("explicit silence (null) is valid",
  v8null.issues.length === 0,
  v8null.issues.map((i) => `${i.rule}:${i.message}`).join("; "));
const v8flag = validateTemplate({ ...mpT, sfxEnabled: "yes" } as unknown, PRESET_MAP);
check("non-boolean sfxEnabled is blocked (V8)",
  v8flag.template === undefined && v8flag.issues.some((i) => i.rule === "V8"));

/* ---------- 12. Music volume (D42) ---------- */
console.log("\n[12] Music volume (D42)");

const musicEntryOf = (t: Template) =>
  resolve(t, content, PRESET_MAP).entries.find((e) => e.kind === "music");
check("music default volume stays 0.9 (byte-compatible)",
  musicEntryOf(mpT)?.params.volume === 0.9,
  String(musicEntryOf(mpT)?.params.volume));
const tVol: Template = { ...mpT, music: { ...mpT.music, volume: 0.4 } };
check("creator's music volume flows into the schedule",
  musicEntryOf(tVol)?.params.volume === 0.4,
  String(musicEntryOf(tVol)?.params.volume));
check("volume change touches nothing else in the schedule",
  JSON.stringify(resolve(tVol, content, PRESET_MAP).entries.filter((e) => e.kind !== "music")) ===
    JSON.stringify(defSched.entries.filter((e) => e.kind !== "music")));
const vVol = validateTemplate({ ...mpT, music: { ...mpT.music, volume: 1.5 } }, PRESET_MAP);
check("music volume > 1 is blocked (V8)",
  vVol.template === undefined && vVol.issues.some((i) => i.rule === "V8"),
  vVol.issues.map((i) => i.message).join("; "));
const vVol0 = validateTemplate({ ...mpT, music: { ...mpT.music, volume: 0 } }, PRESET_MAP);
check("music volume 0 (silent bed, visuals keep their sounds) is valid",
  vVol0.issues.length === 0,
  vVol0.issues.map((i) => i.message).join("; "));
check("master SFX-off keeps the music entry (with its volume)",
  (() => {
    const e = resolve({ ...tVol, sfxEnabled: false }, content, PRESET_MAP).entries.find(
      (x) => x.kind === "music",
    );
    return e?.params.volume === 0.4;
  })());

/* imported song: its own level + on/off, separate from the tone bed */
const songT: Template = {
  ...mpT,
  music: { track: "local:verify123", local: { name: "verify.mp3", duration: 6 } },
};
const songAt = (over: Record<string, unknown>) =>
  musicEntryOf({ ...songT, music: { ...songT.music, ...over } });
check("imported song uses its own songVolume",
  songAt({ songVolume: 0.3 })?.params.volume === 0.3,
  String(songAt({ songVolume: 0.3 })?.params.volume));
check("song with no songVolume falls back to a sane level (0.9)",
  songAt({})?.params.volume === 0.9,
  String(songAt({})?.params.volume));
check("a muted imported song drops the music entry (silent, import stays)",
  songAt({ songOn: false }) === undefined,
  String(songAt({ songOn: false })?.params.track));
check("muted-but-loaded song still validates clean (no false V7 error)",
  (() => {
    const v = validateTemplate({ ...songT, music: { ...songT.music, songOn: false } }, PRESET_MAP);
    return v.issues.length === 0;
  })());
check("song volume > 1 is blocked (V8)",
  (() => {
    const v = validateTemplate({ ...songT, music: { ...songT.music, songVolume: 2 } }, PRESET_MAP);
    return v.template === undefined && v.issues.some((i) => i.rule === "V8");
  })());
check("songOn must be a boolean (V8)",
  (() => {
    const v = validateTemplate({ ...songT, music: { ...songT.music, songOn: "yes" } }, PRESET_MAP);
    return v.template === undefined && v.issues.some((i) => i.rule === "V8");
  })());

/* imported song: the chosen segment (D50) — a window that starts at
   songStart and always covers the video; tones never carry an offset */
check("song segment start is carried into the schedule (offset)",
  songAt({ songStart: 2.5 })?.params.offset === 2.5,
  String(songAt({ songStart: 2.5 })?.params.offset));
check("song with no songStart starts at the song's own beginning (older saves)",
  songAt({})?.params.offset === 0,
  String(songAt({})?.params.offset));
check("a negative songStart clamps to 0 instead of reading before the file",
  songAt({ songStart: -1 })?.params.offset === 0,
  String(songAt({ songStart: -1 })?.params.offset));
check("tone tracks never carry a song offset",
  musicEntryOf({
    ...songT,
    music: { ...songT.music, track: `tone:${TONES[0].id}` },
  })?.params.offset === undefined,
  String(musicEntryOf({
    ...songT,
    music: { ...songT.music, track: `tone:${TONES[0].id}` },
  })?.params.offset));
check("songStart must be a number >= 0 (V8)",
  (() => {
    const v = validateTemplate({ ...songT, music: { ...songT.music, songStart: "x" } }, PRESET_MAP);
    return v.template === undefined && v.issues.some((i) => i.rule === "V8");
  })());

/* ---------- 13. Text animation catalog + exits (D43) ---------- */
console.log("\n[13] Text animation catalog (D43)");

check("text preset ids are unique",
  new Set(TEXT_PRESETS.map((p) => p.id)).size === TEXT_PRESETS.length,
  String(TEXT_PRESETS.length));
check("catalog covers the full curated set (>= 90)", TEXT_PRESETS.length >= 90,
  String(TEXT_PRESETS.length));
const famIds = new Set(TEXT_FAMILIES.map((f) => f.id));
const catalog = [...TEXT_ANIMATIONS, ...TEXT_EXITS];
check("every catalog preset belongs to a listed family",
  catalog.every((p) => p.tags.length > 0 && famIds.has(p.tags[0])),
  catalog.filter((p) => !famIds.has(p.tags[0])).map((p) => p.id).join(","));
check("every family is used by at least one preset",
  TEXT_FAMILIES.every((f) => TEXT_PRESETS.some((p) => p.tags[0] === f.id)),
  TEXT_FAMILIES.filter((f) => !TEXT_PRESETS.some((p) => p.tags[0] === f.id)).map((f) => f.id).join(","));
check("there are 14 exit animations",
  TEXT_PRESETS.filter((p) => p.tags[0] === "exit").length === 14,
  String(TEXT_PRESETS.filter((p) => p.tags[0] === "exit").length));

const EASES_OK = new Set([
  "linear", "out", "in", "inOut", "overshoot", "pulse", "bounce", "elastic",
]);
const STAG_BY_OK = new Set(["char", "word", "line"]);
const finiteTree = (v: unknown): boolean => {
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(finiteTree);
  if (v && typeof v === "object") return Object.values(v).every(finiteTree);
  return true;
};
let chanErr = "";
for (const p of TEXT_PRESETS) {
  const r = p.resolve({});
  if (p.kind !== "text") chanErr += `${p.id}:kind; `;
  if (!finiteTree(r)) chanErr += `${p.id}:nonfinite; `;
  for (const k of ["inFrac", "outFrac"]) {
    if (r[k] !== undefined && !(typeof r[k] === "number" && r[k] > 0 && r[k] <= 1))
      chanErr += `${p.id}:${k}; `;
  }
  if (r.ease !== undefined && !EASES_OK.has(String(r.ease))) chanErr += `${p.id}:ease; `;
  const st = r.stag as { by?: string } | undefined;
  if (st && st.by !== undefined && !STAG_BY_OK.has(st.by)) chanErr += `${p.id}:stag; `;
}
check("every preset resolves to finite, in-range channels", chanErr === "", chanErr);

/* out animation: rides the same text entry; absent = byte-identical */
const outT: Template = {
  ...mpT,
  tracks: {
    ...mpT.tracks,
    overlay: mpT.tracks.overlay.map((s) => ({
      ...s,
      out: { preset: "text.fade_out", version: 1 },
    })),
  },
};
const outEntry = resolve(outT, content, PRESET_MAP).entries.find((x) => x.kind === "text");
check("out animation rides the same text entry",
  !!outEntry?.params.out && finiteTree(outEntry.params.out));
check("out entry still carries its in-animation params",
  !!outEntry?.params.inFrac && outEntry.params.value !== undefined);
check("no out ref = no out params (byte-compatible)",
  resolve(mpT, content, PRESET_MAP).entries
    .filter((x) => x.kind === "text")
    .every((x) => x.params.out === undefined));
const vBadOut = validateTemplate(
  { ...outT, tracks: { ...outT.tracks, overlay: outT.tracks.overlay.map((s) => ({ ...s, out: { preset: "text.nope", version: 1 } })) } },
  PRESET_MAP,
);
check("unknown exit preset is blocked (V4)",
  vBadOut.template === undefined && vBadOut.issues.some((i) => i.rule === "V4"),
  vBadOut.issues.map((i) => i.message).join("; "));
const vGoodOut = validateTemplate(outT, PRESET_MAP);
check("a known exit passes validation clean", vGoodOut.issues.length === 0,
  vGoodOut.issues.map((i) => i.message).join("; "));
check("classic presets stay resolvable (legacy schedule shape kept)",
  (() => {
    const e = resolve(mpT, content, PRESET_MAP).entries.find((x) => x.kind === "text");
    return e?.do !== undefined && e.params.mode !== undefined;
  })());

/* ---------- 14. Video-animation catalog + resolve flow (D44) ---------- */
console.log("\n[14] Video-animation catalog (D44)");

check("vanim preset ids are unique",
  new Set(VANIM_PRESETS.map((p) => p.id)).size === VANIM_PRESETS.length,
  String(VANIM_PRESETS.length));
check("catalog covers all 28 families (>= 65 presets)",
  VANIM_PRESETS.length >= 65 && VANIM_FAMILIES.length === 28,
  `${VANIM_PRESETS.length} presets / ${VANIM_FAMILIES.length} families`);
const vFamIds = new Set(VANIM_FAMILIES.map((f) => f.id));
check("every vanim preset is a block preset in a listed family",
  VANIM_PRESETS.every(
    (p) => p.kind === "block" && p.id.startsWith("vanim.") &&
      p.tags.length > 0 && vFamIds.has(p.tags[0]),
  ),
  VANIM_PRESETS.filter((p) => !vFamIds.has(p.tags[0])).map((p) => p.id).join(","));
check("every family is used by at least one vanim preset",
  VANIM_FAMILIES.every((f) => VANIM_PRESETS.some((p) => p.tags[0] === f.id)),
  VANIM_FAMILIES.filter((f) => !VANIM_PRESETS.some((p) => p.tags[0] === f.id)).map((f) => f.id).join(","));
let vErr = "";
for (const p of VANIM_PRESETS) {
  const r = p.resolve({});
  if (!finiteTree(r)) vErr += `${p.id}:nonfinite; `;
  if (r.op === undefined && r.tm === undefined) vErr += `${p.id}:no-op-or-tm; `;
  if (r.inFrac !== undefined && !(typeof r.inFrac === "number" && r.inFrac > 0 && r.inFrac <= 1))
    vErr += `${p.id}:inFrac; `;
}
check("every vanim preset resolves to finite params", vErr === "", vErr);

/* resolve flow: a slot with a vanim becomes a slot treatment entry */
const vanimT: Template = {
  ...mpT,
  tracks: {
    ...mpT.tracks,
    media: mpT.tracks.media.map((s, i) =>
      i === 0
        ? { ...s, blockPresets: [{ preset: "vanim.shatter_in", version: 1 }] }
        : s,
    ),
  },
};
const vSched = resolve(vanimT, content, PRESET_MAP);
const vEntry = vSched.entries.find(
  (e) => e.kind === "effect" && e.do.startsWith("vanim."),
);
const vSlot0 = vanimT.tracks.media[0];
check("vanim slot resolves to a treatment entry spanning the slot",
  !!vEntry && vEntry.target === vSlot0.id &&
    near(vEntry.t, 0) &&
    near(vEntry.dur, vSlot0.dur),
  vEntry ? `t=${vEntry.t} dur=${vEntry.dur}` : "no entry");
check("treatment carries concrete op params", !!vEntry && vEntry.params.op === "shatter");
check("no vanim ref = no vanim entries (byte-compatible)",
  resolve(mpT, content, PRESET_MAP).entries
    .every((e) => !(e.kind === "effect" && e.do.startsWith("vanim."))));
const tmT: Template = {
  ...vanimT,
  tracks: {
    ...vanimT.tracks,
    media: vanimT.tracks.media.map((s, i) =>
      i === 0 ? { ...s, blockPresets: [{ preset: "vanim.freeze", version: 1 }] } : s,
    ),
  },
};
const tmEntry = resolve(tmT, content, PRESET_MAP).entries.find(
  (e) => e.kind === "effect" && e.do.startsWith("vanim."),
);
check("time-map preset resolves with tm params and no pixel op",
  !!tmEntry && tmEntry.params.tm === "freeze" && tmEntry.params.op === undefined);
const vBadVanim = validateTemplate(
  {
    ...vanimT,
    tracks: {
      ...vanimT.tracks,
      media: vanimT.tracks.media.map((s, i) =>
        i === 0
          ? { ...s, blockPresets: [{ preset: "vanim.nope", version: 1 }] }
          : s,
      ),
    },
  },
  PRESET_MAP,
);
check("unknown vanim preset is blocked (V4)",
  vBadVanim.template === undefined && vBadVanim.issues.some((i) => i.rule === "V4"),
  vBadVanim.issues.map((i) => i.message).join("; "));
const vOkVanim = validateTemplate(vanimT, PRESET_MAP);
check("a known vanim passes validation clean", vOkVanim.issues.length === 0,
  vOkVanim.issues.map((i) => i.message).join("; "));

/* ---------- 15. Light-filter catalog + resolve flow (D45) ---------- */
console.log("\n[15] Light-filter catalog (D45)");

check("filter preset ids are unique",
  new Set(FILTER_PRESETS.map((p) => p.id)).size === FILTER_PRESETS.length,
  String(FILTER_PRESETS.length));
check("catalog is the curated set across 3 families",
  FILTER_PRESETS.length >= 14 && FILTER_FAMILIES.length === 3,
  `${FILTER_PRESETS.length} presets / ${FILTER_FAMILIES.length} families`);
const fFamIds = new Set(FILTER_FAMILIES.map((f) => f.id));
check("every filter is a block preset in a listed family",
  FILTER_PRESETS.every(
    (p) => p.kind === "block" && p.id.startsWith("filter.") &&
      p.tags.length > 0 && fFamIds.has(p.tags[0]),
  ),
  FILTER_PRESETS.filter((p) => !fFamIds.has(p.tags[0])).map((p) => p.id).join(","));
check("every filter family is used by at least one preset",
  FILTER_FAMILIES.every((f) => FILTER_PRESETS.some((p) => p.tags[0] === f.id)));
let fErr = "";
for (const p of FILTER_PRESETS) {
  const r = p.resolve({});
  if (!finiteTree(r)) fErr += `${p.id}:nonfinite; `;
  for (const k of ["b", "c", "s"]) {
    const v = r[k];
    if (v !== undefined && !(typeof v === "number" && v >= 0 && v <= 2.5))
      fErr += `${p.id}:${k}; `;
  }
  if (r.sep !== undefined && !(typeof r.sep === "number" && r.sep >= 0 && r.sep <= 1))
    fErr += `${p.id}:sep; `;
  if (r.hue !== undefined && !(typeof r.hue === "number" && Math.abs(r.hue) <= 60))
    fErr += `${p.id}:hue; `;
}
check("every filter resolves to in-range canvas numbers", fErr === "", fErr);

/* template-wide look → every slot's media entry carries it */
const lookT: Template = { ...mpT, look: { preset: "filter.brighten", amount: 1 } };
const lShows = resolve(lookT, content, PRESET_MAP).entries.filter(
  (e) => e.kind === "media" && e.do === "show",
);
check("template look stamps every slot's media entry",
  lShows.length === mpT.tracks.media.length &&
    lShows.every((e) => e.params.filter?.b === 1.28 && e.params.filter?.c === 1.02),
  lShows.map((e) => JSON.stringify(e.params.filter)).join(" | "));
check("identity components stay clean at full strength",
  lShows.every((e) => e.params.filter?.s === 1 && e.params.filter?.sep === 0 && e.params.filter?.hue === 0));
const hShow = resolve(
  { ...mpT, look: { preset: "filter.brighten", amount: 0.5 } },
  content,
  PRESET_MAP,
).entries.find((e) => e.kind === "media" && e.do === "show");
check("intensity 50% = half the push (b 1.14)",
  near(hShow?.params.filter?.b ?? -1, 1.14),
  String(hShow?.params.filter?.b));

/* slot override wins; slot off = none; absent = untouched */
const ovrT: Template = {
  ...mpT,
  look: { preset: "filter.brighten", amount: 1 },
  tracks: {
    ...mpT.tracks,
    media: mpT.tracks.media.map((s, i) =>
      i === 0
        ? { ...s, filter: { preset: "filter.golden_hour", amount: 0.5 } }
        : s,
    ),
  },
};
const oShows = resolve(ovrT, content, PRESET_MAP).entries.filter(
  (e) => e.kind === "media" && e.do === "show",
);
check("slot's own filter beats the template look",
  near(oShows[0]?.params.filter?.sep ?? -1, 0.16) &&
    near(oShows[0]?.params.filter?.b ?? -1, 1.06),
  JSON.stringify(oShows[0]?.params.filter));
check("other slots keep the template look",
  oShows.slice(1).every((e) => e.params.filter?.b === 1.28));
const offT: Template = {
  ...lookT,
  tracks: {
    ...lookT.tracks,
    media: lookT.tracks.media.map((s, i) => (i === 0 ? { ...s, filter: null } : s)),
  },
};
const offShows = resolve(offT, content, PRESET_MAP).entries.filter(
  (e) => e.kind === "media" && e.do === "show",
);
check('slot "no filter" turns the template look off for that slot',
  offShows[0]?.params.filter === undefined &&
    offShows.slice(1).every((e) => e.params.filter?.b === 1.28));
check("no look anywhere = no filter params (byte-compatible)",
  resolve(mpT, content, PRESET_MAP).entries
    .filter((e) => e.kind === "media" && e.do === "show")
    .every((e) => e.params.filter === undefined));

/* V9 */
const vBadLook = validateTemplate(
  { ...mpT, look: { preset: "filter.nope", amount: 1 } },
  PRESET_MAP,
);
check("unknown template look is blocked (V9)",
  vBadLook.template === undefined && vBadLook.issues.some((i) => i.rule === "V9"),
  vBadLook.issues.map((i) => i.message).join("; "));
const vBadAmt = validateTemplate(
  { ...mpT, look: { preset: "filter.brighten", amount: 2 } },
  PRESET_MAP,
);
check("look intensity > 1 is blocked (V9)",
  vBadAmt.template === undefined && vBadAmt.issues.some((i) => i.rule === "V9"));
const vBadSlotF = validateTemplate(
  {
    ...mpT,
    tracks: {
      ...mpT.tracks,
      media: mpT.tracks.media.map((s, i) =>
        i === 0 ? { ...s, filter: { preset: "filter.nope", amount: 0.5 } } : s,
      ),
    },
  },
  PRESET_MAP,
);
check("unknown slot filter is blocked (V9)",
  vBadSlotF.template === undefined && vBadSlotF.issues.some((i) => i.rule === "V9"));
const vOkF = validateTemplate(offT, PRESET_MAP);
check("slot filter null (explicit off) passes validation clean",
  vOkF.issues.length === 0, vOkF.issues.map((i) => i.message).join("; "));

/* ---------- 16. Sticker & logo overlays (D46) ---------- */
console.log("\n[16] Sticker & logo overlays (D46)");

check("sticker asset ids are unique",
  new Set(STICKER_ASSETS.map((a) => a.id)).size === STICKER_ASSETS.length,
  String(STICKER_ASSETS.length));
check("emoji stickers carry glyphs, drawn shapes do not",
  STICKER_ASSETS.every((a) =>
    a.group === "emoji"
      ? typeof a.glyph === "string" && a.glyph.length > 0
      : a.glyph === undefined));
check("sticker set covers both groups",
  STICKER_ASSETS.some((a) => a.group === "emoji") &&
    STICKER_ASSETS.some((a) => a.group === "shape"));

const imT: Template = {
  ...mpT,
  tracks: {
    ...mpT.tracks,
    images: [
      {
        id: "im1", type: "image", time: [0, 3], layer: 20,
        source: { kind: "sticker", sticker: "emoji.fire", tone: "#FFFFFF" },
        x: 0.5, y: 0.14, size: 0.18, rotation: 0, opacity: 1,
      },
      {
        id: "im2", type: "image", time: [0, 3], layer: 21,
        source: { kind: "logo", data: "data:image/png;base64,AAAA" },
        x: 0.8, y: 0.1, size: 0.2, rotation: -12, opacity: 0.8,
      },
    ],
  },
};
const imEntries = resolve(imT, content, PRESET_MAP).entries.filter(
  (e) => e.kind === "image",
);
check("image overlays resolve to entries with their geometry",
  imEntries.length === 2 &&
    imEntries.every(
      (e) => e.do === "show" &&
        typeof e.params.x === "number" && typeof e.params.size === "number" &&
        typeof e.params.source === "object",
    ) &&
    near(imEntries[1].t, 0) &&
    near(imEntries[1].dur, 3),
  imEntries.map((e) => `${e.target}@${e.t}+${e.dur}`).join(","));
check("no images = no image entries (byte-compatible)",
  resolve(mpT, content, PRESET_MAP).entries.every((e) => e.kind !== "image"));

const vBadSticker = validateTemplate(
  {
    ...imT,
    tracks: {
      ...imT.tracks,
      images: imT.tracks.images!.map((s, i) =>
        i === 0 ? { ...s, source: { kind: "sticker", sticker: "sticker.nope" } } : s,
      ),
    },
  },
  PRESET_MAP,
);
check("unknown sticker is blocked (V10)",
  vBadSticker.template === undefined &&
    vBadSticker.issues.some((i) => i.rule === "V10"));
const vBadLogo = validateTemplate(
  {
    ...imT,
    tracks: {
      ...imT.tracks,
      images: imT.tracks.images!.map((s, i) =>
        i === 1 ? { ...s, source: { kind: "logo", data: "not-a-data-url" } } : s,
      ),
    },
  },
  PRESET_MAP,
);
check("logo without embedded data is blocked (V10)",
  vBadLogo.template === undefined && vBadLogo.issues.some((i) => i.rule === "V10"));
const vBadX = validateTemplate(
  {
    ...imT,
    tracks: {
      ...imT.tracks,
      images: imT.tracks.images!.map((s, i) => (i === 0 ? { ...s, x: 1.4 } : s)),
    },
  },
  PRESET_MAP,
);
check("off-canvas position is blocked (V10)",
  vBadX.template === undefined && vBadX.issues.some((i) => i.rule === "V10"));
const vOkIm = validateTemplate(imT, PRESET_MAP);
check("valid overlays pass validation clean", vOkIm.issues.length === 0,
  vOkIm.issues.map((i) => i.message).join("; "));
check("templates without images stay clean",
  validateTemplate(mpT, PRESET_MAP).issues.length === 0);

/* ---------- 17. Fonts & typography (D47) ---------- */
console.log("\n[17] Fonts & typography (D47)");

check("font family ids are unique",
  new Set(FONT_FACES.map((f) => f.name)).size === FONT_FACES.length,
  String(FONT_FACES.length));
check("every font family has sane loaded weights",
  FONT_FACES.every(
    (f) => f.weights.length > 0 && f.weights.every((w) => w >= 100 && w <= 900),
  ));
check("every font group has faces",
  FONT_GROUPS.every((g) => FONT_FACES.some((f) => f.group === g.id)));
check("typography presets are unique and reference real fonts",
  new Set(TYPOGRAPHY_PRESETS.map((p) => p.id)).size ===
    TYPOGRAPHY_PRESETS.length &&
    TYPOGRAPHY_PRESETS.every((p) => {
      const face = fontFace(p.font);
      return (
        face !== undefined &&
        face.weights.includes(p.weight) &&
        p.tracking >= -0.05 &&
        p.tracking <= 0.5
      );
    }),
  String(TYPOGRAPHY_PRESETS.length));
check("nearestWeight clamps to the face's loaded weights",
  nearestWeight(fontFace("Pacifico"), 800) === 400 &&
    nearestWeight(fontFace("Inter"), 850) === 900 &&
    nearestWeight(fontFace("Manrope"), 900) === 800);

const tyT: Template = {
  ...mpT,
  tracks: {
    ...mpT.tracks,
    overlay: mpT.tracks.overlay.map((tx, i) =>
      i === 0
        ? {
            ...tx,
            style: {
              ...tx.style,
              fontFamily: "Anton",
              weight: 400,
              tracking: 0.04,
              xRel: 0.3,
              uppercase: true,
            },
          }
        : tx,
    ),
  },
};
const tyEntry = resolve(tyT, content, PRESET_MAP).entries.find(
  (e) => e.kind === "text",
);
const tyStyle = (tyEntry?.params.style ?? {}) as {
  fontFamily?: string;
  xRel?: number;
  tracking?: number;
};
check("typography + x position flow into the text entry",
  tyStyle.fontFamily === "Anton" &&
    tyStyle.xRel === 0.3 &&
    tyStyle.tracking === 0.04,
  JSON.stringify(tyStyle));
const oldEntry = resolve(mpT, content, PRESET_MAP).entries.find(
  (e) => e.kind === "text",
);
const oldStyle = (oldEntry?.params.style ?? {}) as Record<string, unknown>;
check("old styles keep no xRel/tracking (byte-compatible)",
  oldStyle.xRel === undefined && oldStyle.tracking === undefined);

const vBadFont = validateTemplate(
  {
    ...tyT,
    tracks: {
      ...tyT.tracks,
      overlay: tyT.tracks.overlay.map((tx, i) =>
        i === 0 ? { ...tx, style: { ...tx.style, fontFamily: "Not A Font" } } : tx,
      ),
    },
  },
  PRESET_MAP,
);
check("unknown font is blocked (V11)",
  vBadFont.template === undefined && vBadFont.issues.some((i) => i.rule === "V11"));
const vBigSize = validateTemplate(
  {
    ...mpT,
    tracks: {
      ...mpT.tracks,
      overlay: mpT.tracks.overlay.map((tx, i) =>
        i === 0 ? { ...tx, style: { ...tx.style, sizeRel: 0.6 } } : tx,
      ),
    },
  },
  PRESET_MAP,
);
check("oversized text is blocked (V11)",
  vBigSize.template === undefined && vBigSize.issues.some((i) => i.rule === "V11"));
const vTyX = validateTemplate(
  {
    ...mpT,
    tracks: {
      ...mpT.tracks,
      overlay: mpT.tracks.overlay.map((tx, i) =>
        i === 0 ? { ...tx, style: { ...tx.style, xRel: 1.4 } } : tx,
      ),
    },
  },
  PRESET_MAP,
);
check("off-canvas text position is blocked (V11)",
  vTyX.template === undefined && vTyX.issues.some((i) => i.rule === "V11"));
const vOkTy = validateTemplate(tyT, PRESET_MAP);
check("valid typography passes validation clean", vOkTy.issues.length === 0,
  vOkTy.issues.map((i) => i.message).join("; "));

/* ---------- 18. Media workbench length in seconds (D49) ---------- */
console.log("\n[18] Media workbench length (D49)");

/* the workbench takes the clip's own duration, capped by the 300s budget */
const capOf = (clip: number, others: number): number =>
  Math.max(1, Math.min(clip, MAX_TOTAL_SEC - others));
check("clip shorter than the room fills the slot as-is",
  capOf(7.5, 30) === 7.5, String(capOf(7.5, 30)));
check("clip capped by the remaining 300s budget",
  capOf(40.3, 270) === 30, String(capOf(40.3, 270)));
check("the cap never returns a slot below 1s",
  capOf(0.4, 299.5) === 1, String(capOf(0.4, 299.5)));
check("a full-budget slot still yields the 1s floor",
  capOf(50, 300) === 1, String(capOf(50, 300)));

/* ---------- 19. Timeline strip + cut-view math (Steps 2–3) ---------- */
console.log("\n[19] Timeline strip + cut-view math (Steps 2–3)");

check("starts are cumulative & gap-free",
  JSON.stringify(timelineStarts([10, 4, 1.5])) === JSON.stringify([0, 10, 14]),
  JSON.stringify(timelineStarts([10, 4, 1.5])));
check("empty chain → no starts", timelineStarts([]).length === 0);

/* interior grip: ripple — seconds move between the two neighbours */
const rip = trimAtBoundary([10, 10], 1, 12);
check("interior grip ripples seconds between the two slots",
  JSON.stringify(rip.durs) === JSON.stringify([12, 8]) && near(rip.pos, 12),
  JSON.stringify(rip.durs));
const ripSum = rip.durs.reduce((a, b) => a + b, 0);
check("ripple never changes the total", Math.abs(ripSum - 20) < 1e-9, String(ripSum));
const ripLow = trimAtBoundary([10, 10], 1, -5);
check("interior grip clamps at the 1s floor",
  ripLow.durs[0] === 1 && ripLow.durs[1] === 19, JSON.stringify(ripLow.durs));
const ripHigh = trimAtBoundary([10, 10], 1, 99);
check("interior grip clamps at the 1s ceiling for the right slot",
  ripHigh.durs[0] === 19 && ripHigh.durs[1] === 1 && near(ripHigh.pos, 19),
  JSON.stringify(ripHigh.durs));
check("drag positions snap to 0.1s",
  near(trimAtBoundary([10, 10], 1, 12.34).pos, 12.3),
  String(trimAtBoundary([10, 10], 1, 12.34).pos));

/* the end grip: the only drag that changes the total (inside 60s) */
const endGrow = trimAtBoundary([10, 10], 2, 30);
check("end grip grows the chain to the dragged length",
  JSON.stringify(endGrow.durs) === JSON.stringify([10, 20]) && near(endGrow.pos, 30),
  JSON.stringify(endGrow.durs));
const endCap = trimAtBoundary([10, 10], 2, 99);
check("end grip stops at the total cap (V12 unreachable from the strip)",
  endCap.durs.reduce((a, b) => a + b, 0) <= MAX_TOTAL_SEC + 1e-9,
  String(endCap.durs.reduce((a, b) => a + b, 0)));
const endMin = trimAtBoundary([10, 10], 2, 3);
check("end grip never shrinks the last slot below 1s",
  endMin.durs[1] === 1 && near(endMin.pos, 11), JSON.stringify(endMin.durs));
check("boundary 0 is treated as the first cut (the chain starts at 0)",
  JSON.stringify(trimAtBoundary([10, 10], 0, 14).durs) ===
    JSON.stringify(trimAtBoundary([10, 10], 1, 14).durs));
check("no slot ever drops below the 1s floor on a longer chain",
  trimAtBoundary([6, 6, 6], 2, 3).durs.every((d) => d >= MIN_SLOT_SEC - 1e-9),
  JSON.stringify(trimAtBoundary([6, 6, 6], 2, 3).durs));
check("trim keeps the chain gap-free (starts recompute contiguously)",
  (() => {
    const durs = trimAtBoundary([6, 6, 6], 2, 12).durs;
    const st = timelineStarts(durs);
    return st[1] === durs[0] && st[2] === durs[0] + durs[1];
  })(),
  JSON.stringify(timelineStarts(trimAtBoundary([6, 6, 6], 2, 12).durs)));

/* --- the cut view (Step 3): the in-point range of a slot-locked window --- */
const clipOf = (isVideo: boolean, duration: number): ProbedMedia =>
  ({ isVideo, duration }) as unknown as ProbedMedia;
check("cut window slides the whole spare length (40.3s clip, 10s slot)",
  near(maxTrimStart(clipOf(true, 40.3), 10), 30.3),
  String(maxTrimStart(clipOf(true, 40.3), 10)));
check("a clip shorter than its slot has nothing to cut",
  maxTrimStart(clipOf(true, 7.5), 10) === 0);
check("an exactly-fitting clip has nothing to cut",
  maxTrimStart(clipOf(true, 10), 10) === 0);
check("photos are never cut (full clip, whole slot)",
  maxTrimStart(clipOf(false, Infinity), 10) === 0);

/* ---------- 20. On-device ffmpeg prep (Step 4) ---------- */
console.log("\n[20] On-device ffmpeg prep (Step 4)");

/* the conversion command — pure, exact, no scaling */
const cvArgs = convertArgs("in.mov", OUT_NAME);
check("convert keeps input and output in the right places",
  cvArgs[0] === "-i" && cvArgs[1] === "in.mov" && cvArgs[cvArgs.length - 1] === OUT_NAME,
  cvArgs.join(" "));
check("convert targets H.264 yuv420p — decodes in every phone browser",
  cvArgs.includes("libx264") && cvArgs.includes("yuv420p"));
check("convert keeps audio as AAC (\"Keep original sound\" survives\")",
  cvArgs.includes("aac"));
check("convert is seek-friendly (faststart)",
  cvArgs.includes("+faststart"));
check("convert never scales — the user's resolution is untouched",
  !cvArgs.some((a) => a.includes("scale") || a === "-vf"),
  cvArgs.filter((a) => a.includes("scale") || a === "-vf").join(","));
check("MEMFS names are derived, never typed",
  inNameFor("CLIP.MOV") === "in.mov" &&
    inNameFor("noext") === "in.mp4" &&
    convertedName("my clip.webm") === "my clip.mp4",
  `${inNameFor("CLIP.MOV")} / ${inNameFor("noext")} / ${convertedName("my clip.webm")}`);

/* the vendored, self-hosted core (public/ffmpeg) — a real file gate */
const coreDir = new URL("../public/ffmpeg/", import.meta.url);
const coreJsUrl = new URL("ffmpeg-core.js", coreDir);
const coreWasmUrl = new URL("ffmpeg-core.wasm", coreDir);
check("the single-threaded core is vendored in public/ffmpeg",
  existsSync(coreJsUrl) && existsSync(coreWasmUrl),
  `js=${existsSync(coreJsUrl)} wasm=${existsSync(coreWasmUrl)}`);
const wasmBytes = readFileSync(coreWasmUrl);
check("the core wasm is real WebAssembly (%wasm magic)",
  wasmBytes[0] === 0x00 && wasmBytes[1] === 0x61 &&
    wasmBytes[2] === 0x73 && wasmBytes[3] === 0x6d,
  `${wasmBytes[0]} ${wasmBytes[1]} ${wasmBytes[2]} ${wasmBytes[3]}`);
check("the core wasm isn't truncated (~31MB)",
  wasmBytes.length > 20 * 1024 * 1024, String(wasmBytes.length));
const coreSrc = readFileSync(coreJsUrl, "utf8");
check("the core js is the ESM flavor (the module-worker path)",
  coreSrc.includes("export default") && coreSrc.includes("import.meta.url"));
check("the core js isn't truncated", coreSrc.length > 50_000, String(coreSrc.length));
// genuine gate: load it as a real ES module (parses + evaluates the factory
// without invoking wasm). new Function can't — it rejects import.meta/export.
{
  let factory: unknown = null;
  try {
    const mod = (await import(coreJsUrl.href)) as { default?: unknown };
    factory = mod.default;
  } catch {
    factory = null;
  }
  check("the core js loads as an ES module with an async factory",
    typeof factory === "function", typeof factory);
}

/* ---------- 21. MediaRecorder-free export (WebCodecs → ffmpeg.wasm) ---------- */
console.log("\n[21] MediaRecorder-free export (WebCodecs → ffmpeg.wasm)");

/* the fallback frame-sequence command — software H.264, never MediaRecorder */
const fsArgs = frameSequenceArgs(24, true);
check("fallback reads a numbered JPEG sequence",
  fsArgs.includes("f%05d.jpg") && fsArgs.includes("24") && fsArgs.includes("-start_number"),
  fsArgs.join(" "));
check("fallback encodes software H.264 yuv420p → MP4",
  fsArgs.includes("libx264") && fsArgs.includes("yuv420p") && fsArgs[fsArgs.length - 1] === OUT_NAME);
check("fallback muxes WAV audio as AAC and stops at the shortest stream",
  fsArgs.includes("audio.wav") && fsArgs.includes("aac") && fsArgs.includes("-shortest"));
check("silent fallback omits the audio input entirely",
  !frameSequenceArgs(24, false).includes("audio.wav"));
check("fallback is seek-friendly and never references MediaRecorder/WebM",
  fsArgs.includes("+faststart") && !fsArgs.some((a) => a.toLowerCase().includes("webm")));

/* the WAV byte layout (offline mix → ffmpeg audio input) */
const wav = encodePcm16Wav([Float32Array.from([0, 0.5, -1, 1])], 48000);
const wv = new DataView(wav);
const tag = (o: number, n: number) =>
  String.fromCharCode(...Array.from({ length: n }, (_, i) => wv.getUint8(o + i)));
check("wav has RIFF/WAVE/fmt/data headers",
  tag(0, 4) === "RIFF" && tag(8, 4) === "WAVE" && tag(12, 4) === "fmt " && tag(36, 4) === "data",
  `${tag(0, 4)} ${tag(8, 4)} ${tag(12, 4)} ${tag(36, 4)}`);
check("wav is 16-bit PCM mono @ the sample rate",
  wv.getUint16(20, true) === 1 && wv.getUint16(22, true) === 1 &&
    wv.getUint32(24, true) === 48000 && wv.getUint16(34, true) === 16);
check("wav data length matches frames × channels × 2 bytes",
  wv.getUint32(40, true) === 4 * 1 * 2 && wav.byteLength === 44 + 4 * 1 * 2,
  `${wv.getUint32(40, true)} / ${wav.byteLength}`);
check("wav clamps and scales samples into int16",
  wv.getInt16(44, true) === 0 && wv.getInt16(46, true) > 0 &&
    wv.getInt16(48, true) === -32768 && wv.getInt16(50, true) === 32767,
  `${wv.getInt16(44, true)} ${wv.getInt16(46, true)} ${wv.getInt16(48, true)} ${wv.getInt16(50, true)}`);

/* ---------- 22. Background plate + independent text duration ---------- */
console.log("\n[22] Background plate + independent text duration");

/* the plain black/white plate threads from the template into the resolved meta */
const tBgBase = get("tpl.mini_punch");
check("meta.background defaults to black",
  resolve(tBgBase, content, PRESET_MAP).meta.background === "black");
check("meta.background threads through when set to white",
  resolve({ ...tBgBase, background: "white" } as Template, content, PRESET_MAP)
    .meta.background === "white");
check("a legacy gradient flag no longer produces a gradient (falls back to black)",
  resolve({ ...tBgBase, showBackground: true } as Template, content, PRESET_MAP)
    .meta.background === "black");

/* a text's window is its OWN seconds — decoupled from the slot length
   (mini_punch's slots are 1.5/1/1.5; a 2s text must stay 2s) */
const soloTextTpl: Template = {
  ...tBgBase,
  tracks: {
    ...tBgBase.tracks,
    overlay: [
      {
        id: "tx1",
        type: "text",
        time: [0, 2],
        layer: 10,
        default: "HI",
        textPreset: "text.pop",
        version: 1,
        allowedControls: ["value"],
        style: {
          fontFamily: "Inter",
          weight: 700,
          sizeRel: 0.065,
          color: "#FFFFFF",
          align: "center",
          yRel: 0.76,
        },
      },
    ],
  },
};
const soloText = resolve(soloTextTpl, content, PRESET_MAP).entries.find((e) => e.kind === "text");
check("text lasts only its own window (2s), not a slot",
  !!soloText && near(soloText.t, 0) && near(soloText.dur, 2),
  soloText ? `t=${soloText.t} dur=${soloText.dur}` : "missing");

/* ---------- 23. Auto-direct engine (the director) ---------- */
console.log("\n[23] Auto-direct engine");

/* plain slot shape — the same fields SlotDraft carries */
type DirSlot = {
  dur: number;
  effect: string;
  vanim: string;
  filterSel: string;
  filterAmount: number;
  transitionIn: string;
  soundCut: string;
  soundEffect: string;
  soundTransition: string;
};
const mkDirSlot = (dur = 10): DirSlot => ({
  dur,
  effect: "none",
  vanim: "none",
  filterSel: "template",
  filterAmount: 0.7,
  transitionIn: presetKey("transition.dissolve", 1),
  soundCut: "none",
  soundEffect: "auto",
  soundTransition: "auto",
});
const photo: MediaInfo = { isVideo: false, duration: 0 };
const vid = (duration: number): MediaInfo => ({ isVideo: true, duration });

/* durations: punchy photos on the 0.5s grid, video windows inside the clip */
const phOut = directDurations(
  Array.from({ length: 12 }, () => mkDirSlot()),
  Array.from({ length: 12 }, () => photo),
);
check("photos land 1–3s on the 0.5s grid",
  phOut.slots.every(
    (s) =>
      s.dur >= PHOTO_SEC_MIN &&
      s.dur <= PHOTO_SEC_MAX &&
      Math.abs(s.dur * 2 - Math.round(s.dur * 2)) < 1e-9,
  ));
check("photo trims start at 0", phOut.trims.every((t) => t === 0));
const vOut = directDurations(
  Array.from({ length: 12 }, () => mkDirSlot()),
  Array.from({ length: 12 }, () => vid(30)),
);
check("video windows land 3–5s",
  vOut.slots.every((s) => s.dur >= VIDEO_SEC_MIN && s.dur <= VIDEO_SEC_MAX));
check("video trims stay inside the clip",
  vOut.slots.every(
    (s, i) =>
      (vOut.trims[i] ?? 0) >= 0 && (vOut.trims[i] ?? 0) + s.dur <= 30 + 1e-9,
  ));
const shortClip = directDurations([mkDirSlot()], [vid(2)]);
check("a clip shorter than its window plays in full",
  shortClip.slots[0].dur === 2, String(shortClip.slots[0].dur));

/* the budget + the scope rule — 200 slots must clamp (their 1s floor is
   200s, so 300s is reachable); a 400-slot chain would be mathematically
   unclampeable and is impossible in-app (add-slot needs 1s of room) */
const clamped = directDurations(
  Array.from({ length: 200 }, () => mkDirSlot(10)),
  Array.from({ length: 200 }, () => photo),
);
check("a huge chain clamps into the 300s budget",
  clamped.slots.reduce((a, s) => a + s.dur, 0) <= MAX_TOTAL_SEC + 1e-9);
check("clamped slots keep the 1s floor",
  clamped.slots.every((s) => s.dur >= MIN_SLOT_SEC));
const scoped = directDurations(
  [mkDirSlot(7), mkDirSlot(9)],
  [photo, photo],
  { only: [1] },
);
check("a scoped batch never touches other slots",
  scoped.slots[0].dur === 7 &&
    scoped.slots[1].dur >= PHOTO_SEC_MIN &&
    scoped.slots[1].dur <= PHOTO_SEC_MAX);

/* transitions: a real preset on every cut, never one identical cut */
const seams = directTransitions(Array.from({ length: 6 }, () => mkDirSlot()));
const seamKeys = new Set(TRANSITIONS.map((p) => presetKey(p.id, p.version)));
check("every cut gets a real transition preset",
  seams.every((s) => seamKeys.has(s.transitionIn)));
check("a full chain never lands on one identical cut",
  new Set(seams.slice(1).map((s) => s.transitionIn)).size > 1);

/* sounds: sparse (D58) — a few strong moments, the rest silent */
const sfxById = new Map(SFX_LIBRARY.map((d) => [d.id, d]));
const fxKey = presetKey(MOTIONS[0].id, MOTIONS[0].version);
const sndOut = directSounds([
  { ...mkDirSlot(), effect: "none" },
  { ...mkDirSlot(), effect: fxKey },
]);
check(
  "a quiet slot's cut sound is honest silence",
  sndOut.every((s) => s.soundCut === "none" || sfxById.get(s.soundCut)?.category === "cuts"),
);
check("transition sounds come from the Transitions category",
  sndOut.every((s) => s.soundTransition === "none" || sfxById.get(s.soundTransition)?.category === "transitions"));
check("a slot with no effect keeps its effect sound on auto",
  sndOut[0].soundEffect === "auto");
check(
  "a slot with an effect never gets a fake Cinematic hit unless it earned one",
  sndOut[1].soundEffect === "auto" || sfxById.get(sndOut[1].soundEffect)?.category === "cinematic",
);

/* the sparsity rule itself, on a long edit (D58) */
const longSnd = directSounds(Array.from({ length: 8 }, () => ({ ...mkDirSlot(), effect: fxKey })));
const hitsOf = (field: "soundCut" | "soundTransition") =>
  longSnd.filter((s) => s[field] !== "none").length;
check("a long edit gets at most 3 cut hits", hitsOf("soundCut") <= SFX_MAX, String(hitsOf("soundCut")));
check("a long edit gets at most 3 transition hits", hitsOf("soundTransition") <= SFX_MAX, String(hitsOf("soundTransition")));
check("slot 0 never takes a cut hit (no cut of its own)", longSnd[0].soundCut === "none");
{
  const cutIdx = longSnd.map((s, i) => (s.soundCut !== "none" ? i : -1)).filter((i) => i >= 0);
  let spaced = true;
  for (let a = 0; a < cutIdx.length; a++)
    for (let b = a + 1; b < cutIdx.length; b++)
      if (cutIdx[b] - cutIdx[a] <= 1) spaced = false;
  check("cut hits are spaced apart, never back-to-back", spaced, cutIdx.join(","));
}

/* look + motion + texts stay inside the catalogs */
const filterIds = new Set(FILTER_PRESETS.map((p) => p.id));
const lookOut = directLook(Array.from({ length: 8 }, () => mkDirSlot()));
check("every look pick is legal (preset / template / off)",
  lookOut.every(
    (s) =>
      s.filterSel === "template" ||
      s.filterSel === "off" ||
      filterIds.has(s.filterSel),
  ));
check(
  "explicit filters sit in the 0.6–1 intensity band",
  lookOut
    .filter((s) => filterIds.has(s.filterSel))
    .every((s) => s.filterAmount >= 0.6 - 1e-9 && s.filterAmount <= 1 + 1e-9),
);
const motionOut = directMotion(Array.from({ length: 8 }, () => mkDirSlot()));
const effectKeys = new Set(
  [...MOTIONS, ...EFFECTS].map((p) => presetKey(p.id, p.version)),
);
const vanimKeys = new Set(VANIM_PRESETS.map((p) => presetKey(p.id, p.version)));
check("motion picks are none or real presets",
  motionOut.every((s) => s.effect === "none" || effectKeys.has(s.effect)) &&
    motionOut.every((s) => s.vanim === "none" || vanimKeys.has(s.vanim)));
const entranceKeys = new Set(
  TEXT_PRESETS.filter((p) => p.tags[0] !== "exit").map((p) =>
    presetKey(p.id, p.version),
  ),
);
const exitKeys = new Set(TEXT_EXITS.map((p) => presetKey(p.id, p.version)));
const textOut = directTexts([
  { anim: "", outAnim: "" },
  { anim: "", outAnim: "" },
]);
check("text anims are legal: an entrance always, an exit or hold",
  textOut.every(
    (t) =>
      entranceKeys.has(t.anim) &&
      (t.outAnim === "" || exitKeys.has(t.outAnim)),
  ));

/* order shuffle + the full pass */
const perm = shuffledIndices(7);
check("shuffle order is a real permutation",
  perm.length === 7 && [...perm].sort((a, b) => a - b).every((v, i) => v === i));
const allOut = directAll(
  Array.from({ length: 4 }, () => mkDirSlot()),
  [photo, vid(30), photo, vid(2)],
);
check("the full pass keeps the budget and the 1s floor",
  allOut.slots.reduce((a, s) => a + s.dur, 0) <= MAX_TOTAL_SEC + 1e-9 &&
    allOut.slots.every((s) => s.dur >= MIN_SLOT_SEC));

/* ---------- 24. Timing — pacing modes + local beat detection ---------- */
console.log("\n[24] Timing — pacing modes + beat detection");

/* fixed duration: every cut the same, never longer than a clip */
const uni = directDurations(
  Array.from({ length: 8 }, () => mkDirSlot()),
  Array.from({ length: 8 }, () => photo),
  { pacing: { kind: "uniform" } },
);
check("fixed pacing makes every photo cut equal",
  uni.slots.every((s) => s.dur === UNIFORM_SEC));
const uniVid = directDurations([mkDirSlot()], [vid(1.4)], {
  pacing: { kind: "uniform" },
});
check("fixed pacing never stretches a clip",
  uniVid.slots[0].dur === 1.4, String(uniVid.slots[0].dur));

/* stagger: cuts tighten from the first length to the last */
const ramp = directDurations(
  Array.from({ length: 6 }, () => mkDirSlot()),
  Array.from({ length: 6 }, () => photo),
  { pacing: { kind: "ramp" } },
);
check("stagger runs from the first length to the last",
  ramp.slots[0].dur === RAMP_START_SEC &&
    ramp.slots[5].dur === RAMP_END_SEC,
  `${ramp.slots[0].dur}..${ramp.slots[5].dur}`);
check("stagger cuts only tighten",
  ramp.slots.every((s, i) => i === 0 || s.dur <= ramp.slots[i - 1].dur + 1e-9));

/* beat sync: whole beats from beat zero */
const bSec = 60 / 120;
const beatsOut = directDurations(
  Array.from({ length: 10 }, () => mkDirSlot()),
  Array.from({ length: 10 }, () => photo),
  { pacing: { kind: "beats", bpm: 120, phase: 0, songStart: 0 } },
);
{
  let cum = 0;
  let onGrid = true;
  for (const s of beatsOut.slots) {
    cum += s.dur;
    if (Math.abs(cum / bSec - Math.round(cum / bSec)) > 1e-6) onGrid = false;
  }
  check("beat sync lands every cut on the beat (120 BPM)", onGrid);
}
check("beat sync keeps the 1s floor",
  beatsOut.slots.every((s) => s.dur >= MIN_SLOT_SEC - 1e-9));
const beatsFast = directDurations(
  Array.from({ length: 6 }, () => mkDirSlot()),
  Array.from({ length: 6 }, () => photo),
  { pacing: { kind: "beats", bpm: 180, phase: 0, songStart: 0 } },
);
check("a 180 BPM song never cuts faster than 1s",
  beatsFast.slots.every((s) => s.dur >= 1 - 1e-9),
  beatsFast.slots.map((s) => s.dur).join(","));
/* a song window starting mid-beat: slot 0 absorbs the offset so every
   later cut still lands exactly on a beat */
const beatsOff = directDurations(
  Array.from({ length: 8 }, () => mkDirSlot()),
  Array.from({ length: 8 }, () => photo),
  { pacing: { kind: "beats", bpm: 120, phase: 0.25, songStart: 1 } },
);
{
  let start = beatsOff.slots[0].dur; // start of slot 1
  let aligned = true;
  for (let i = 1; i < beatsOff.slots.length; i++) {
    if (Math.abs((start - 0.25) / bSec - Math.round((start - 0.25) / bSec)) > 1e-6)
      aligned = false;
    start += beatsOff.slots[i].dur;
  }
  check("slot 1+ starts on beats even with a mid-song window", aligned);
}

/* detection: a synthetic 120 BPM click track, silence, a short buffer */
const SR = 44100;
const click = new Float32Array(SR * 12);
for (let t = 0; t < 12; t += 0.5) {
  const base = Math.round(t * SR);
  for (let i = 0; i < Math.round(0.03 * SR) && base + i < click.length; i++)
    click[base + i] = 0.9 * Math.sin((2 * Math.PI * 1000 * i) / SR);
}
const beat = detectBeat(click, SR);
check("detects a synthetic 120 BPM click track",
  !!beat && Math.abs(beat.bpm - 120) <= 2,
  beat ? `bpm=${beat.bpm.toFixed(2)}` : "null");
check("beat phase lands on the clicks (±50ms)",
  !!beat && beat.phase >= 0 && beat.phase <= 0.05,
  beat ? `phase=${beat.phase.toFixed(3)}` : "null");
check("silence has no beat (honest null)",
  detectBeat(new Float32Array(SR), SR) === null);
check("a too-short buffer gives up honestly",
  detectBeat(new Float32Array(Math.round(SR * 0.4)), SR) === null);

/* ---------- 25. Song segment picker (auto-placement) ---------- */
console.log("\n[25] Song segment picker");

/* a 40s synthetic song: 120 BPM clicks, with a LOUD section at 15–30s */
const segSR = 44100;
const segSong = new Float32Array(segSR * 40);
for (let t = 0; t < 40; t += 0.5) {
  const loud = t >= 15 && t < 30 ? 1 : 0.05;
  const base = Math.round(t * segSR);
  for (
    let i = 0;
    i < Math.round(0.03 * segSR) && base + i < segSong.length;
    i++
  )
    segSong[base + i] =
      loud * 0.9 * Math.sin((2 * Math.PI * 1000 * i) / segSR);
}
const segProfile = songProfile(segSong, segSR);
check("song profile reads the beat out of the song",
  !!segProfile && Math.abs(segProfile.beat.bpm - 120) <= 2,
  segProfile ? `bpm=${segProfile.beat.bpm.toFixed(2)}` : "null");
if (segProfile) {
  const sBeat = 60 / segProfile.beat.bpm;
  const seg = pickSegment(segProfile, 40, 10);
  check("picked segment sits on the beat grid",
    Math.abs(((seg - segProfile.beat.phase) / sBeat) -
      Math.round((seg - segProfile.beat.phase) / sBeat)) < 1e-6,
    String(seg));
  check("picked segment leaves room for the video",
    seg <= 30 + 1e-9, String(seg));
  check("picked segment lands in the song's strong section",
    seg >= 14.5 && seg <= 28.5, String(seg));
  const tight = pickSegment(segProfile, 40, 39);
  check("a nearly-full video still gets a fitting segment",
    tight >= -1e-9 && tight <= 1 + 1e-9, String(tight));
  check("a song shorter than the video falls back to beat zero",
    pickSegment(segProfile, 40, 45) === segProfile.beat.phase);
}
check("no profile → honest start at 0",
  pickSegment(null, 40, 10) === 0);
check("a silent song has no profile",
  songProfile(new Float32Array(segSR), segSR) === null);

/* ---------- 26. Layouts (split screen / collage) ---------- */
console.log("\n[26] Layouts (composition)");

check("layout catalog pane counts",
  paneCount("single") === 1 && paneCount("split-h") === 2 &&
  paneCount("split-v") === 2 && paneCount("collage-3") === 3 &&
  paneCount("collage-4") === 4 &&
  LAYOUTS.length === 5);
check("missing or unknown layout reads as one full-frame pane",
  paneCount(undefined) === 1 && paneCount("quad") === 1);
check("pane 0 keeps the slot's own key",
  paneKey("s3", 0) === "s3" && paneKey("s3", 2) === "s3#2");

for (const lay of ["single", "split-h", "split-v", "collage-3", "collage-4"]) {
  const rects = layoutRects(lay);
  const n = paneCount(lay);
  const inBounds = rects.every(
    (r) =>
      r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9 &&
      r.w > 0 && r.h > 0,
  );
  check(`${lay}: ${n} rect(s), in bounds, positive`, rects.length === n && inBounds);
  let overlap = false;
  for (let a = 0; a < rects.length; a++)
    for (let b = a + 1; b < rects.length; b++) {
      const ra = rects[a];
      const rb = rects[b];
      if (
        ra.x < rb.x + rb.w - 1e-9 && rb.x < ra.x + ra.w - 1e-9 &&
        ra.y < rb.y + rb.h - 1e-9 && rb.y < ra.y + ra.h - 1e-9
      )
        overlap = true;
    }
  check(`${lay}: panes never overlap`, !overlap);
  /* the frame is covered: every sample point sits in a pane or in the
     thin gap between panes (within LAYOUT_GAP of one) */
  let uncovered = 0;
  for (let gx = 0; gx <= 20; gx++)
    for (let gy = 0; gy <= 34; gy++) {
      const px = gx / 20;
      const py = gy / 34;
      const hit = rects.some(
        (r) =>
          px >= r.x - LAYOUT_GAP && px <= r.x + r.w + LAYOUT_GAP &&
          py >= r.y - LAYOUT_GAP && py <= r.y + r.h + LAYOUT_GAP,
      );
      if (!hit) uncovered++;
    }
  check(`${lay}: frame covered (gap-tolerant)`, uncovered === 0,
    `${uncovered} uncovered points`);
}

/* a real template wearing a split layout */
const layT = {
  ...mpT,
  tracks: {
    ...mpT.tracks,
    media: mpT.tracks.media.map((s, i) =>
      i === 0 ? { ...s, layout: "split-h" } : s,
    ),
  },
};
check("a split-screen slot validates",
  validateTemplate(layT, PRESET_MAP).issues.length === 0,
  validateTemplate(layT, PRESET_MAP).issues.map((i) => `${i.rule}:${i.message}`).join("; "));
const badLay = validateTemplate(
  {
    ...mpT,
    tracks: {
      ...mpT.tracks,
      media: mpT.tracks.media.map((s, i) =>
        i === 0 ? { ...s, layout: "quad" } : s,
      ),
    },
  },
  PRESET_MAP,
);
check("an unknown layout is caught (V13)",
  badLay.issues.some((i) => i.rule === "V13"),
  badLay.issues.map((i) => i.rule).join(","));

/* resolve: panes ride the show entry; pane 0's trim is also trimStart */
const layContent: ResolveContent = {
  texts: {},
  trims: { s1: 0.4, "s1#1": 1.2 },
  soundOn: {},
};
const layShow = resolve(layT, layContent, PRESET_MAP).entries.find(
  (e) => e.kind === "media" && e.do === "show",
);
check("split layout rides the show entry with per-pane trims",
  layShow?.params.layout === "split-h" &&
  Array.isArray(layShow?.params.panes) &&
  (layShow?.params.panes as number[]).length === 2 &&
  (layShow?.params.panes as number[])[0] === 0.4 &&
  (layShow?.params.panes as number[])[1] === 1.2 &&
  layShow?.params.trimStart === 0.4,
  JSON.stringify(layShow?.params));
const singleShow = resolve(mpT, content, PRESET_MAP).entries.find(
  (e) => e.kind === "media" && e.do === "show",
);
check("a single slot's entry stays lean (no panes)",
  singleShow?.params.layout === undefined &&
  singleShow?.params.panes === undefined);

/* ---------- 27. Text placement (D57) ---------- */
console.log("\n[27] Text placement");

/* a spread of four texts that all share the screen — they must not clash */
const tShapes: TextShape[] = [
  { x: 0.5, y: 0.5, w: 0.4, h: 0.05, start: 0, dur: 10 },
  { x: 0.5, y: 0.5, w: 0.3, h: 0.04, start: 1, dur: 8 },
  { x: 0.5, y: 0.5, w: 0.35, h: 0.06, start: 2, dur: 6 },
  { x: 0.5, y: 0.5, w: 0.25, h: 0.03, start: 3, dur: 4 },
];
const tPlaced = placeTexts(tShapes);
check("one position per text, in order",
  tPlaced.length === tShapes.length &&
  tPlaced.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
{
  let clash = false;
  for (let a = 0; a < tShapes.length; a++)
    for (let b = a + 1; b < tShapes.length; b++) {
      const A = tShapes[a];
      const B = tShapes[b];
      const sameTime = A.start < B.start + B.dur && B.start < A.start + A.dur;
      if (sameTime &&
          textBoxesClash({ ...tPlaced[a], w: A.w, h: A.h },
                         { ...tPlaced[b], w: B.w, h: B.h }))
        clash = true;
    }
  check("texts visible together never overlap", !clash);
}
check("texts never sit in the top/bottom slivers",
  tPlaced.every((p, i) =>
    p.y - tShapes[i].h >= 0.07 && p.y + tShapes[i].h <= 0.92));

/* texts at different times are free to share a spot */
const tTimed: TextShape[] = [
  { x: 0.5, y: 0.5, w: 0.4, h: 0.05, start: 0, dur: 2 },
  { x: 0.5, y: 0.5, w: 0.4, h: 0.05, start: 4, dur: 2 },
];
const tTimedP = placeTexts(tTimed);
check("non-overlapping texts may reuse a spot",
  tTimedP.every((p) => p.x >= 0 && p.x <= 1));

/* reroll differs (randomness lives here, and only here) */
const tRe = placeTexts(tShapes);
check("a reroll can differ (stored once placed)",
  tRe.length === tShapes.length);

/* the director adds up to the target, keeping existing wording */
type TSeed = { start: number; dur: number; value: string };
const seedText = (s: TSeed) => ({ ...s, look: "center" });
const tDirect = directTextPlacement(
  [{ x: 0.5, y: 0.76, w: 0.4, h: 0.05, start: 0, dur: 10, value: "MY TITLE" }],
  10,
  seedText,
);
check("a lone text grows to the 3–4 target with placeholder copy",
  tDirect.texts.length >= 3 && tDirect.texts.length <= 4);
check("the original text keeps its own words",
  tDirect.texts[0].value === "MY TITLE");
check("added texts get honest placeholder copy, not fake lines",
  tDirect.texts.slice(1).every((t) => t.value.length > 0));
check("added texts stay inside the video's window",
  tDirect.texts.every((t) => t.start >= 0 && t.start + t.dur <= 10 + 1e-9));
check("the target can never exceed the cap",
  directTextPlacement([], 10, seedText, 99).texts.length <= 4);
check("added texts carry the caller's authored fields",
  tDirect.texts.slice(1).every((t) => t.look === "center"));

/* ---------- 28. Bulk upload fit — every picked file must land (D60) ---------- */
console.log("\n[28] Bulk upload fit");
const bulkPhoto50 = Array.from({ length: 50 }, () => ({
  isVideo: false,
  duration: 0,
}));
const fit50 = fitBulkDurs(bulkPhoto50, 0);
check("50 photos into an empty chain: none skipped",
  fit50.skipped === 0 && fit50.durs.length === 50);
check("every photo slot ≥ the 1s floor and ≤ the default slot",
  fit50.durs.every((d) => d >= 1 && d <= 10));
check("the whole batch fits the 300s cap",
  fit50.durs.reduce((a, b) => a + b, 0) <= MAX_TOTAL_SEC + 1e-9);
check("the share is even — no first file eats the budget",
  fit50.durs.every((d) => d === fit50.durs[0]));

const bulkVid50 = Array.from({ length: 50 }, () => ({
  isVideo: true,
  duration: 7,
}));
const fitVid = fitBulkDurs(bulkVid50, 0);
check("50 videos: none skipped",
  fitVid.skipped === 0 && fitVid.durs.length === 50);
check("a video slot never outlives its own clip",
  fitVid.durs.every((d) => d <= 7 + 1e-9));
check("video batch fits the cap",
  fitVid.durs.reduce((a, b) => a + b, 0) <= MAX_TOTAL_SEC + 1e-9);

/* an already-nearly-full chain: even the 1s floor can't fit 50 files —
   the tail is dropped honestly, never a greedy mid-batch cut */
const fitFull = fitBulkDurs(bulkPhoto50, MAX_TOTAL_SEC - 5);
check("a full chain keeps only what the floor allows — the rest is reported",
  fitFull.skipped === 45 && fitFull.durs.length === 5,
  `${fitFull.skipped} skipped / ${fitFull.durs.length} kept`);
check("even then the cap holds",
  fitFull.durs.reduce((a, b) => a + b, 0) + (MAX_TOTAL_SEC - 5) <=
    MAX_TOTAL_SEC + 1e-9);
check("the kept ones sit at the honest floor",
  fitFull.durs.every((d) => d === 1));
check("an empty batch is a no-op",
  fitBulkDurs([], 120).durs.length === 0 && fitBulkDurs([], 120).skipped === 0);

/* ---------- 29. D61 — empty slots never pad the chain + honest file identity ---------- */
console.log("\n[29] Content-only chain & honest restore (D61)");
const d61T = get("tpl.mini_punch");
const d61Ids = d61T.tracks.media.map((s) => s.id);
const onlyFirst = filledMediaTemplate(d61T, (id) => id === d61Ids[0]);
check("a partly-filled template drops every empty slot",
  onlyFirst.tracks.media.length === 1 && onlyFirst.tracks.media[0].id === d61Ids[0],
  `${onlyFirst.tracks.media.length} kept`);
check("the kept slot keeps its own duration",
  onlyFirst.tracks.media[0].dur === d61T.tracks.media[0].dur);
check("dropping slots shortens the chain to the real content",
  resolve(onlyFirst, { texts: {}, trims: {}, soundOn: {} }, PRESET_MAP).duration ===
    d61T.tracks.media[0].dur);
check("an all-empty template keeps its skeleton (library preview)",
  filledMediaTemplate(d61T, () => false) === d61T);
check("an all-filled template is untouched",
  filledMediaTemplate(d61T, () => true) === d61T);
check("the original template is never mutated",
  d61T.tracks.media.length === d61Ids.length);
check("connections to dropped slots never break resolve",
  (() => {
    try {
      resolve(onlyFirst, { texts: {}, trims: {}, soundOn: {} }, PRESET_MAP);
      return true;
    } catch {
      return false;
    }
  })());

/* honest file identity — restore never guesses a type */
check("saved mime wins over everything",
  storedFileMime("video/webm", "video/mp4", "x.mov") === "video/webm");
check("the blob's own type is the second source",
  storedFileMime(undefined, "image/png", "x") === "image/png");
check("extension guess only when both are empty",
  storedFileMime(undefined, "", "clip.MOV") === "video/quicktime" &&
    storedFileMime(undefined, "", "a.mp4") === "video/mp4" &&
    storedFileMime(undefined, "", "p.jpeg") === "image/jpeg");
check("truly unknown files stay honestly unknown",
  storedFileMime(undefined, "", "mystery") === "application/octet-stream");
const d61File = new File([new Uint8Array([1, 2, 3])], "real.webm", {
  type: "video/webm",
});
check("a stored File keeps its real identity untouched",
  rebuildStoredFile(d61File, "lied.mp4", "video/mp4") === d61File);
const rebuilt = rebuildStoredFile(
  new Blob([new Uint8Array([1])]),
  "clip.webm",
  "video/webm",
);
check("a stored Blob is rebuilt with its REAL name and type",
  rebuilt.name === "clip.webm" && rebuilt.type === "video/webm",
  `${rebuilt.name}/${rebuilt.type}`);

/* a video that can't be proven universal must be prepared on-device */
check("garbage bytes are never treated as a universal video",
  await isUniversalVideo(
    new File([new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])], "fake.mp4", {
      type: "video/mp4",
    }),
  ) === false);

/* ---------- summary ---------- */
console.log(`\n${"=".repeat(46)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(46)}`);
if (fail > 0) process.exit(1);
