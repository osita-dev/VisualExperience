import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Plus, Search, Wand2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BottomNav, BrandMark } from "@/components/BottomNav";
import { EmptyState } from "@/components/EmptyState";
import { TemplateCard } from "@/components/TemplateCard";
import { TEMPLATE_ENTRIES, templates } from "@/templates/registry";
import {
  isCreatorTemplate,
  useCreatorTemplates,
} from "@/templates/library";
import { cn } from "@/lib/utils";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** The Library — browse, search, filter. Every card number is computed. */
const Index = () => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const creator = useCreatorTemplates();

  const all = useMemo(() => [...templates, ...creator], [creator]);
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of all) for (const c of t.categories) set.add(c);
    return [...set].sort();
  }, [all]);
  const failed = useMemo(
    () => TEMPLATE_ENTRIES.filter((e) => e.issues.length > 0),
    [],
  );
  const list = useMemo(
    () =>
      all.filter((t) => {
        const q = query.trim().toLowerCase();
        const okQ =
          !q ||
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q);
        const okC = !category || t.categories.includes(category);
        return okQ && okC;
      }),
    [all, query, category],
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between">
            <span className="lg:hidden">
              <BrandMark />
            </span>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
                Templates, not timelines.
              </span>
              <Button asChild variant="outline" size="sm">
                <Link to="/creator">
                  <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                  Create
                </Link>
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates…"
              className="bg-secondary/50 pl-9"
              aria-label="Search templates"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Chip active={!category} onClick={() => setCategory(null)}>
              All
            </Chip>
            {categories.map((c) => (
              <Chip
                key={c}
                active={category === c}
                onClick={() => setCategory(category === c ? null : c)}
              >
                {c}
              </Chip>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        {/* desktop hero — the CapCut-style "start creating" banner (mobile keeps its plain grid) */}
        <section className="hidden overflow-hidden rounded-2xl border border-border lg:block">
          <div
            className="flex items-center justify-between gap-8 px-8 py-7"
            style={{
              background: "linear-gradient(115deg, #8B5CF6 0%, #06B6D4 100%)",
            }}
          >
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-white">
                Create your own template
              </h2>
              <p className="mt-1.5 max-w-lg text-sm text-white/85">
                Click slots together on the beat grid, pick transitions and
                effects from the palette, test with your media — then publish it
                to this Library for everyone.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-5">
              <span className="text-6xl drop-shadow-lg">🎬</span>
              <Button
                asChild
                size="lg"
                className="bg-white text-black hover:bg-white/90"
              >
                <Link to="/creator/new">
                  <Plus className="mr-2 h-4 w-4" />
                  New template
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {failed.length > 0 ? (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {failed.length} template{failed.length > 1 ? "s" : ""} failed
            validation and {failed.length > 1 ? "were" : "was"} hidden.
          </div>
        ) : null}

        {list.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="No templates match"
            description="Try a different search, or clear the filters to see the whole shelf."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setCategory(null);
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((t) =>
              isCreatorTemplate(t.id) ? (
                <div key={t.id} className="relative">
                  <TemplateCard template={t} />
                  <Badge className="absolute right-3 top-3 bg-background/70 text-foreground backdrop-blur">
                    Yours
                  </Badge>
                </div>
              ) : (
                <TemplateCard key={t.id} template={t} />
              ),
            )}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default Index;
