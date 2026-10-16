/**
 * Creator-Studio autosave (CapCut-style "save to draft"): the in-progress
 * editor state — the draft plus the picked test media — is mirrored into
 * IndexedDB ~1s after each edit, so a refresh never loses work. The draft
 * itself is pure structured-clone-safe data; the picked files are stored as
 * Blobs and re-probed on restore (a fresh object URL is made then — the old
 * one is dead after a reload). Cleared on publish: the work becomes a real
 * library template and the draft starts fresh next time.
 */

import { runTx } from "@/hooks/useDB";

/** One picked test-media file + the probed facts worth keeping across reloads. */
export interface StoredMedia {
  file: Blob;
  isVideo: boolean;
  duration: number;
  width: number;
  height: number;
  thumb: string;
}

/** The full autosaved editor state, keyed by the editing id (or NEW_DRAFT_KEY). */
export interface DraftSnapshot<TDraft> {
  id: string;
  savedAt: number;
  draft: TDraft;
  testMedia: Record<string, StoredMedia>;
  testTrims: Record<string, number>;
}

/** The autosave key for a brand-new (unpublished) template. */
export const NEW_DRAFT_KEY = "__new__";

const STORE = "drafts";

export async function saveDraftSnapshot<TDraft>(
  snap: DraftSnapshot<TDraft>,
): Promise<void> {
  await runTx(STORE, "readwrite", (s) => s.put(snap));
}

export async function loadDraftSnapshot<TDraft>(
  id: string,
): Promise<DraftSnapshot<TDraft> | undefined> {
  return runTx<DraftSnapshot<TDraft> | undefined>(STORE, "readonly", (s) =>
    s.get(id),
  );
}

export async function deleteDraftSnapshot(id: string): Promise<void> {
  await runTx(STORE, "readwrite", (s) => s.delete(id));
}
