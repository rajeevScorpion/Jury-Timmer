import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Feedback } from "@/types/session";
import { Save, X } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  subjects: string[];
  onSubmit: (feedback: Feedback) => Promise<void>;
};

export default function FeedbackDialog({ open, onOpenChange, studentName, subjects, onSubmit }: Props) {
  const [final, setFinal] = useState("");
  const [perSubject, setPerSubject] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFinal("");
    setPerSubject({});
    setError(null);
  };

  const handleSubmit = async () => {
    if (!final.trim()) {
      setError("Final feedback is required.");
      return;
    }
    try {
      setSaving(true);
      await onSubmit({
        final: final.trim(),
        perSubject: Object.fromEntries(
          Object.entries(perSubject)
            .map(([k, v]) => [k, v.trim()])
            .filter(([, v]) => v !== ""),
        ),
      });
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Feedback · {studentName}</DialogTitle>
          <DialogDescription>Record feedback before moving to the next student.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500">
              Final feedback <span className="text-red-500">*</span>
            </label>
            <Textarea
              value={final}
              onChange={(e) => setFinal(e.target.value)}
              placeholder="Overall feedback for the student…"
              rows={4}
              autoFocus
            />
          </div>

          {subjects.length > 0 && (
            <details className="rounded-xl border border-slate-200 p-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">
                Per-subject notes (optional)
              </summary>
              <div className="mt-3 space-y-3">
                {subjects.map((s) => (
                  <div key={s}>
                    <label className="mb-1 block text-xs font-medium text-slate-500">{s}</label>
                    <Textarea
                      value={perSubject[s] ?? ""}
                      onChange={(e) => setPerSubject((p) => ({ ...p, [s]: e.target.value }))}
                      rows={2}
                      placeholder={`Notes on ${s}…`}
                    />
                  </div>
                ))}
              </div>
            </details>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={saving}>
              <X className="mr-1.5 h-4 w-4" /> Cancel
            </Button>
            <Button type="button" className="rounded-xl" onClick={handleSubmit} disabled={saving}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? "Saving…" : "Save & Continue"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
