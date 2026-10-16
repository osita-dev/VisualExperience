/**
 * Template .json sharing (D40): the file carries the structure AND — when
 * the template uses imported music — the audio itself, base64-inlined, so
 * a recipient gets a fully working template from one file. Sized cap keeps
 * exports sane; over the cap the file still ships (structure only) with a
 * clear warning instead of a broken silent success.
 */

import type { Template } from "@/core/model/types";
import { LOCAL_TRACK_PREFIX, isLocalTrack, localTrackId } from "@/core/model/types";
import { validateTemplate } from "@/core/validate/validate";
import { PRESET_MAP } from "@/presets/data";
import { blobToDataUrl, dataUrlToBlob } from "@/lib/localMusic";
import { getMusicRecord, newMusicId, saveMusicRecord } from "@/hooks/useMusicDB";

/** base64 inflates ~33% — refuse to build absurd files. */
export const MAX_INLINE_MUSIC_BYTES = 25 * 1024 * 1024;

export interface TemplatePayload {
  $schema: "frame-template";
  exportedAt: string;
  template: Template;
  /** present only when the template's local song could be embedded */
  music?: { name: string; mime: string; dataUrl: string };
}

export interface BuildResult {
  payload: TemplatePayload;
  musicIncluded: boolean;
  /** human-readable reason the song wasn't embedded (if it wasn't) */
  musicSkipped?: string;
}

/** Build the export payload, embedding the local song when possible. */
export async function buildTemplatePayload(t: Template): Promise<BuildResult> {
  if (!isLocalTrack(t.music.track)) return { payload: makePayload(t), musicIncluded: false };
  const rec = await getMusicRecord(localTrackId(t.music.track));
  if (!rec) {
    return {
      payload: makePayload(t),
      musicIncluded: false,
      musicSkipped: "This template's song file is missing — exported structure only.",
    };
  }
  if (rec.blob.size > MAX_INLINE_MUSIC_BYTES) {
    return {
      payload: makePayload(t),
      musicIncluded: false,
      musicSkipped: "The song is over the 25 MB embed limit — exported structure only.",
    };
  }
  const dataUrl = await blobToDataUrl(rec.blob);
  return {
    payload: {
      ...makePayload(t),
      music: { name: rec.name, mime: rec.mime, dataUrl },
    },
    musicIncluded: true,
  };
}

function makePayload(t: Template): TemplatePayload {
  return {
    $schema: "frame-template",
    exportedAt: new Date().toISOString(),
    template: t,
  };
}

/** Trigger a browser download of the payload as .json. */
export function downloadTemplatePayload(payload: TemplatePayload, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse an imported payload: restores any embedded song into IndexedDB
 * under a fresh file id, then runs the SAME validation gate as everything
 * else (Rule 11). Throws with a human-readable message on failure.
 */
export async function parseTemplatePayload(raw: unknown): Promise<Template> {
  const outer =
    raw && typeof raw === "object" && "template" in raw
      ? (raw as { template?: unknown })
      : null;
  const candidate = outer ? outer.template : raw;
  const music =
    raw && typeof raw === "object" && "music" in raw
      ? (raw as { music?: unknown }).music
      : undefined;

  let t = candidate as Template;
  let embedded: { name: string; mime: string; dataUrl: string } | undefined;
  if (music && typeof music === "object") {
    const m = music as { name?: unknown; mime?: unknown; dataUrl?: unknown };
    if (typeof m.dataUrl === "string" && m.dataUrl.startsWith("data:")) {
      embedded = {
        name: typeof m.name === "string" ? m.name : "music",
        mime: typeof m.mime === "string" ? m.mime : "audio/mpeg",
        dataUrl: m.dataUrl,
      };
    }
  }

  // restore the audio BEFORE validating so the final template is complete
  if (embedded && t && typeof t === "object" && isLocalTrack(t.music?.track ?? "")) {
    const id = newMusicId();
    await saveMusicRecord({
      id,
      name: embedded.name,
      mime: embedded.mime,
      addedAt: Date.now(),
      blob: dataUrlToBlob(embedded.dataUrl),
    });
    t = { ...t, music: { ...t.music, track: `${LOCAL_TRACK_PREFIX}${id}` } };
  }

  const { template, issues } = validateTemplate(t, PRESET_MAP);
  if (!template) {
    throw new Error(issues[0]?.message ?? "That file isn't a valid Visual Experience template.");
  }
  return template;
}
