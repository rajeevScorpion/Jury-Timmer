import { useState } from "react";
import { NavLink } from "react-router-dom";
import { LogOut, Menu, User } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { isSuperAdminEnabled } from "@/lib/appSettings";
import { cn } from "@/lib/utils";

const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
    isActive
      ? "bg-slate-900 text-white"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  );

const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
    isActive
      ? "bg-slate-900 text-white shadow-sm"
      : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
  );

const baseNavItems = [
  { to: "/jury", label: "Live" },
  { to: "/day/new", label: "New Day" },
  { to: "/history", label: "History" },
  { to: "/docs", label: "Docs" },
];

export default function TopNav() {
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = isSuperAdminEnabled
    ? [...baseNavItems, { to: "/admin", label: "Admin" }]
    : baseNavItems;

  return (
    <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 md:px-8">
          <BrandMark className="shrink-0" />

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={desktopLinkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <span className="max-w-[14rem] truncate text-xs text-slate-500">{user?.email}</span>
            <button
              onClick={() => void signOut()}
              className="flex items-center gap-1.5 rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 p-2.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 md:hidden"
            aria-label="Open navigation menu"
            aria-haspopup="dialog"
            aria-expanded={mobileOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      <DialogContent className="left-auto right-0 top-0 h-full max-h-none w-[min(23rem,calc(100%-0.75rem))] max-w-sm translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none rounded-l-[2rem] p-0 [&>button]:right-4 [&>button]:top-4">
        <div className="flex h-full flex-col">
          <DialogHeader className="border-b border-slate-200 px-5 pb-4 pt-5 text-left">
            <DialogTitle className="pr-10 text-xl">Menu</DialogTitle>
            <DialogDescription className="pr-10 text-sm text-slate-500">
              Navigate through {user?.email ? `${user.email}` : "your account"} and close when you&apos;re done.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-6 px-5 py-5">
            <nav className="space-y-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={mobileLinkClass}
                  onClick={() => setMobileOpen(false)}
                >
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                <User className="h-3.5 w-3.5" />
                Account
              </div>
              <div className="break-all text-sm font-medium text-slate-800">{user?.email ?? "Signed in"}</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Signed in session controls stay here on mobile to keep the top bar uncluttered.
              </p>
            </div>
          </div>

          <div className="border-t border-slate-200 px-5 py-4">
            <button
              type="button"
              onClick={async () => {
                setMobileOpen(false);
                await signOut();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
