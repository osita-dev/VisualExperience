/**
 * Creator templates — persisted Template JSON (v2 creator library).
 * Templates are pure data (presets pinned by id@version), so they are
 * structured-clone safe and re-validated through the same gate as the
 * built-ins when loaded (Rule 11).
 */

import type { Template } from "@/core/model/types";
import { runTx } from "@/hooks/useDB";

export interface TemplateRecord {
  id: string;
  title: string;
  savedAt: number;
  template: Template;
}

const STORE = "templates";

export async function listTemplates(): Promise<TemplateRecord[]> {
  const all = await runTx<TemplateRecord[]>(STORE, "readonly", (s) => s.getAll());
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

export async function saveTemplateRecord(r: TemplateRecord): Promise<void> {
  await runTx(STORE, "readwrite", (s) => s.put(r));
}

export async function deleteTemplateRecord(id: string): Promise<void> {
  await runTx(STORE, "readwrite", (s) => s.delete(id));
}
