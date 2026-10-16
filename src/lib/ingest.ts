/**
 * Ingest bridge (Step 4): probe a picked file, and — only when the
 * browser refuses the video and the on-device ffmpeg conversion kicks in
 * — show an honest progress toast. Normal picks stay silent; nothing is
 * ever uploaded; errors say exactly what happened.
 */

import { toast } from "sonner";
import { ingestFile, type IngestStatus } from "@/lib/mediaUtils";
import type { ProbedMedia } from "@/lib/mediaUtils";

export async function ingestWithToast(
  file: File,
  onStatus?: IngestStatus,
): Promise<ProbedMedia> {
  let tid: string | number | undefined;
  const status: IngestStatus = (msg, pct) => {
    onStatus?.(msg, pct);
    const text = pct === undefined ? msg : `${msg} ${Math.round(pct * 100)}%`;
    if (tid === undefined) tid = toast.loading(text);
    else toast.loading(text, { id: tid });
  };
  try {
    const m = await ingestFile(file, status);
    if (tid !== undefined)
      toast.success("Converted on your device — ready to use.", { id: tid });
    return m;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't read that file.";
    if (tid === undefined) toast.error(msg);
    else toast.error(msg, { id: tid });
    throw e;
  }
}
