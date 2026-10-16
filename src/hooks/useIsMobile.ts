/**
 * useIsMobile — reactive mobile/desktop flag (768px breakpoint, the same
 * "md" boundary the CSS uses). Unlike window.matchMedia checks inside
 * handlers, this state drives WHAT MOUNTS: on mobile only the active
 * tab's panel is rendered, so a state change re-renders one panel, not seven.
 */

import { useEffect, useState } from "react";

const QUERY = "(max-width: 767.98px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}
