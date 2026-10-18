/**
 * Template validation — V1…V13 (Rule 11). Computed, never faked.
 * Hand-rolled so the entire core stays dependency-free and testable
 * without node_modules. Returns structured issues; never throws.
 */

import type { ImageSlot, LookFilter, Preset, Template, UserAction } from "../model/types";
import {
  MAX_TOTAL_SEC,
  NO_MUSIC_TRACK,
  USER_ACTIONS,
  isLocalTrack,
  isToneTrack,
  presetKey,
  toneTrackId,
} from "../model/types";
import { migrateTemplate } from "../model/migrate";
import { SFX_ASSETS } from "../audio/sfxCatalog";
import { getTone } from "../audio/tones";
import { STICKER_ASSETS } from "../media/stickers";
import { layoutById } from "../media/layouts";
import { FONT_FACES } from "../text/fonts";

export interface ValidationIssue {
  rule: string;
  message: string;
}

type PresetMap = Record<string, Preset>;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isStr(v: unknown): v is string {
  return typeof v === "string";
}
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function push(
  issues: ValidationIssue[],
  rule: string,
  message: string,
): void {
  issues.push({ rule, message });
}

/** Structural shape check — the fields the resolver actually touches. */
function checkShape(raw: unknown, issues: ValidationIssue[]): void {
  if (!isObj(raw)) {
    push(issues, "shape", "Template must be an object");
    return;
  }
  const needStr = [
    "id",
    "title",
    "description",
  ] as const;
  for (const k of needStr) {
    if (!isStr(raw[k])) push(issues, "shape", `Missing or invalid field "${k}"`);
  }
  if (raw.schemaVersion !== 2)
    push(issues, "shape", "schemaVersion must be 2");
  if (!isObj(raw.canvas))
    push(issues, "shape", "canvas must be an object");
  else {
    if (raw.canvas.ratio !== "9:16")
      push(issues, "shape", 'canvas.ratio must be "9:16" (D23)');
    if (!isNum(raw.canvas.fps) || raw.canvas.fps <= 0)
      push(issues, "shape", "canvas.fps must be a positive number");
    if (!isNum(raw.canvas.width) || !isNum(raw.canvas.height))
      push(issues, "shape", "canvas.width/height must be numbers");
  }
  if (!isObj(raw.music)) push(issues, "shape", "music must be an object");
  else if (!isStr(raw.music.track))
    push(issues, "shape", "music.track must be a string");
  if (!isObj(raw.tracks)) push(issues, "shape", "tracks must be an object");
  else {
    if (!Array.isArray(raw.tracks.media))
      push(issues, "shape", "tracks.media must be an array");
    if (!Array.isArray(raw.tracks.overlay))
      push(issues, "shape", "tracks.overlay must be an array");
  }
  if (!Array.isArray(raw.connections))
    push(issues, "shape", "connections must be an array");
  if (!Array.isArray(raw.userMay))
    push(issues, "shape", "userMay must be an array");
}

/** Slot lengths valid + chain non-empty + connections between adjacent slots (V2/V3), plus the total budget (V12, MAX_TOTAL_SEC). */
function checkMediaChain(t: Template, issues: ValidationIssue[]): void {
  const media = t.tracks.media;
  const total = media.reduce((m, s) => m + (isNum(s.dur) ? s.dur : 0), 0);

  media.forEach((slot, i) => {
    if (!isNum(slot.dur) || slot.dur <= 0) {
      push(issues, "V2", `Slot "${slot.id}" length must be a positive number of seconds`);
      return;
    }
    if (slot.accepts.length === 0)
      push(issues, "V2", `Slot "${slot.id}" must accept photo or video`);
    /* Composition (D56): a layout, when worn, must be a known one */
    if (slot.layout !== undefined && layoutById(slot.layout) === undefined)
      push(
        issues,
        "V13",
        `Slot "${slot.id}" references unknown layout "${String(slot.layout)}"`,
      );
    if (i > 0) {
      const prev = media[i - 1];
      if (slot.id === prev.id)
        push(issues, "V3", `Duplicate media slot id "${slot.id}"`);
    }
  });

  if (total > MAX_TOTAL_SEC + 1e-6)
    push(
      issues,
      "V12",
      `Total length is ${total.toFixed(1)}s — over the ${MAX_TOTAL_SEC}s limit. Shorten a slot.`,
    );

  const ids = new Set(media.map((s) => s.id));
  for (const conn of t.connections) {
    const [a, b] = conn.between;
    const ia = media.findIndex((s) => s.id === a);
    const ib = media.findIndex((s) => s.id === b);
    if (ia < 0 || ib < 0) {
      push(issues, "V3", `Connection references unknown slot "${a}" / "${b}"`);
      continue;
    }
    if (ib !== ia + 1)
      push(
        issues,
        "V3",
        `Connection must join adjacent slots: "${a}" → "${b}"`,
      );
    if (!ids.has(a)) push(issues, "V3", `Unknown slot "${a}"`);
  }

  // Text windows: absolute seconds, start < end, start within the chain
  const duration = total;
  for (const slot of t.tracks.overlay) {
    if (
      !Array.isArray(slot.time) ||
      slot.time.length !== 2 ||
      !isNum(slot.time[0]) ||
      !isNum(slot.time[1]) ||
      slot.time[0] < 0 ||
      slot.time[1] <= slot.time[0]
    )
      push(issues, "V2", `Text "${slot.id}" has an invalid time window`);
    else if (slot.time[1] > duration + 1e-6)
      push(
        issues,
        "V2",
        `Text "${slot.id}" ends at ${slot.time[1].toFixed(1)}s but the video is ${duration.toFixed(1)}s`,
      );
  }
}

/** Every pinned preset reference must exist (V4). */
function checkPresetRefs(t: Template, presets: PresetMap, issues: ValidationIssue[]): void {
  const has = (id: string, v: number) => presets[presetKey(id, v)] !== undefined;

  for (const slot of t.tracks.media) {
    for (const ref of slot.blockPresets ?? []) {
      if (!has(ref.preset, ref.version))
        push(issues, "V4", `Missing preset ${ref.preset}@${ref.version} (slot "${slot.id}")`);
    }
  }
  for (const slot of t.tracks.overlay) {
    if (!has(slot.textPreset, slot.version))
      push(issues, "V4", `Missing text preset ${slot.textPreset}@${slot.version}`);
    if (slot.out && !has(slot.out.preset, slot.out.version))
      push(issues, "V4", `Missing text exit preset ${slot.out.preset}@${slot.out.version}`);
  }
  for (const conn of t.connections) {
    if (!has(conn.preset, conn.version)) {
      push(issues, "V4", `Missing preset ${conn.preset}@${conn.version}`);
      continue;
    }
    const p = presets[presetKey(conn.preset, conn.version)];
    if (p && p.kind === "bundle" && p.placement === "connection") {
      const hasTransition = p.members.some((m) => {
        if (m.anchor !== undefined) return false;
        const mp = presets[presetKey(m.preset, m.version ?? 1)];
        return mp !== undefined && !("resolve" in mp && mp.kind === "block") && mp.id.startsWith("transition.");
      });
      if (!hasTransition)
        push(issues, "V4", `Connection bundle "${p.id}" has no transition member`);
    }
  }
}

/** userMay values must be within the enum; slots may only narrow (V5). */
function checkUserMay(t: Template, issues: ValidationIssue[]): void {
  const ok = (a: string): a is UserAction =>
    (USER_ACTIONS as string[]).includes(a);
  for (const a of t.userMay) {
    if (!ok(a)) push(issues, "V5", `Unknown userMay action "${a}"`);
  }
  for (const slot of t.tracks.overlay) {
    for (const a of slot.userMay ?? []) {
      if (!ok(a)) push(issues, "V5", `Text "${slot.id}": unknown action "${a}"`);
      else if (!t.userMay.includes(a))
        push(
          issues,
          "V5",
          `Text "${slot.id}" grants "${a}" beyond the template level (Rule 7: slots may only narrow)`,
        );
    }
  }
}

/** Music track validity (V7): silent, a known tone, or a valid imported song that is long enough. */
function checkMusic(t: Template, issues: ValidationIssue[]): void {
  const track = t.music.track;
  const total = t.tracks.media.reduce(
    (m, s) => m + (isNum(s.dur) ? s.dur : 0),
    0,
  );

  if (track === NO_MUSIC_TRACK) {
    if (t.music.local !== undefined)
      push(issues, "V7", "music.local is set but music.track is \"none\"");
    return;
  }

  if (isToneTrack(track)) {
    if (t.music.local !== undefined)
      push(issues, "V7", "music.local is set but music.track is a tone");
    if (!getTone(toneTrackId(track)))
      push(issues, "V7", `Unknown music tone "${toneTrackId(track)}"`);
    return;
  }

  const local = t.music.local;
  if (!isLocalTrack(track)) {
    push(
      issues,
      "V7",
      `music.track must be "none", a tone, or a local: track (got "${track}")`,
    );
    return;
  }
  if (!local) {
    push(issues, "V7", "Local music track is missing its metadata");
    return;
  }
  if (!isStr(local.name) || !isNum(local.duration) || local.duration <= 0) {
    push(issues, "V7", "music.local metadata invalid");
    return;
  }
  if (total > local.duration + 1e-6) {
    push(
      issues,
      "V7",
      `Video is ${total.toFixed(1)}s but the imported song is only ${local.duration.toFixed(1)}s — shorten slots or pick a longer song`,
    );
  }
}

/** Transition must not exceed the material available on either side (V1). */
function checkTransitionMaterial(t: Template, presets: PresetMap, issues: ValidationIssue[]): void {
  const media = t.tracks.media;
  t.connections.forEach((conn, i) => {
    const ia = media.findIndex((s) => s.id === conn.between[0]);
    if (ia < 0 || ia + 1 >= media.length) return;
    const left = isNum(media[ia].dur) ? media[ia].dur : 0;
    const right = isNum(media[ia + 1].dur) ? media[ia + 1].dur : 0;
    const p = presets[presetKey(conn.preset, conn.version)];
    const dur = p?.duration ?? 0.3;
    if (left < dur / 2 - 1e-9 || right < dur / 2 - 1e-9)
      push(
        issues,
        "V1",
        `Connection ${i} (${conn.between[0]}→${conn.between[1]}) needs ≥ ${(dur / 2).toFixed(2)}s each side; slots are ${left.toFixed(2)}s / ${right.toFixed(2)}s`,
      );
  });
}

/** Sound refs (V8): known catalog assets, sane volumes, boolean master. */
function checkSounds(t: Template, issues: ValidationIssue[]): void {
  if (
    t.music.volume !== undefined &&
    (!isNum(t.music.volume) || t.music.volume < 0 || t.music.volume > 1)
  )
    push(issues, "V8", "Music volume must be between 0 and 1");
  if (
    t.music.songVolume !== undefined &&
    (!isNum(t.music.songVolume) ||
      t.music.songVolume < 0 ||
      t.music.songVolume > 1)
  )
    push(issues, "V8", "Song volume must be between 0 and 1");
  if (t.music.songOn !== undefined && typeof t.music.songOn !== "boolean")
    push(issues, "V8", "music.songOn must be a boolean");
  if (
    t.music.songStart !== undefined &&
    (!isNum(t.music.songStart) || t.music.songStart < 0)
  )
    push(issues, "V8", "music.songStart must be a number ≥ 0");
  if (t.sfxEnabled !== undefined && typeof t.sfxEnabled !== "boolean")
    push(issues, "V8", "sfxEnabled must be a boolean");

  const check = (label: string, snd: unknown): void => {
    if (snd === null || snd === undefined) return;
    if (!isObj(snd)) {
      push(issues, "V8", `${label} must be a sound choice or null`);
      return;
    }
    if (!isStr(snd.asset) || !SFX_ASSETS.includes(snd.asset))
      push(issues, "V8", `${label} references unknown sound "${String(snd.asset)}"`);
    if (!isNum(snd.volume) || snd.volume < 0 || snd.volume > 1)
      push(issues, "V8", `${label} volume must be between 0 and 1`);
  };

  for (const slot of t.tracks.media) {
    if (slot.sounds !== undefined && !isObj(slot.sounds))
      push(issues, "V8", `Slot "${slot.id}" sounds must be an object`);
    else {
      check(`Slot "${slot.id}" cut sound`, slot.sounds?.cut);
      check(`Slot "${slot.id}" effect sound`, slot.sounds?.effect);
    }
  }
  for (const slot of t.tracks.overlay) check(`Text "${slot.id}" sound`, slot.sound);
  t.connections.forEach((conn, i) =>
    check(`Connection ${i} (${conn.between[0]}→${conn.between[1]}) sound`, conn.sound),
  );
}

/** Light filters (V9/D45): known preset ids, sane intensities. */
function checkFilters(
  t: Template,
  presets: PresetMap,
  issues: ValidationIssue[],
): void {
  const one = (label: string, ref: LookFilter | null | undefined): void => {
    if (ref === null || ref === undefined) return; // off / inherit / untouched
    if (!isObj(ref)) {
      push(issues, "V9", `${label} must be a filter choice or null`);
      return;
    }
    if (!isStr(ref.preset) || !presets[presetKey(ref.preset, 1)])
      push(issues, "V9", `${label} references unknown filter "${String(ref.preset)}"`);
    if (!isNum(ref.amount) || ref.amount < 0 || ref.amount > 1)
      push(issues, "V9", `${label} intensity must be between 0 and 1`);
  };
  one("Template look", t.look);
  for (const slot of t.tracks.media) one(`Slot "${slot.id}" filter`, slot.filter);
}

/** Sticker & logo overlays (V10/D46): known sources, sane geometry. */
function checkImages(t: Template, issues: ValidationIssue[]): void {
  const imgs = t.tracks.images;
  if (imgs === undefined) return;
  if (!Array.isArray(imgs)) {
    push(issues, "V10", "tracks.images must be an array");
    return;
  }
  const ids = new Set<string>();
  for (const im of imgs as ImageSlot[]) {
    if (!isObj(im)) {
      push(issues, "V10", "Image overlay must be an object");
      continue;
    }
    if (!isStr(im.id) || im.id === "") push(issues, "V10", "Image overlay needs an id");
    else if (ids.has(im.id)) push(issues, "V10", `Duplicate image id "${im.id}"`);
    ids.add(im.id);

    const src = im.source as { kind?: unknown; sticker?: unknown; data?: unknown } | undefined;
    if (!isObj(src)) push(issues, "V10", `Image "${im.id}" needs a source`);
    else if (src.kind === "sticker") {
      if (!isStr(src.sticker) || !STICKER_ASSETS.some((a) => a.id === src.sticker))
        push(issues, "V10", `Image "${im.id}" references unknown sticker "${String(src.sticker)}"`);
    } else if (src.kind === "logo") {
      if (!isStr(src.data) || !src.data.startsWith("data:image/"))
        push(issues, "V10", `Image "${im.id}" logo data must be an embedded image`);
    } else push(issues, "V10", `Image "${im.id}" source kind must be "sticker" or "logo"`);

    if (!isNum(im.x) || im.x < 0 || im.x > 1 || !isNum(im.y) || im.y < 0 || im.y > 1)
      push(issues, "V10", `Image "${im.id}" position must be within 0..1`);
    if (!isNum(im.size) || im.size <= 0 || im.size > 1)
      push(issues, "V10", `Image "${im.id}" size must be within 0..1`);
    if (!isNum(im.rotation) || Math.abs(im.rotation) > 360)
      push(issues, "V10", `Image "${im.id}" rotation must be within ±360°`);
    if (!isNum(im.opacity) || im.opacity < 0 || im.opacity > 1)
      push(issues, "V10", `Image "${im.id}" opacity must be between 0 and 1`);
    if (
      !Array.isArray(im.time) ||
      im.time.length !== 2 ||
      !isNum(im.time[0]) ||
      !isNum(im.time[1]) ||
      im.time[0] < 0 ||
      im.time[1] <= im.time[0]
    )
      push(issues, "V10", `Image "${im.id}" time must be [start, end] in seconds`);
  }
}

/** Text typography (V11/D47): known fonts, sane size/position/tracking. */
function checkTypography(t: Template, issues: ValidationIssue[]): void {
  for (const slot of t.tracks.overlay) {
    const s = slot.style as {
      fontFamily?: unknown;
      weight?: unknown;
      sizeRel?: unknown;
      xRel?: unknown;
      yRel?: unknown;
      tracking?: unknown;
    };
    if (!isStr(s.fontFamily) || !FONT_FACES.some((f) => f.name === s.fontFamily))
      push(issues, "V11", `Text "${slot.id}" uses unknown font "${String(s.fontFamily)}"`);
    if (s.weight !== undefined && (!isNum(s.weight) || s.weight < 100 || s.weight > 900))
      push(issues, "V11", `Text "${slot.id}" weight must be between 100 and 900`);
    if (!isNum(s.sizeRel) || s.sizeRel < 0.01 || s.sizeRel > 0.3)
      push(issues, "V11", `Text "${slot.id}" size must be within 1%..30% of height`);
    if (s.xRel !== undefined && (!isNum(s.xRel) || s.xRel < 0 || s.xRel > 1))
      push(issues, "V11", `Text "${slot.id}" x position must be within 0..1`);
    if (isNum(s.yRel) && (s.yRel < 0 || s.yRel > 1))
      push(issues, "V11", `Text "${slot.id}" y position must be within 0..1`);
    if (s.tracking !== undefined && (!isNum(s.tracking) || s.tracking < -0.15 || s.tracking > 0.5))
      push(issues, "V11", `Text "${slot.id}" tracking must be within -0.15..0.5em`);
  }
}

export function validateTemplate(
  raw: unknown,
  presets: PresetMap,
): { template?: Template; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  /* v1 (beat-locked) files upgrade here — one gate for everything */
  const src = migrateTemplate(raw);
  checkShape(src, issues);
  if (issues.length > 0) return { issues };

  const t = src as unknown as Template;

  checkMediaChain(t, issues);
  checkMusic(t, issues);
  checkPresetRefs(t, presets, issues);
  checkUserMay(t, issues);
  checkSounds(t, issues);
  checkFilters(t, presets, issues);
  checkImages(t, issues);
  checkTypography(t, issues);
  checkTransitionMaterial(t, presets, issues);

  // V6: media ids unique (the chain is sequential by construction)
  const seen = new Set<string>();
  for (const s of t.tracks.media) {
    if (seen.has(s.id)) push(issues, "V6", `Duplicate slot id "${s.id}"`);
    seen.add(s.id);
  }

  if (issues.some((i) => ["shape", "V2", "V3", "V4", "V5", "V7", "V8", "V9", "V10", "V11", "V12", "V13"].includes(i.rule)))
    return { issues };

  return { template: t, issues };
}
