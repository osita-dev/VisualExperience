/**
 * The template library view (v2, D37): built-ins + creator templates.
 * Creator templates live in IndexedDB, load once at bootstrap, and pass
 * the SAME validation gate as the built-ins (Rule 11) — the Library,
 * Detail, Fill and Export pages consume this merged view unchanged.
 */

import { useSyncExternalStore } from "react";
import type { Template } from "@/core/model/types";
import { LOCAL_TRACK_PREFIX, isLocalTrack, localTrackId } from "@/core/model/types";
import { validateTemplate } from "@/core/validate/validate";
import { PRESET_MAP } from "@/presets/data";
import {
  TEMPLATE_ENTRIES,
  templates as builtinTemplates,
  type TemplateEntry,
} from "@/templates/registry";
import {
  deleteTemplateRecord,
  listTemplates,
  saveTemplateRecord,
} from "@/hooks/useTemplatesDB";
import { deleteMusicRecord } from "@/hooks/useMusicDB";

/* ---------------- module store ---------------- */

let creatorEntries: TemplateEntry[] = [];
let creatorSnapshot: Template[] = [];
let loaded = false;
let loadedSnapshot = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function rebuildSnapshot(): void {
  creatorSnapshot = creatorEntries
    .filter((e) => e.issues.length === 0)
    .map((e) => e.template);
}

/* ---------------- merged views ---------------- */

/** Valid creator templates (reactive). */
export function creatorTemplates(): Template[] {
  return creatorSnapshot;
}

export function isCreatorTemplate(id: string): boolean {
  return creatorSnapshot.some((t) => t.id === id);
}

export function getTemplate(id: string): Template | undefined {
  return (
    builtinTemplates.find((t) => t.id === id) ??
    creatorSnapshot.find((t) => t.id === id)
  );
}

/** Full entry (valid or not) across built-ins + creator templates. */
export function getTemplateEntry(id: string): TemplateEntry | undefined {
  return (
    TEMPLATE_ENTRIES.find((e) => e.template.id === id) ??
    creatorEntries.find((e) => e.template.id === id)
  );
}

/* ---------------- persistence ---------------- */

/** Load creator templates from IndexedDB — call once at app start. */
export async function bootstrapLibrary(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const recs = await listTemplates();
    const entries: TemplateEntry[] = [];
    for (const r of recs) {
      const { template, issues } = validateTemplate(r.template, PRESET_MAP);
      if (template) {
        entries.push({ template, issues: [] });
      } else {
        console.warn(`[Visual Experience] Creator template "${r.id}" rejected:`, issues);
        entries.push({ template: r.template, issues });
      }
    }
    creatorEntries = entries;
    rebuildSnapshot();
  } catch {
    // storage unavailable — the built-in library still works
  }
  loadedSnapshot = true;
  emit();
}

/** Validate + persist + expose a creator template. Throws if invalid. */
export async function publishTemplate(t: Template): Promise<void> {
  const { template, issues } = validateTemplate(t, PRESET_MAP);
  if (!template) {
    throw new Error(
      `Template failed validation: ${issues.map((i) => i.message).join("; ")}`,
    );
  }
  await saveTemplateRecord({
    id: template.id,
    title: template.title,
    savedAt: Date.now(),
    template,
  });
  creatorEntries = [
    ...creatorEntries.filter((e) => e.template.id !== template.id),
    { template, issues: [] },
  ];
  rebuildSnapshot();
  emit();
}

export async function removeTemplate(id: string): Promise<void> {
  const entry = creatorEntries.find((e) => e.template.id === id);
  await deleteTemplateRecord(id);
  creatorEntries = creatorEntries.filter((e) => e.template.id !== id);
  rebuildSnapshot();
  emit();
  // garbage-collect the imported song if no published template uses it
  const track = entry?.template.music.track;
  if (track && isLocalTrack(track)) {
    const fileId = localTrackId(track);
    if (!isMusicFileUsed(fileId)) {
      void deleteMusicRecord(fileId).catch(() => {});
    }
  }
}

/** Whether any published creator template references this imported file. */
export function isMusicFileUsed(fileId: string): boolean {
  const track = `${LOCAL_TRACK_PREFIX}${fileId}`;
  return creatorEntries.some((e) => e.template.music.track === track);
}

/* ---------------- react hook ---------------- */

/** Reactive snapshot of valid creator templates. */
export function useCreatorTemplates(): Template[] {
  return useSyncExternalStore(subscribe, creatorTemplates, creatorTemplates);
}

/** Whether the creator library finished its first IndexedDB load. */
export function libraryLoaded(): boolean {
  return loadedSnapshot;
}

export function useLibraryLoaded(): boolean {
  return useSyncExternalStore(subscribe, libraryLoaded, libraryLoaded);
}
