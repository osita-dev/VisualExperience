import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BottomNav, BrandMark } from "@/components/BottomNav";

const NotFound = () => {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <BrandMark />
        <h1 className="text-6xl font-black text-primary">404</h1>
        <p className="text-base font-semibold text-foreground">
          This frame doesn't exist
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          The page you're after was moved, deleted, or never cut in the first
          place.
        </p>
        <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Link to="/">Back to the template shelf</Link>
        </Button>
      </main>
      <BottomNav />
    </div>
  );
};

export default NotFound;
