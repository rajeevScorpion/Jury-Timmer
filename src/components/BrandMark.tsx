import { Link } from "react-router-dom";
import { appName } from "@/lib/brand";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
};

export default function BrandMark({ className }: BrandMarkProps) {
  return (
    <Link
      to="/"
      className={cn(
        "inline-flex items-center rounded-full border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-semibold lowercase tracking-[0.22em] text-slate-200 transition hover:bg-black hover:text-slate-100",
        className,
      )}
      aria-label={`Go to ${appName} home`}
      title={`${appName} home`}
    >
      {appName}
    </Link>
  );
}
