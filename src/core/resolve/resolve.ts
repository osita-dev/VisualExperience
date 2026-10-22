/**
 * The RESOLVE step (Stage 07/08): template + user content → flat schedule.
 *
 * Pure, deterministic, dependency-free. Same input → identical output, always.
 *   slot durs (seconds)    → chained slot times (never typed)
 *   bundles                → expanded into members
 *   anchors + offsets      → exact SFX times (Rule 1)
 *   transitions            → centered on the cut, overlapping (Rule 5)
 *   output                 → sorted by (t, phase) (Rule 2)
 */

import type {
  Connection,
  LookFilter,
  MediaSlot,
  Preset,
  PresetRef,
  ResolveContent,
  Schedule,
  ScheduleEntry,
  ScheduleKind,
  ScheduleSlotInfo,
  Template,
} from "../model/types";
import { isBundle, isLocalTrack, presetKey } from "../model/types";
import { paneCount, paneKey } from "../media/layouts";

type PresetMap = Record<string, Preset>;

/** Rule 2 phase order: hide → show → text/motion/effect → transition → audio → music */
function phaseOf(e: ScheduleEntry): number {
  if (e.kind === "media") return e.do === "hide" ? 0 : 1;
  switch (e.kind) {
    case "text":
      return 2;
    case "image":
      return 2;
    case "motion":
      return 3;
    case "effect":
      return 4;
    case "transition":
      return 5;
    case "audio":
      return 6;
    case "music":
      return 7;
    default:
      return 8;
  }
}

function kindFromPresetId(id: string): ScheduleKind {
  if (id.startsWith("motion.")) return "motion";
  if (id.startsWith("effect.")) return "effect";
  /* video animations (D44) are media treatments — same entry kind */
  if (id.startsWith("vanim.")) return "effect";
  if (id.startsWith("text.")) return "text";
  if (id.startsWith("transition.")) return "transition";
  return "motion";
}

/**
 * D45 — concrete canvas numbers for a light-filter choice. The preset's
 * full-strength deviation is scaled toward identity by the intensity,
 * so 50% is literally half the push. Absent/unknown preset → null
 * (unknown ids are reported by validation V9).
 */
function concreteFilter(
  ref: LookFilter,
  presets: PresetMap,
): Record<string, number> | null {
  const p = presets[presetKey(ref.preset, 1)];
  if (!p || isBundle(p)) return null;
  const raw = p.resolve({});
  const a = Math.min(1, Math.max(0, ref.amount));
  const num = (v: unknown, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : d;
  const r6 = (n: number) => Number(n.toFixed(6));
  return {
    b: r6(1 + (num(raw.b, 1) - 1) * a),
    c: r6(1 + (num(raw.c, 1) - 1) * a),
    s: r6(1 + (num(raw.s, 1) - 1) * a),
    sep: r6(num(raw.sep, 0) * a),
    hue: r6(num(raw.hue, 0) * a),
  };
}

function applyDefaults(
  preset: Preset,
  params?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(params ?? {}) };
  const specs = preset.params ?? {};
  for (const key of Object.keys(specs)) {
    if (out[key] === undefined) {
      const spec = specs[key];
      out[key] = spec.default;
    }
  }
  return out;
}

/** Resolve declared params → concrete render values (Rule 2). */
function resolveParams(
  preset: Preset,
  params?: Record<string, unknown>,
): Record<string, unknown> {
  const filled = applyDefaults(preset, params);
  if (preset.kind === "bundle") return filled;
  return preset.resolve(filled);
}

/** Rule 1: anchor times relative to a window [w0, w1]. `mid` IS the cut for connections. */
function anchorTime(anchor: string, w0: number, w1: number): number {
  if (anchor === "start") return w0;
  if (anchor === "end") return w1;
  return (w0 + w1) / 2;
}

function pushAudio(
  entries: ScheduleEntry[],
  asset: string,
  t: number,
  volume: number,
): void {
  entries.push({
    t: Math.max(0, t),
    dur: 0,
    kind: "audio",
    target: asset,
    do: "play",
    params: { volume },
  });
}

/**
 * Expand a block preset (or block bundle) across a slot's range.
 * D41: the slot's `sounds.effect` overrides the preset's built-in audio —
 * undefined = as designed, null = silent, object = play this instead at
 * the effect's start (the slot's cut).
 */
function expandBlock(
  entries: ScheduleEntry[],
  ref: PresetRef,
  presets: PresetMap,
  slot: MediaSlot,
  slotStart: number,
  slotEnd: number,
): void {
  const preset = presets[presetKey(ref.preset, ref.version)];
  if (!preset) return; // reported by validation V4

  const custom = slot.sounds?.effect;

  if (isBundle(preset)) {
    for (const member of preset.members) {
      if (member.anchor !== undefined) {
        // anchored members ARE the bundle's sound design (D41 gate)
        if (custom !== undefined) continue;
        const t =
          anchorTime(member.anchor, slotStart, slotEnd) + (member.offset ?? 0);
        pushAudio(entries, member.preset, t, member.volume ?? 1);
        continue;
      }
      const mp = presets[presetKey(member.preset, member.version ?? 1)];
      if (!mp || isBundle(mp)) continue;
      const w0 = member.window?.[0] ?? 0;
      const w1 = member.window?.[1] ?? slotEnd - slotStart;
      entries.push({
        t: slotStart + w0,
        dur: Math.max(0, w1 - w0),
        kind: kindFromPresetId(mp.id),
        target: slot.id,
        do: mp.id,
        params: resolveParams(mp, member.params ?? ref.params),
      });
    }
    if (custom) pushAudio(entries, custom.asset, slotStart, custom.volume);
    return;
  }

  entries.push({
    t: slotStart,
    dur: slotEnd - slotStart,
    kind: kindFromPresetId(preset.id),
    target: slot.id,
    do: preset.id,
    params: resolveParams(preset, ref.params),
  });
  // the preset's built-in sound (none on effects today; honoured for
  // forward-compat) — unless the creator silenced or replaced it (D41)
  if (custom === null) return;
  if (custom) {
    pushAudio(entries, custom.asset, slotStart, custom.volume);
    return;
  }
  for (const s of preset.sound ?? []) {
    pushAudio(
      entries,
      s.asset,
      anchorTime(s.anchor, slotStart, slotEnd) + s.offset,
      s.volume,
    );
  }
}

/**
 * Expand a connection preset (or connection bundle) around a cut at time C.
 * D41: `conn.sound` overrides the transition's built-in audio — undefined =
 * as designed, null = silent, object = play this once ON the cut (mid of
 * the transition window, where the beat lands).
 */
function expandConnection(
  entries: ScheduleEntry[],
  conn: Connection,
  presets: PresetMap,
  c: number,
): void {
  const preset = presets[presetKey(conn.preset, conn.version)];
  if (!preset) return; // reported by validation V4

  const seam = `seam:${conn.between[0]}|${conn.between[1]}`;
  const custom = conn.sound;

  if (preset.kind === "bundle") {
    const dur = preset.duration ?? 0.3;
    const w0 = c - dur / 2;
    for (const member of preset.members) {
      /* Built-in cut SFX no longer auto-play at a seam (the "cut sound");
         a connection may still set its own (D41). */
      if (member.anchor !== undefined) continue;
      const mp = presets[presetKey(member.preset, member.version ?? 1)];
      if (!mp || isBundle(mp)) continue;
      const mw0 = member.window?.[0] ?? 0;
      const mw1 = member.window?.[1] ?? dur;
      entries.push({
        t: w0 + mw0,
        dur: Math.max(0, mw1 - mw0),
        kind: kindFromPresetId(mp.id),
        target: seam,
        do: mp.id,
        params: resolveParams(mp, member.params ?? conn.params),
      });
    }
    if (custom) pushAudio(entries, custom.asset, c, custom.volume);
    return;
  }

  const dur = preset.duration ?? 0.3;
  const w0 = c - dur / 2;
  entries.push({
    t: w0,
    dur,
    kind: "transition",
    target: seam,
    do: preset.id,
    params: resolveParams(preset, conn.params),
  });
  if (custom === null) return;
  if (custom) {
    pushAudio(entries, custom.asset, c, custom.volume);
    return;
  }
  /* Built-in transition SFX no longer auto-play at a cut (the "cut sound");
     transitions stay silent unless a connection sets its own sound (D41). */
}

export function resolve(
  template: Template,
  content: ResolveContent,
  presets: PresetMap,
): Schedule {
  const media = template.tracks.media;

  interface Range {
    start: number;
    end: number;
    dur: number;
    index: number;
  }
  /* the chain is contiguous by construction: each slot starts where the
   * previous one ended, lengths are the slots' own seconds (schemaVersion 2) */
  const ranges = new Map<string, Range>();
  let acc = 0;
  media.forEach((slot, index) => {
    const start = acc;
    const end = acc + slot.dur;
    acc = end;
    ranges.set(slot.id, { start, end, dur: slot.dur, index });
  });

  const connMap = new Map<string, Connection>();
  for (const conn of template.connections) {
    connMap.set(`${conn.between[0]}|${conn.between[1]}`, conn);
  }

  const total = acc;

  const entries: ScheduleEntry[] = [];

  /* --- media chain + block presets (pre/post roll = half the neighbouring transition) --- */
  media.forEach((slot, i) => {
    const r = ranges.get(slot.id);
    if (!r) return;
    const prevConn =
      i > 0 ? connMap.get(`${media[i - 1].id}|${slot.id}`) : undefined;
    const nextConn =
      i < media.length - 1
        ? connMap.get(`${slot.id}|${media[i + 1].id}`)
        : undefined;
    const prevDur = prevConn
      ? presets[presetKey(prevConn.preset, prevConn.version)]?.duration ?? 0.3
      : 0;
    const nextDur = nextConn
      ? presets[presetKey(nextConn.preset, nextConn.version)]?.duration ?? 0.3
      : 0;
    const pre = prevConn ? prevDur / 2 : 0;
    const post = nextConn ? nextDur / 2 : 0;
    const t0 = Math.max(0, r.start - pre);
    const t1 = Math.min(total, r.end + post);

    /* light filter (D45): slot custom → slot "none" → template look → none */
    const filterRef =
      slot.filter === undefined ? template.look ?? null : slot.filter;
    const filter = filterRef ? concreteFilter(filterRef, presets) : null;

    /* Composition (D56): a split/collage slot carries its panes' trims —
       pane 0's trim is also the plain `trimStart` (the primary pane) */
    const paneN = paneCount(slot.layout);
    const paneTrims = Array.from({ length: paneN }, (_, p) =>
      p === 0
        ? (content.trims[slot.id] ?? 0)
        : (content.trims[paneKey(slot.id, p)] ?? content.trims[slot.id] ?? 0),
    );

    entries.push({
      t: t0,
      dur: t1 - t0,
      kind: "media",
      target: slot.id,
      do: "show",
      params: {
        index: i,
        crop: slot.crop,
        trimStart: content.trims[slot.id] ?? 0,
        shortClip: slot.shortClip ?? "freeze",
        ...(filter ? { filter } : {}),
        ...(paneN > 1
          ? { layout: slot.layout ?? "single", panes: paneTrims }
          : {}),
      },
    });
    entries.push({
      t: t1,
      dur: 0,
      kind: "media",
      target: slot.id,
      do: "hide",
      params: {},
    });

    for (const ref of slot.blockPresets ?? []) {
      expandBlock(entries, ref, presets, slot, r.start, r.end);
    }

    /* cut sound — the creator's choice for this slot's appearance (D41) */
    const cutSound = slot.sounds?.cut;
    if (cutSound) pushAudio(entries, cutSound.asset, r.start, cutSound.volume);
  });

  /* --- text overlays (parallel track, absolute seconds) --- */
  for (const slot of template.tracks.overlay) {
    const start = slot.time[0];
    const end = Math.min(slot.time[1], total);
    if (end <= start) continue;
    const preset = presets[presetKey(slot.textPreset, slot.version)];
    const concrete =
      preset && !isBundle(preset) && preset.kind === "text"
        ? resolveParams(preset, {})
        : { mode: "pop", inFrac: 0.3, ease: "overshoot" };
    /* exit animation (D43) — resolved into the same entry so the text
       renderer owns the whole in → hold → out lifecycle */
    const outPreset = slot.out
      ? presets[presetKey(slot.out.preset, slot.out.version)]
      : undefined;
    const outConcrete =
      slot.out && outPreset && !isBundle(outPreset) && outPreset.kind === "text"
        ? resolveParams(outPreset, slot.out.params ?? {})
        : undefined;
    entries.push({
      t: start,
      dur: end - start,
      kind: "text",
      target: slot.id,
      do: slot.textPreset,
      params: {
        ...concrete,
        ...(outConcrete ? { out: outConcrete } : {}),
        value: content.texts[slot.id] ?? slot.default,
        style: slot.style,
        layer: slot.layer,
      },
    });

    /* text sound — replaces the text preset's built-in (D41) */
    const textSound = slot.sound;
    if (textSound) {
      pushAudio(entries, textSound.asset, start, textSound.volume);
    } else if (textSound === undefined && preset && !isBundle(preset)) {
      for (const s of preset.sound ?? []) {
        pushAudio(
          entries,
          s.asset,
          anchorTime(s.anchor, start, end) + s.offset,
          s.volume,
        );
      }
    }
  }

  /* --- sticker & logo overlays (D46) --- */
  for (const slot of template.tracks.images ?? []) {
    const start = slot.time[0];
    const end = Math.min(slot.time[1], total);
    if (end <= start) continue; // reported by validation V10
    entries.push({
      t: start,
      dur: end - start,
      kind: "image",
      target: slot.id,
      do: "show",
      params: {
        source: slot.source,
        x: slot.x,
        y: slot.y,
        size: slot.size,
        rotation: slot.rotation,
        opacity: slot.opacity,
        layer: slot.layer,
      },
    });
  }

  /* --- connections (transitions + SFX anchored to the cut) --- */
  for (const conn of template.connections) {
    const r = ranges.get(conn.between[0]);
    if (!r) continue; // reported by validation V3
    expandConnection(entries, conn, presets, r.end);
  }

  /* --- music: soundtrack only — no bpm, no grid (the unlocked model) ---
     An imported song muted by its on/off switch stays loaded but silent, so
     the schedule simply carries no music entry (same as "no music"). */
  const musicTrack = template.music.track;
  const songMuted =
    isLocalTrack(musicTrack) && template.music.songOn === false;
  if (!songMuted) {
    const isSong = isLocalTrack(musicTrack);
    entries.push({
      t: 0,
      dur: total,
      kind: "music",
      target: "global",
      do: "play",
      params: {
        track: musicTrack,
        volume: isSong
          ? (template.music.songVolume ?? template.music.volume ?? 0.9)
          : (template.music.volume ?? 0.9),
        // the chosen segment of an imported song — an offset into the file
        // (D50); tones always start at their own beginning
        ...(isSong ? { offset: Math.max(0, template.music.songStart ?? 0) } : {}),
      },
    });
  }

  /* --- master SFX switch (D41): music always plays, effects may not --- */
  const sfxOn = template.sfxEnabled !== false;
  const out = sfxOn ? entries : entries.filter((e) => e.kind !== "audio");

  /* --- deterministic sort (Rule 2) --- */
  out.sort((a, b) => a.t - b.t || phaseOf(a) - phaseOf(b));

  /* --- slot summary (every UI number derives from here — never typed) --- */
  const slots: ScheduleSlotInfo[] = [];
  media.forEach((slot, index) => {
    const r = ranges.get(slot.id);
    if (!r) return;
    slots.push({
      id: slot.id,
      index,
      type: "media",
      start: r.start,
      end: r.end,
      dur: r.dur,
      accepts: slot.accepts,
      layer: 0,
    });
  });
  for (const slot of template.tracks.overlay) {
    const start = slot.time[0];
    const end = Math.min(slot.time[1], total);
    slots.push({
      id: slot.id,
      index: -1,
      type: "text",
      start,
      end,
      dur: end - start,
      layer: slot.layer,
    });
  }

  /* --- resolved cut boundaries (read-only timeline) --- */
  const cuts: number[] = [];
  for (let i = 1; i < media.length; i++) {
    const r = ranges.get(media[i].id);
    if (r) cuts.push(r.start);
  }

  return {
    schemaVersion: 2,
    templateId: template.id,
    duration: total,
    fps: template.canvas.fps,
    canvas: { width: template.canvas.width, height: template.canvas.height },
    meta: {
      title: template.title,
      palette: template.palette,
      /* the plate is a plain black/white choice — gradient flags on old
         saves are ignored and fall back to black */
      background: template.background === "white" ? "white" : "black",
    },
    cuts,
    slots,
    entries: out,
  };
}
