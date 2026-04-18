import { useEffect, useState } from "react";
import { Save, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_FEEDBACK_MODE,
  feedbackModeDescription,
  feedbackModeOptions,
  fetchDefaultFeedbackMode,
  saveDefaultFeedbackMode,
} from "@/lib/appSettings";
import type { FeedbackMode } from "@/types/session";

export default function AdminView() {
  const [mode, setMode] = useState<FeedbackMode>(DEFAULT_FEEDBACK_MODE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const currentMode = await fetchDefaultFeedbackMode();
        if (!cancelled) setMode(currentMode);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load settings.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await saveDefaultFeedbackMode(mode);
      setSavedAt(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 md:px-8">
      <header>
        <div className="mb-2 flex items-center gap-2 text-slate-500">
          <Shield className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-widest">Admin</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Global Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Set the default feedback mode for new jury days. Faculty can still override it per session.
        </p>
      </header>

      <Card className="rounded-3xl border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Default feedback mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-widest text-slate-500">
              New jury days
            </label>
            <Select value={mode} onValueChange={(value) => setMode(value as FeedbackMode)} disabled={loading || saving}>
              <SelectTrigger>
                <SelectValue placeholder="Select feedback mode" />
              </SelectTrigger>
              <SelectContent>
                {feedbackModeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-slate-500">{feedbackModeDescription(mode)}</p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Admin access is controlled only by the frontend env flag{" "}
            <code className="rounded bg-white px-1.5 py-0.5">VITE_IS_SUPER_ADMIN=true</code>. This is a
            temporary Phase 2 shortcut, not a secure backend role system.
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              {savedAt
                ? `Last saved at ${savedAt}`
                : "Changes become the default for newly created jury days."}
            </div>
            <Button type="button" className="rounded-2xl px-6" onClick={handleSave} disabled={loading || saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save default"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
