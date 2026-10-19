import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, FolderOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BottomNav, BrandMark } from "@/components/BottomNav";
import { EmptyState } from "@/components/EmptyState";
import { useProject } from "@/hooks/useProject";
import {
  deleteProject,
  listProjects,
  type SavedProject,
} from "@/hooks/useProjectsDB";
import { getTemplate } from "@/templates/library";
import { metrics } from "@/templates/registry";
import { fmtSec } from "@/lib/format";

/** My Projects — resume saved work from IndexedDB. */
const MyProjects = () => {
  const [items, setItems] = useState<SavedProject[] | null>(null);
  /* D61: opening may run an on-device rescue conversion — say so instead
     of looking frozen */
  const [opening, setOpening] = useState<string | null>(null);
  const project = useProject();
  const navigate = useNavigate();

  const refresh = useCallback(() => {
    listProjects()
      .then((all) => setItems(all))
      .catch(() => setItems([]));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const open = async (p: SavedProject) => {
    if (opening) return;
    setOpening(p.id);
    try {
      const ok = await project.restore(p);
      if (ok) navigate(`/t/${p.templateId}/fill`);
      else toast.error("That template is no longer available.");
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <BrandMark />
          <span className="text-xs text-muted-foreground">
            {items ? `${items.length} saved` : ""}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-3 px-4 py-5">
        {items === null ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="h-10 w-10 text-muted-foreground" />}
            title="No projects yet"
            description="Fill a template and hit Save — it will show up here so you can pick it back up any time."
            action={
              <Button asChild>
                <a href="/">Browse templates</a>
              </Button>
            }
          />
        ) : (
          items.map((p) => {
            const t = getTemplate(p.templateId);
            const m = t ? metrics(t) : null;
            const mediaCount = Object.values(p.slots).filter(
              (s) => s.kind === "media" && s.file,
            ).length;
            return (
              <Card key={p.id} className="overflow-hidden border-border bg-card">
                <CardContent className="flex items-center gap-3 p-3">
                  <div
                    className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg"
                    style={
                      t
                        ? {
                            background: `linear-gradient(160deg, ${t.palette.from}, ${t.palette.to})`,
                          }
                        : undefined
                    }
                  >
                    {p.thumb ? (
                      <img src={p.thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xl">{t?.palette.emoji ?? "🎬"}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left disabled:opacity-60"
                    disabled={opening !== null}
                    onClick={() => void open(p)}
                  >
                    <div className="truncate text-sm font-semibold text-foreground">
                      {opening === p.id ? "Opening…" : p.name}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                      {m ? <span>{fmtSec(m.duration)}</span> : null}
                      <span>{mediaCount} media saved</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(p.savedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      await deleteProject(p.id);
                      toast.success("Project deleted.");
                      refresh();
                    }}
                    aria-label="Delete project"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default MyProjects;
