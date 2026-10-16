/**
 * Uploaded logo images (D46) — downscaled data URLs keyed by id. The
 * template embeds a copy (≤1 MB) so shares stay self-contained; the
 * device copy lets you reuse a logo without re-uploading.
 */

import { runTx } from "@/hooks/useDB";

export interface LogoRecord {
  id: string;
  name: string;
  mime: string;
  /** downscaled (≤1024px) data URL, ≤1 MB */
  data: string;
  addedAt: number;
}

const STORE = "logos";

export async function saveLogoRecord(r: LogoRecord): Promise<void> {
  await runTx(STORE, "readwrite", (s) => s.put(r));
}

export async function listLogoRecords(): Promise<LogoRecord[]> {
  const all = await runTx<LogoRecord[]>(STORE, "readonly", (s) => s.getAll());
  return (all ?? []).sort((a, b) => b.addedAt - a.addedAt);
}

export async function deleteLogoRecord(id: string): Promise<void> {
  await runTx(STORE, "readwrite", (s) => s.delete(id));
}

/** New unique id for an uploaded logo. */
export function newLogoId(): string {
  return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
