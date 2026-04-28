import { useState } from "react";
import { Loader2, Sparkles, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { improveFeedback } from "@/lib/ai-feedback";

type Props = {
  text: string;
  onImproved: (improved: string) => void;
};

export default function AiImproveButton({ text, onImproved }: Props) {
  const [loading, setLoading] = useState(false);
  const [original, setOriginal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canImprove = text.trim().length >= 10 && !loading;
  const canRevert = original !== null && !loading;

  const handleImprove = async () => {
    setError(null);
    setOriginal(text);
    setLoading(true);
    try {
      const result = await improveFeedback(text);
      onImproved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI failed");
      setOriginal(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRevert = () => {
    if (original !== null) {
      onImproved(original);
      setOriginal(null);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {error && (
        <span className="text-[10px] text-red-500 mr-1">{error}</span>
      )}

      {canRevert && (
        <button
          type="button"
          onClick={handleRevert}
          title="Revert to original"
          className={cn(
            "rounded-md p-1 text-slate-400 transition-colors",
            "hover:bg-slate-100 hover:text-slate-600"
          )}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
      )}

      <button
        type="button"
        onClick={handleImprove}
        disabled={!canImprove}
        title={canImprove ? "AI: improve writing" : "Type more text to use AI"}
        className={cn(
          "rounded-md p-1 transition-colors",
          loading
            ? "text-blue-400"
            : canImprove
            ? "text-slate-400 hover:bg-blue-50 hover:text-blue-600"
            : "text-slate-300 cursor-not-allowed"
        )}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
