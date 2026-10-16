import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  value: string;
  onChange: (v: string) => void;
  defaultText: string;
}

/**
 * Text slot editor — value only. Timing belongs to the beat grid and style
 * belongs to the template (allowedControls: ["value"]).
 */
export function TextSlotEditor({ value, onChange, defaultText }: Props) {
  return (
    <div className="space-y-2">
      <Label htmlFor="slot-text" className="text-xs text-muted-foreground">
        Text (value only — timing follows the beat grid)
      </Label>
      <Textarea
        id="slot-text"
        value={value}
        maxLength={60}
        placeholder={defaultText}
        onChange={(e) => onChange(e.target.value)}
        className="resize-none bg-secondary/50"
      />
      <p className="text-[11px] text-muted-foreground tabular-nums">
        {value.length}/60 characters
      </p>
    </div>
  );
}
