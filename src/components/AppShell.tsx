/**
 * DESKTOP APP SHELL (v2, CapCut-style) — persistent left sidebar at ≥1024px:
 * brand + create button + nav + footer, with the page content offset to the
 * right. Two stages, like CapCut itself: a compact ICON RAIL at 1024–1279px
 * (so tablets and half-snapped windows keep a roomy workspace) and the full
 * labeled sidebar at ≥1280px. Below 1024px nothing changes: mobile keeps its
 * stacked layout and bottom nav exactly as before.
 */

import { FolderOpen, Home, User, Wand2, Plus } from "lucide-react";
import { Link, Outlet } from "react-router-dom";
import { BrandMark } from "@/components/BottomNav";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";

const items = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/projects", label: "My Projects", icon: FolderOpen, end: false },
  { to: "/creator", label: "Creator Studio", icon: Wand2, end: false },
  { to: "/profile", label: "Profile", icon: User, end: false },
];

function DesktopSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-16 flex-col border-r border-border bg-background lg:flex xl:w-56">
      <div className="flex justify-center border-b border-border px-3 py-4 xl:justify-start xl:px-4">
        <Link
          to="/"
          aria-label="Visual Experience home"
          className="flex items-center justify-center gap-2 xl:justify-start"
        >
          <BrandMark wordmark={false} />
          <span className="hidden text-sm font-extrabold tracking-tight text-foreground xl:inline">
            Visual Experience
          </span>
        </Link>
      </div>

      <div className="px-3 py-3">
        <Button
          asChild
          aria-label="New template"
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Link to="/creator/new">
            <Plus className="h-4 w-4 xl:mr-2" />
            <span className="hidden xl:inline">New template</span>
          </Link>
        </Button>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={label}
            activeClassName="bg-primary/10 font-semibold text-primary"
            className="flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground xl:justify-start"
          >
            <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={2} />
            <span className="hidden xl:inline">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="hidden border-t border-border px-4 py-3 xl:block">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Visual Experience v2
          <br />
          Templates, not timelines.
        </p>
      </div>
    </aside>
  );
}

/** Layout route: sidebar on desktop, plain content on mobile. */
export default function AppLayout() {
  return (
    <div className="bg-background">
      <DesktopSidebar />
      <div className="lg:pl-16 xl:pl-56">
        <Outlet />
      </div>
    </div>
  );
}
