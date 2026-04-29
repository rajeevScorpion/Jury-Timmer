import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BookmarkPlus } from "lucide-react";
import { createSnippet } from "@/lib/snippets";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedText: string;
  currentSubject: string | null;
  subjects: string[];
  onSaved: () => void;
};

export default function SaveSnippetDialog({
  open,
  onOpenChange,
  selectedText,
  currentSubject,
  subjects,
  onSaved,
}: Props) {
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState(currentSubject ?? "general");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset fields when dialog opens
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setLabel("");
      setScope(currentSubject ?? "general");
      setError(null);
    }
    onOpenChange(next);
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await createSnippet({ text: selectedText.trim(), label: label.trim(), scope });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save snippet.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save as Snippet</DialogTitle>
          <DialogDescription>
            Save this text for reuse across students.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
            {selectedText}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              Reference
            </label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Group A, SmartLamp project..."
              className="h-9 rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              Scope
            </label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="h-9 rounded-xl text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                {subjects.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              onClick={() => void handleSave()}
              disabled={saving || !selectedText.trim()}
            >
              <BookmarkPlus className="mr-1.5 h-4 w-4" />
              {saving ? "Saving..." : "Save Snippet"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
