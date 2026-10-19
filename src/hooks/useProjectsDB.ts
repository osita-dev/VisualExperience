/**
 * IndexedDB persistence for projects (Stage 09). Small hand-rolled wrapper —
 * no dependency needed for two object stores' worth of work.
 */

/** One pane's saved media in a composition slot (D56, split/collage). */
export interface SavedPane {
  /** the actual File — structured-clone stored so reopen restores media */
  file?: Blob & { name?: string };
  /** the file's REAL name + type (D61) — restore never has to guess */
  name?: string;
  mime?: string;
  isVideo?: boolean;
  duration?: number;
  width?: number;
  height?: number;
  thumb?: string;
  trimStart: number;
}

export interface SavedSlot {
  kind: "media" | "text";
  /** the actual File — structured-clone stored so reopen restores media */
  file?: Blob & { name?: string };
  /** the file's REAL name + type (D61) — restore never has to guess */
  name?: string;
  mime?: string;
  isVideo?: boolean;
  duration?: number;
  width?: number;
  height?: number;
  thumb?: string;
  trimStart: number;
  soundOn: boolean;
  text?: string;
  /** panes 1..N of a composition slot (holes keep the pane index) */
  panes?: (SavedPane | undefined)[];
}

export interface SavedProject {
  id: string;
  templateId: string;
  name: string;
  savedAt: number;
  thumb: string;
  slots: Record<string, SavedSlot>;
}

import { runTx } from "@/hooks/useDB";

const STORE = "projects";

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return runTx<T>(STORE, mode, run);
}

export async function saveProject(p: SavedProject): Promise<void> {
  await tx("readwrite", (s) => s.put(p));
}

export async function listProjects(): Promise<SavedProject[]> {
  const all = await tx<SavedProject[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

export async function getProject(id: string): Promise<SavedProject | undefined> {
  return tx<SavedProject | undefined>("readonly", (s) => s.get(id));
}

export async function deleteProject(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

export async function clearProjects(): Promise<void> {
  await tx("readwrite", (s) => s.clear());
}

export function newProjectId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
