import { Home, FolderOpen, User } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/projects", label: "My Projects", icon: FolderOpen, end: false },
  { to: "/profile", label: "Profile", icon: User, end: false },
];

/** Mobile-first bottom navigation (UI mock: Home / My Projects / Profile).
 *  Hidden at ≥1024px, where the desktop sidebar shell takes over. */
export function BottomNav() {
  return (
    <nav className="sticky bottom-0 z-40 mt-8 border-t border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75 lg:hidden">
      <div className="mx-auto flex w-full max-w-md items-stretch justify-around px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            activeClassName="text-primary"
            className="flex min-w-20 flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function BrandMark({
  className,
  wordmark = true,
}: {
  className?: string;
  /** false = render only the F mark (desktop icon rail) */
  wordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
        V
      </span>
      {wordmark ? (
        <span className="text-sm font-extrabold tracking-tight text-foreground">
          Visual Experience
        </span>
      ) : null}
    </span>
  );
}
