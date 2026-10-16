/**
 * Media element bindings shared by every preview surface: the slot-filler,
 * the exporter and the builder's test-fill. One code path, one behaviour.
 */

import type { MediaBinding } from "@/player/frame";
import type { ProbedMedia } from "@/lib/mediaUtils";

export function makeMediaBinding(slotId: string, m: ProbedMedia): MediaBinding {
  if (m.isVideo) {
    const v = document.createElement("video");
    v.src = m.url;
    v.preload = "auto";
    v.playsInline = true;
    v.muted = true; // clip audio only ever flows through the Web Audio graph
    v.setAttribute("playsinline", "");
    v.style.cssText =
      "position:fixed;left:-10px;top:-10px;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(v);
    return { slotId, type: "video", el: v, url: m.url, duration: m.duration };
  }
  const img = new Image();
  img.src = m.url;
  return { slotId, type: "image", el: img, url: m.url, duration: Infinity };
}

export function disposeMediaBinding(b: MediaBinding): void {
  if (b.type === "video") {
    const v = b.el as HTMLVideoElement;
    v.pause();
    v.removeAttribute("src");
    v.load();
    v.remove();
  }
}
