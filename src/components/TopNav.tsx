import { NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { isSuperAdminEnabled } from "@/lib/appSettings";
import { cn } from "@/lib/utils";
import BrandMark from "@/components/BrandMark";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
    isActive
      ? "bg-slate-900 text-white"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  );

export default function TopNav() {
  const { user, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 md:px-8">
        <BrandMark className="shrink-0" />
        <nav className="flex items-center gap-1">
          <NavLink to="/jury" className={linkClass}>
            Live
          </NavLink>
          <NavLink to="/day/new" className={linkClass}>
            New Day
          </NavLink>
          <NavLink to="/history" className={linkClass}>
            History
          </NavLink>
          <NavLink to="/docs" className={linkClass}>
            Docs
          </NavLink>
          {isSuperAdminEnabled && (
            <NavLink to="/admin" className={linkClass}>
              Admin
            </NavLink>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-slate-500 sm:inline">
            {user?.email}
          </span>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
