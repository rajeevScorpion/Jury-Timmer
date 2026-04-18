import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import BrandMark from "@/components/BrandMark";
import { supabase } from "@/lib/supabase";

export default function LoginGate() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <BrandMark className="mb-6" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sign in with your Google account to run a jury day.
        </p>
        <div className="mt-6">
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
            providers={["google"]}
            onlyThirdPartyProviders
            redirectTo={window.location.origin}
          />
        </div>
      </div>
    </div>
  );
}
