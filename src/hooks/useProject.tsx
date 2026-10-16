/**
 * The project store — slot CONTENT only (Rule 6). The schedule re-resolves
 * from template + content; nothing the user touches can move a boundary.
 * Lives above the routes so Fill ⇄ Export share one state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type {
  MediaSlot,
  ResolveContent,
  Schedule,
  Template,
  TextSlot,
  UserAction,
} from "@/core/model/types";
import { resolve } from "@/core/resolve/resolve";
import { PRESET_MAP } from "@/presets/data";
import type { Bindings, MediaBinding } from "@/player/frame";
import { probeFile, type ProbedMedia } from "@/lib/mediaUtils";
import {
  disposeMediaBinding,
  makeMediaBinding,
} from "@/lib/mediaBinding";
import { ensureLocalMusic } from "@/lib/localMusic";
import type { SavedProject } from "@/hooks/useProjectsDB";
import { newProjectId, saveProject } from "@/hooks/useProjectsDB";
import { getTemplateEntry } from "@/templates/library";

export interface SlotState {
  kind: "media" | "text";
  media?: ProbedMedia;
  trimStart: number;
  soundOn: boolean;
  text?: string;
}

export interface SaveResult {
  ok: boolean;
  message: string;
}

export interface ProjectValue {
  template: Template | null;
  states: Record<string, SlotState>;
  schedule: Schedule | null;
  bindings: Bindings;
  filledMedia: number;
  totalMedia: number;
  /** intersection merge: template grant ∧ slot grant (D6/Rule 7) */
  can: (
    slot: MediaSlot | TextSlot | { userMay?: UserAction[] } | null,
    action: UserAction,
  ) => boolean;
  loadTemplate: (t: Template) => void;
  setMedia: (slotId: string, m: ProbedMedia | null) => void;
  setTrim: (slotId: string, v: number) => void;
  setSoundOn: (slotId: string, v: boolean) => void;
  setText: (slotId: string, v: string) => void;
  save: () => Promise<SaveResult>;
  restore: (saved: SavedProject) => Promise<boolean>;
  carryNotice: boolean;
  clearCarryNotice: () => void;
}

const ProjectContext = createContext<ProjectValue | null>(null);

/** Session-level media memory — powers "switch template, keep my media". */
let sessionMedia: ProbedMedia[] = [];

function slotSeconds(t: Template, slotId: string): number {
  const slot = t.tracks.media.find((s) => s.id === slotId);
  return slot ? slot.dur : 0;
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [template, setTemplate] = useState<Template | null>(null);
  const [states, setStates] = useState<Record<string, SlotState>>({});
  const [bindings, setBindings] = useState<Bindings>({});
  const [carryNotice, setCarryNotice] = useState(false);
  const elsRef = useRef(new Map<string, MediaBinding>());
  const templateIdRef = useRef<string | null>(null);
  const projectIdRef = useRef<string | null>(null);

  /* -------- elements follow content (created lazily, disposed on change) -------- */
  useEffect(() => {
    const next: Bindings = {};
    const keep = new Set<string>();
    for (const [slotId, st] of Object.entries(states)) {
      if (st.kind !== "media" || !st.media) continue;
      keep.add(slotId);
      const existing = elsRef.current.get(slotId);
      if (existing && existing.url === st.media.url) {
        next[slotId] = existing;
        continue;
      }
      if (existing) disposeMediaBinding(existing);
      const b = makeMediaBinding(slotId, st.media);
      elsRef.current.set(slotId, b);
      next[slotId] = b;
    }
    for (const [slotId, b] of [...elsRef.current]) {
      if (!keep.has(slotId)) {
        disposeMediaBinding(b);
        elsRef.current.delete(slotId);
      }
    }
    // bindings are handles to external DOM elements derived from state
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBindings(next);
  }, [states]);

  useEffect(
    () => () => {
      for (const b of elsRef.current.values()) disposeMediaBinding(b);
      elsRef.current.clear();
    },
    [],
  );

  /* -------- resolve (memo) -------- */
  const content: ResolveContent = useMemo(() => {
    const texts: Record<string, string> = {};
    const trims: Record<string, number> = {};
    const soundOn: Record<string, boolean> = {};
    for (const [id, st] of Object.entries(states)) {
      if (st.kind === "text") {
        if (st.text !== undefined) texts[id] = st.text;
      } else {
        trims[id] = st.trimStart;
        soundOn[id] = st.soundOn;
      }
    }
    return { texts, trims, soundOn };
  }, [states]);

  const schedule: Schedule | null = useMemo(
    () => (template ? resolve(template, content, PRESET_MAP) : null),
    [template, content],
  );

  /* -------- imported music (D40): decode + register before any playback -------- */
  useEffect(() => {
    if (template) void ensureLocalMusic(template.music.track);
  }, [template]);

  /* -------- actions -------- */
  const loadTemplate = useCallback((t: Template) => {
    setTemplate(t);
    if (templateIdRef.current === t.id) return; // same template → keep work
    templateIdRef.current = t.id;
    projectIdRef.current = null;

    const next: Record<string, SlotState> = {};
    let prefilled = false;
    t.tracks.media.forEach((slot, i) => {
      const m = sessionMedia[i];
      const ok =
        m &&
        ((m.isVideo && slot.accepts.includes("video")) ||
          (!m.isVideo && slot.accepts.includes("photo")));
      if (ok) prefilled = true;
      next[slot.id] = {
        kind: "media",
        media: ok ? m : undefined,
        trimStart: 0,
        /* carried-over video arrives audible too — same rule as an upload */
        soundOn: Boolean(ok && m?.isVideo),
      };
    });
    for (const slot of t.tracks.overlay) {
      next[slot.id] = { kind: "text", text: undefined, trimStart: 0, soundOn: false };
    }
    setStates(next);
    setCarryNotice(prefilled);
  }, []);

  const setMedia = useCallback(
    (slotId: string, m: ProbedMedia | null) => {
      if (!template) return;
      setStates((prev) => {
        const st = prev[slotId];
        if (!st || st.kind !== "media") return prev;
        const max =
          m && m.isVideo ? Math.max(0, m.duration - slotSeconds(template, slotId)) : 0;
        return {
          ...prev,
          [slotId]: {
            ...st,
            media: m ?? undefined,
            trimStart: Math.min(st.trimStart, max),
            /* an uploaded video is HEARD by default — its own sound plays in
               the preview and lands in the export (music ducks under it); the
               "Keep original sound" switch can still silence it */
            soundOn: Boolean(m?.isVideo),
          },
        };
      });
      if (m) {
        sessionMedia = sessionMedia.filter((x) => x.url !== m.url);
        sessionMedia.push(m);
      }
    },
    [template],
  );

  const setTrim = useCallback(
    (slotId: string, v: number) => {
      if (!template) return;
      setStates((prev) => {
        const st = prev[slotId];
        if (!st || !st.media) return prev;
        const max = st.media.isVideo
          ? Math.max(0, st.media.duration - slotSeconds(template, slotId))
          : 0;
        const clamped = Math.max(0, Math.min(v, max));
        if (clamped === st.trimStart) return prev;
        return { ...prev, [slotId]: { ...st, trimStart: clamped } };
      });
    },
    [template],
  );

  const setSoundOn = useCallback((slotId: string, v: boolean) => {
    setStates((prev) => {
      const st = prev[slotId];
      if (!st) return prev;
      return { ...prev, [slotId]: { ...st, soundOn: v } };
    });
  }, []);

  const setText = useCallback((slotId: string, v: string) => {
    setStates((prev) => {
      const st = prev[slotId];
      if (!st || st.kind !== "text") return prev;
      return { ...prev, [slotId]: { ...st, text: v } };
    });
  }, []);

  const can = useCallback(
    (
      slot: MediaSlot | TextSlot | { userMay?: UserAction[] } | null,
      action: UserAction,
    ): boolean => {
      if (!template) return false;
      if (!template.userMay.includes(action)) return false;
      // Rule 7: a slot may only NARROW the template's grant (intersection)
      if (slot && "userMay" in slot && slot.userMay) {
        return slot.userMay.includes(action);
      }
      return true;
    },
    [template],
  );

  const save = useCallback(async (): Promise<SaveResult> => {
    if (!template) return { ok: false, message: "No template loaded." };
    const slots: SavedProject["slots"] = {};
    let thumb = "";
    for (const slot of template.tracks.media) {
      const st = states[slot.id];
      if (!st) continue;
      if (!thumb && st.media?.thumb) thumb = st.media.thumb;
      slots[slot.id] = {
        kind: "media",
        file: st.media?.file,
        isVideo: st.media?.isVideo,
        duration:
          st.media && Number.isFinite(st.media.duration) ? st.media.duration : undefined,
        width: st.media?.width,
        height: st.media?.height,
        thumb: st.media?.thumb,
        trimStart: st.trimStart,
        soundOn: st.soundOn,
      };
    }
    for (const slot of template.tracks.overlay) {
      const st = states[slot.id];
      slots[slot.id] = {
        kind: "text",
        text: st?.text ?? slot.default,
        trimStart: 0,
        soundOn: false,
      };
    }
    if (!projectIdRef.current) projectIdRef.current = newProjectId();
    const project: SavedProject = {
      id: projectIdRef.current,
      templateId: template.id,
      name: template.title,
      savedAt: Date.now(),
      thumb,
      slots,
    };
    try {
      await saveProject(project);
      return { ok: true, message: "Project saved." };
    } catch {
      try {
        const light: SavedProject = {
          ...project,
          slots: Object.fromEntries(
            Object.entries(slots).map(([k, v]) => [k, { ...v, file: undefined }]),
          ),
        };
        await saveProject(light);
        return {
          ok: true,
          message: "Storage was full — saved settings without media files.",
        };
      } catch {
        return { ok: false, message: "Couldn't save — browser storage unavailable." };
      }
    }
  }, [template, states]);

  const restore = useCallback(
    async (saved: SavedProject): Promise<boolean> => {
      const entry = getTemplateEntry(saved.templateId);
      if (!entry || entry.issues.length > 0) return false;
      const t = entry.template;
      setTemplate(t);
      templateIdRef.current = t.id;
      projectIdRef.current = saved.id;

      const next: Record<string, SlotState> = {};
      for (const slot of t.tracks.media) {
        const s = saved.slots[slot.id];
        let media: ProbedMedia | undefined;
        if (s?.file) {
          try {
            const file = new File([s.file], s.file.name ?? "media", {
              type: s.isVideo ? "video/mp4" : "image/jpeg",
            });
            media = await probeFile(file);
          } catch {
            media = undefined;
          }
        }
        next[slot.id] = {
          kind: "media",
          media,
          trimStart: s?.trimStart ?? 0,
          soundOn: s?.soundOn ?? false,
        };
      }
      for (const slot of t.tracks.overlay) {
        next[slot.id] = {
          kind: "text",
          text: saved.slots[slot.id]?.text,
          trimStart: 0,
          soundOn: false,
        };
      }
      setStates(next);
      sessionMedia = [];
      return true;
    },
    [],
  );

  const clearCarryNotice = useCallback(() => setCarryNotice(false), []);

  const filledMedia = useMemo(
    () =>
      template
        ? template.tracks.media.filter((s) => states[s.id]?.media).length
        : 0,
    [template, states],
  );
  const totalMedia = template?.tracks.media.length ?? 0;

  const value: ProjectValue = {
    template,
    states,
    schedule,
    bindings,
    filledMedia,
    totalMedia,
    can,
    loadTemplate,
    setMedia,
    setTrim,
    setSoundOn,
    setText,
    save,
    restore,
    carryNotice,
    clearCarryNotice,
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- context hook lives with its provider (standard React pattern)
export function useProject(): ProjectValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used inside ProjectProvider");
  return ctx;
}
