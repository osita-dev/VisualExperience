import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Template } from "@/core/model/types";
import { metrics } from "@/templates/registry";
import { fmtSec } from "@/lib/format";

/** Library card — every number is derived from beats math, never typed. */
export function TemplateCard({ template }: { template: Template }) {
  const m = metrics(template);
  return (
    <Link to={`/t/${template.id}`} className="group block outline-none">
      <Card className="overflow-hidden border-border bg-card transition-all group-hover:border-primary/60 group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <div
          className="relative flex aspect-[4/3] items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${template.palette.from}, ${template.palette.to})`,
          }}
        >
          <span className="text-6xl drop-shadow-lg transition-transform duration-300 group-hover:scale-110">
            {template.palette.emoji}
          </span>
          {/* desktop hover affordance (no effect on touch) */}
          <span className="absolute inset-0 flex items-center justify-center bg-background/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </span>
          </span>
          <Badge className="absolute left-3 top-3 bg-background/70 text-foreground backdrop-blur">
            {template.categories[0]}
          </Badge>
          <span className="absolute bottom-3 right-3 rounded-full bg-background/70 px-2.5 py-1 text-xs font-semibold text-foreground backdrop-blur">
            {fmtSec(m.duration)} · {m.totalSlots} slots
          </span>
        </div>
        <CardContent className="space-y-1 p-4">
          <h3 className="text-sm font-semibold text-foreground">{template.title}</h3>
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {template.description}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
