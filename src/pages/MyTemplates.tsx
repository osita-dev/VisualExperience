/**
 * CREATOR STUDIO (v2, D37) — the missing front end B entry point.
 * Create a template, re-edit published ones, export/import .json files.
 * Published templates flow into the same Library the built-ins live in.
 */

import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  Eye,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BottomNav, BrandMark } from "@/components/BottomNav";
import { EmptyState } from "@/components/EmptyState";
import type { Template } from "@/core/model/types";
import { isLocalTrack } from "@/core/model/types";
import { fmtSec } from "@/lib/format";
import { ensureLocalMusic } from "@/lib/localMusic";
import { metrics } from "@/templates/registry";
import {
  buildTemplatePayload,
  downloadTemplatePayload,
  parseTemplatePayload,
} from "@/templates/share";
import {
  publishTemplate,
  removeTemplate,
  useCreatorTemplates,
  useLibraryLoaded,
} from "@/templates/library";

const MyTemplates = () => {
  const navigate = useNavigate();
  const list = useCreatorTemplates();
  const loaded = useLibraryLoaded();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleExport = async (t: Template) => {
    try {
      const { payload, musicIncluded, musicSkipped } = await buildTemplatePayload(t);
      downloadTemplatePayload(
        payload,
        `${t.id.replace(/^tpl\./, "").replace(/\./g, "-")}.frame-template.json`,
      );
      if (musicIncluded) {
        toast.success("Template file downloaded — the song is embedded inside it.");
      } else if (musicSkipped) {
        toast.warning(musicSkipped);
      } else {
        toast.success("Template file downloaded.");
      }
    } catch {
      toast.error("Couldn't build the export file.");
    }
  };

  const handleImport = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const raw: unknown = JSON.parse(await file.text());
      // never clobber an existing id — imported copies always get a new one
      const parsed = await parseTemplatePayload(raw);
      const imported: Template = {
        ...parsed,
        id: `tpl.user.import_${Math.random().toString(36).slice(2, 8)}`,
      };
      await publishTemplate(imported);
      const musicOk = isLocalTrack(imported.music.track)
        ? await ensureLocalMusic(imported.music.track)
        : true;
      if (!musicOk) {
        toast.warning(
          `"${imported.title}" imported, but its song file wasn't embedded — open it in the builder to pick a song.`,
        );
      } else {
        toast.success(`"${imported.title}" imported into your library.`);
      }
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Couldn't read that file — expected a Visual Experience template .json.",
      );
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDelete = async (t: Template) => {
    try {
      await removeTemplate(t.id);
      toast.success(`"${t.title}" deleted.`);
    } catch {
      toast.error("Couldn't delete — browser storage unavailable.");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-4 sm:px-6">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link to="/" aria-label="Back to library">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <span className="lg:hidden">
            <BrandMark />
          </span>
          <span className="ml-auto text-xs font-medium text-muted-foreground">
            Creator studio
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6">
        {/* the pitch */}
        <Card className="border-border bg-card">
          <CardContent className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-foreground">
              Build a template, anyone can fill it
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Click slots together, size them in beats, pick transitions and
              effects from the preset palette, test with your own media, then
              publish. Your template lands in the Library — exactly like the
              built-ins — and stays editable here.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => navigate("/creator/new")}
              >
                <Plus className="mr-2 h-4 w-4" />
                New template
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {busy ? "Importing…" : "Import .json"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => void handleImport(e.target.files)}
              />
            </div>
          </CardContent>
        </Card>

        {/* published templates */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            My templates
          </h2>
          {!loaded ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-xl bg-secondary"
                />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon="🎬"
              title="No templates yet"
              description="Start from scratch or import a .json shared by another creator."
              action={
                <Button onClick={() => navigate("/creator/new")}>
                  <Plus className="mr-2 h-4 w-4" />
                  New template
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {list.map((t) => {
                const m = metrics(t);
                return (
                  <Card key={t.id} className="border-border bg-card">
                    <CardContent className="flex flex-wrap items-center gap-3 p-4">
                      <div
                        className="flex h-16 w-11 shrink-0 items-center justify-center rounded-lg text-2xl"
                        style={{
                          background: `linear-gradient(135deg, ${t.palette.from}, ${t.palette.to})`,
                        }}
                      >
                        {t.palette.emoji}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-foreground">
                            {t.title}
                          </h3>
                          <Badge
                            variant="outline"
                            className="shrink-0 text-[10px]"
                          >
                            Yours
                          </Badge>
                        </div>
                        <p className="text-[11px] tabular-nums text-muted-foreground">
                          {fmtSec(m.duration)} · {m.totalSlots} slots ·{" "}
                          {m.cuts.length} cuts ·{" "}
                          {t.categories.join(", ") || "no categories"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/creator/${t.id}`)}
                        >
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <Link to={`/t/${t.id}`}>
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                            Open
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleExport(t)}
                        >
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          Export
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => void handleDelete(t)}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <p className="pb-2 text-center text-[11px] text-muted-foreground">
          Templates are saved in this browser. Use Export to move one to
          another device or share it — imported songs travel inside the file.
        </p>
      </main>

      <BottomNav />
    </div>
  );
};

export default MyTemplates;
