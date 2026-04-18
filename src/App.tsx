import { useEffect } from "react";
import { AuthProvider } from "@/context/AuthContext";
import RootRouter from "@/pages/RootRouter";
import { appName } from "@/lib/brand";
import { isSupabaseConfigured } from "@/lib/supabase";

function App() {
  useEffect(() => {
    document.title = appName;
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Configure {appName}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Copy <code className="rounded bg-slate-100 px-1.5 py-0.5">.env.example</code> to{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">.env.local</code> and set{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">VITE_SUPABASE_URL</code> and{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">VITE_SUPABASE_ANON_KEY</code>. Restart the dev server
            after editing.
          </p>
          <p className="mt-3 text-xs text-slate-400">
            See <code className="rounded bg-slate-100 px-1.5 py-0.5">supabase/README.md</code> for the full setup.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <RootRouter />
    </AuthProvider>
  );
}

export default App;
