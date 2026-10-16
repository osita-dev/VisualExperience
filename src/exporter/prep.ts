/**
 * Shared export prep (used by BOTH export tiers — WebCodecs and the ffmpeg
 * fallback): font parity, media readiness, and waiting for a clip's seek to
 * land before its frame is captured.
 */

import type { Schedule } from "@/core/model/types";
import type { Bindings, SeekTarget } from "@/player/frame";

/** Wait for every font family the schedule uses before exporting (D47) —
 *  the canvas never captures fallback metrics in the output file. */
export async function loadScheduleFonts(schedule: Schedule): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const wanted = new Set<string>();
  for (const e of schedule.entries) {
    if (e.kind !== "text") continue;
    const style = e.params.style as
      | { fontFamily?: string; weight?: number }
      | undefined;
    if (style?.fontFamily)
      wanted.add(`${style.weight ?? 700} 48px "${style.fontFamily}"`);
  }
  await Promise.all(
    [...wanted].map((f) => document.fonts.load(f).catch(() => undefined)),
  );
}

/** Every bound file must be decoded and showing its first frame before we
 *  start (D48) — otherwise the early frames export without the media. */
export async function loadBindingsMedia(bindings: Bindings): Promise<void> {
  await Promise.all(
    Object.values(bindings).map(async (b) => {
      if (!b) return;
      if (b.type === "image") {
        const img = b.el as HTMLImageElement;
        if (!img.complete || img.naturalWidth === 0) {
          await img.decode().catch(() => undefined);
        }
      } else {
        const v = b.el as HTMLVideoElement;
        if (v.readyState < 2) {
          await new Promise<void>((res) => {
            const done = () => {
              v.removeEventListener("loadeddata", done);
              res();
            };
            v.addEventListener("loadeddata", done);
            // never block forever on a slow file
            window.setTimeout(res, 4000);
          });
        }
      }
    }),
  );
}

/**
 * After `syncMedia(..., playing=false, seek=true)` parks each clip at its
 * exact frame time, wait for those seeks to LAND so the drawn frame matches
 * `t`. We key off the `seeked` event AND the element actually REACHING its
 * target time — never just `!seeking`, which can read false for a beat before
 * the browser raises it (that race is what glitched the slot seams). A timeout
 * is the safety net (a slightly-late frame beats a hung export).
 */
export async function settleSeeked(
  seeks: SeekTarget[],
  bindings?: Bindings,
): Promise<void> {
  await Promise.all(
    seeks.map(
      ({ el, target }) =>
        new Promise<void>((res) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            el.removeEventListener("seeked", finish);
            el.removeEventListener("error", finish);
            res();
          };
          // already parked on the target with a drawable frame → done
          if (
            !el.seeking &&
            el.readyState >= 2 &&
            Math.abs(el.currentTime - target) < 0.03
          ) {
            finish();
            return;
          }
          el.addEventListener("seeked", finish);
          el.addEventListener("error", finish);
          window.setTimeout(finish, 1000); // safety net
        }),
    ),
  );
  /* any bound clip that is LOADING (not being seeked) still needs a beat to
     raise readyState so the capture isn't blank */
  if (bindings) {
    const vids: HTMLVideoElement[] = [];
    for (const b of Object.values(bindings)) {
      if (b && b.type === "video") vids.push(b.el as HTMLVideoElement);
    }
    const until = performance.now() + 400;
    while (vids.some((v) => v.readyState < 2) && performance.now() < until) {
      await new Promise((r) => window.setTimeout(r, 16));
    }
  }
}
