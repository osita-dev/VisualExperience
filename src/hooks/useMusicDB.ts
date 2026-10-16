/**
 * Imported music files (D40) — raw audio blobs keyed by file id, stored
 * alongside the templates in frame-db. Templates reference them as
 * `local:<fileId>` and stay pure data (structured-clone safe).
 */

import { runTx } from "@/hooks/useDB";

export interface MusicRecord {
  id: string;
  /** original file name (display) */
  name: string;
  mime: string;
  addedAt: number;
  blob: Blob;
}

const STORE = "music";

export async function saveMusicRecord(r: MusicRecord): Promise<void> {
  await runTx(STORE, "readwrite", (s) => s.put(r));
}

export async function getMusicRecord(
  id: string,
): Promise<MusicRecord | undefined> {
  return runTx<MusicRecord | undefined>(STORE, "readonly", (s) => s.get(id));
}

export async function deleteMusicRecord(id: string): Promise<void> {
  await runTx(STORE, "readwrite", (s) => s.delete(id));
}

/** New unique file id for an imported song. */
export function newMusicId(): string {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
