import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fetchSnippets, deleteSnippet } from "@/lib/snippets";
import type { FeedbackSnippet } from "@/types/snippet";

type Props = {
  currentSubject: string | null;
  subjects: string[];
  onInsert: (text: string) => void;
};

export default function SnippetBrowser({
  currentSubject,
  subjects,
  onInsert,
}: Props) {
  const [snippets, setSnippets] = useState<FeedbackSnippet[]>([]);
  const [filterScope, setFilterScope] = useState<string>(
    currentSubject ?? "all",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSnippets(
        filterScope === "all" ? undefined : filterScope,
      );
      setSnippets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [filterScope]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this snippet?")) return;
    try {
      await deleteSnippet(id);
      setSnippets((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900">Snippets</h4>
        <select
          value={filterScope}
          onChange={(e) => setFilterScope(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
        >
          <option value="all">All</option>
          <option value="general">General</option>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <p className="text-[11px] text-red-500">{error}</p>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        </div>
      ) : snippets.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">
          No snippets yet. Select text in a feedback field and save it as a
          snippet.
        </p>
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {snippets.map((snippet) => (
            <div
              key={snippet.id}
              className={cn(
                "group relative cursor-pointer rounded-lg border border-slate-200 px-3 py-2 transition-colors",
                "hover:border-blue-300 hover:bg-blue-50/50",
              )}
              onClick={() => onInsert(snippet.text)}
              title="Click to insert"
            >
              {snippet.label && (
                <p className="mb-1 truncate pr-6 text-xs font-semibold text-slate-900">
                  {snippet.label}
                </p>
              )}
              <p className="line-clamp-2 pr-6 text-xs leading-relaxed text-slate-700">
                {snippet.text}
              </p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <Badge
                  variant="secondary"
                  className="px-1.5 py-0 text-[10px] font-medium"
                >
                  {snippet.scope === "general" ? "General" : snippet.scope}
                </Badge>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete(snippet.id);
                }}
                title="Delete snippet"
                className="absolute right-2 top-2 rounded-md p-1 text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
