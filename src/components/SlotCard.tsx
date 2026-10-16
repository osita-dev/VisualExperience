import { ImageIcon, Plus, Type, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtSec } from "@/lib/format";
import type { TemplatePalette } from "@/core/model/types";

interface Props {
  index: number;
  kind: "photo" | "video" | "both" | "text";
  duration: number;
  thumb?: string;
  filled: boolean;
  textPreview?: string;
  palette: TemplatePalette;
  selected: boolean;
  onClick: () => void;
}

const KIND_LABEL: Record<Props["kind"], string> = {
  photo: "Photo",
  video: "Video",
  both: "Photo or video",
  text: "Text",
};

/** One slot in the strip — filled (thumb) or empty (placeholder + "+"). */
export function SlotCard({
  index,
  kind,
  duration,
  thumb,
  filled,
  textPreview,
  palette,
  selected,
  onClick,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-36 shrink-0 overflow-hidden rounded-xl border text-left transition-all",
        selected
          ? "border-primary ring-2 ring-primary/40"
          : "border-border hover:border-primary/50",
      )}
    >
      <div
        className="relative flex aspect-[9/16] items-center justify-center"
        style={{
          background: filled
            ? undefined
            : `linear-gradient(160deg, ${palette.from}, ${palette.to})`,
        }}
      >
        {filled && thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : null}
        {filled && !thumb ? (
          <span className="text-3xl">{palette.emoji}</span>
        ) : null}
        {!filled ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background/60 backdrop-blur">
              <Plus className="h-5 w-5 text-foreground" />
            </span>
          </span>
        ) : null}
        <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-background/75 text-[10px] font-bold text-foreground backdrop-blur">
          {index + 1}
        </span>
        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-background/75 px-1.5 py-0.5 text-[10px] font-semibold text-foreground backdrop-blur">
          {fmtSec(duration)}
        </span>
      </div>
      <div className="flex items-center gap-1 bg-card px-2 py-1.5">
        {kind === "text" ? (
          <Type className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : kind === "photo" ? (
          <ImageIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <Video className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate text-[10px] text-muted-foreground">
          {filled && textPreview
            ? textPreview
            : KIND_LABEL[kind]}
        </span>
      </div>
    </button>
  );
}
