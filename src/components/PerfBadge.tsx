/**
 * PerfBadge — debug instrumentation (?debug=1). Shows live FPS, the worst
 * frame time and the longest main-thread task of the last second, so phone
 * behaviour is measured instead of guessed. Invisible unless the flag is on.
 */

import { useEffect, useState } from "react";

interface LongTaskEntry extends PerformanceEntry {
  duration: number;
}

export function PerfBadge() {
  const [out, setOut] = useState("measuring…");

  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let worst = 0;
    let worstTask = 0;
    let last = performance.now();
    let tick = last;
    let po: PerformanceObserver | undefined;
    try {
      po = new PerformanceObserver((list) => {
        for (const en of list.getEntries() as LongTaskEntry[]) {
          if (en.duration > worstTask) worstTask = en.duration;
        }
      });
      po.observe({ entryTypes: ["longtask"] });
    } catch {
      /* longtask unsupported — badge still shows fps/frame time */
    }
    const loop = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      frames++;
      if (dt > worst) worst = dt;
      if (now - tick >= 1000) {
        setOut(
          `${frames} fps · worst ${worst.toFixed(0)}ms${
            worstTask > 0 ? ` · task ${worstTask.toFixed(0)}ms` : ""
          }`,
        );
        frames = 0;
        worst = 0;
        worstTask = 0;
        tick = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      po?.disconnect();
    };
  }, []);

  return (
    <div className="pointer-events-none fixed left-2 top-16 z-50 rounded-md bg-black/85 px-2 py-1 font-mono text-[11px] leading-tight text-lime-300 ring-1 ring-lime-400/40">
      {out}
    </div>
  );
}
