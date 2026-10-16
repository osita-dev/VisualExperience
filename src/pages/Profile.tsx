import { useState } from "react";
import { Info, Trash2, Wand2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BottomNav, BrandMark } from "@/components/BottomNav";
import { clearProjects } from "@/hooks/useProjectsDB";
import { PRESET_LIST, SFX_ASSETS } from "@/presets/data";
import { TONES } from "@/core/audio/tones";
import { templates } from "@/templates/registry";
import { useCreatorTemplates } from "@/templates/library";

/** Profile — app facts, licensing notes, storage management. */
const Profile = () => {
  const [busy, setBusy] = useState(false);
  const creator = useCreatorTemplates();

  const stats = [
    { label: "Templates", value: templates.length + creator.length },
    { label: "Presets", value: PRESET_LIST.length },
    { label: "SFX", value: SFX_ASSETS.length },
    { label: "Tones", value: TONES.length },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-4">
          <span className="lg:hidden">
            <BrandMark />
          </span>
          <span className="hidden text-sm font-semibold text-foreground lg:inline">
            Profile
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-5">
        <Card className="border-border bg-card">
          <CardContent className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-foreground">About Visual Experience</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Visual Experience is a preset-driven template video maker: you fill the slots,
              the beat grid does the editing. Cuts, transitions and sound design
              come from the template — you never fight a timeline.
            </p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {stats.map((s) => (
                <div key={s.label} className="rounded-lg bg-secondary/60 py-2">
                  <div className="text-sm font-bold text-foreground tabular-nums">
                    {s.value}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="space-y-3 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Wand2 className="h-4 w-4 text-primary" />
              Creator studio
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Assemble your own templates — slots sized in beats, transitions
              and effects from the preset palette — test them with your own
              media, then publish to the Library. Share as a .json file.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/creator">
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                Open creator studio
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="space-y-3 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Info className="h-4 w-4 text-primary" />
              Music & licensing
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              All music in Visual Experience v1 is generated in your browser at the
              template's tempo — royalty-free by design, safe to post. SFX are
              synthesised the same way. No third-party audio ships with the app.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-foreground">Storage</h2>
            <p className="text-xs text-muted-foreground">
              Saved projects and your own templates live in this browser only
              (IndexedDB). Clearing here removes them from this device.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await clearProjects();
                  toast.success("All saved projects cleared.");
                } catch {
                  toast.error("Couldn't clear storage.");
                }
                setBusy(false);
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Clear all saved projects
            </Button>
          </CardContent>
        </Card>

        <p className="pb-2 text-center text-[11px] text-muted-foreground">
          Visual Experience v2 · web-only · templates, not timelines.
        </p>
      </main>

      <BottomNav />
    </div>
  );
};

export default Profile;
