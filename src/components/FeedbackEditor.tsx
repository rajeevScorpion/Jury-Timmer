import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Sparkles, Undo2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Feedback } from "@/types/session";
import FeedbackToolbar from "@/components/FeedbackToolbar";
import { generateOverallFeedback } from "@/lib/ai-feedback";

type Props = {
  feedback: Feedback;
  onChange: (feedback: Feedback) => void;
  subjects: string[];
  activeSubject?: string | null;
  finalRequired?: boolean;
  finalAutoFocus?: boolean;
  compact?: boolean;
};

export default function FeedbackEditor({
  feedback,
  onChange,
  subjects,
  activeSubject = null,
  finalRequired = false,
  finalAutoFocus = false,
  compact = false,
}: Props) {
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const subjectRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const overallRef = useRef<HTMLTextAreaElement | null>(null);

  // Generate-overall state
  const [generatingOverall, setGeneratingOverall] = useState(false);
  const [originalOverall, setOriginalOverall] = useState<string | null>(null);
  const [overallError, setOverallError] = useState<string | null>(null);

  useEffect(() => {
    setExpandedSubject((current) => {
      if (current && subjects.includes(current)) return current;
      return activeSubject ?? subjects[0] ?? null;
    });
  }, [subjects, activeSubject]);

  const updateFinal = (value: string) => {
    onChange({
      ...feedback,
      final: value,
    });
  };

  const updateSubject = (subject: string, value: string) => {
    onChange({
      ...feedback,
      perSubject: {
        ...feedback.perSubject,
        [subject]: value,
      },
    });
  };

  const toggleSubject = (subject: string, note: string) => {
    const activeElement = document.activeElement;
    const hadTextareaFocus = activeElement instanceof HTMLTextAreaElement;

    if (hadTextareaFocus) {
      activeElement.blur();
    }

    setExpandedSubject((current) => {
      const next = current === subject ? null : subject;

      if (next && hadTextareaFocus) {
        requestAnimationFrame(() => {
          const field = subjectRefs.current[next];
          if (!field) return;
          field.focus();
          const cursor = note.length;
          field.setSelectionRange(cursor, cursor);
        });
      }

      return next;
    });
  };

  const handleGenerateOverall = async () => {
    setOverallError(null);
    setOriginalOverall(feedback.final);
    setGeneratingOverall(true);
    try {
      const result = await generateOverallFeedback(
        feedback.perSubject,
        feedback.final
      );
      updateFinal(result);
    } catch (err) {
      setOverallError(err instanceof Error ? err.message : "AI failed");
      setOriginalOverall(null);
    } finally {
      setGeneratingOverall(false);
    }
  };

  const handleRevertOverall = () => {
    if (originalOverall !== null) {
      updateFinal(originalOverall);
      setOriginalOverall(null);
    }
  };

  const hasAnySubjectContent = Object.values(feedback.perSubject).some(
    (v) => v.trim().length > 0
  );
  const canGenerateOverall =
    (hasAnySubjectContent || feedback.final.trim().length >= 5) &&
    !generatingOverall;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium uppercase tracking-widest text-slate-500">
          Overall feedback {finalRequired && <span className="text-red-500">*</span>}
        </label>
        <div className="relative mt-3">
          <Textarea
            ref={overallRef}
            value={feedback.final}
            onChange={(e) => updateFinal(e.target.value)}
            placeholder="Overall feedback for the student..."
            rows={compact ? 5 : 6}
            autoFocus={finalAutoFocus}
            className="min-h-[132px] bg-white pr-10 pb-8 leading-relaxed"
          />
          <div className="absolute bottom-2 right-2">
            <FeedbackToolbar
              text={feedback.final}
              onImproved={updateFinal}
              textareaRef={overallRef}
              currentSubject={null}
              subjects={subjects}
              onTextChange={updateFinal}
            />
          </div>
        </div>

        {/* Generate Overall Feedback button */}
        {subjects.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleGenerateOverall}
              disabled={!canGenerateOverall}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                canGenerateOverall
                  ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  : "cursor-not-allowed bg-slate-50 text-slate-400"
              )}
            >
              {generatingOverall ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Generate from subjects
            </button>

            {originalOverall !== null && !generatingOverall && (
              <button
                type="button"
                onClick={handleRevertOverall}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <Undo2 className="h-3 w-3" />
                Revert
              </button>
            )}

            {overallError && (
              <span className="text-[11px] text-red-500">{overallError}</span>
            )}
          </div>
        )}
      </div>

      {subjects.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-medium uppercase tracking-widest text-slate-500">
            Per-subject notes
          </div>

          {subjects.map((subject) => {
            const note = feedback.perSubject[subject] ?? "";
            const expanded = expandedSubject === subject;
            const isLiveSubject = activeSubject === subject;
            const hasNote = note.trim().length > 0;

            return (
              <div
                key={subject}
                className={cn(
                  "overflow-hidden rounded-2xl bg-white ring-1 transition-all",
                  expanded ? "shadow-sm ring-slate-300" : "ring-slate-200",
                  isLiveSubject && "bg-slate-50 ring-slate-900/20",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleSubject(subject, note)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                  aria-expanded={expanded}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{subject}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {isLiveSubject
                        ? "Current subject"
                        : hasNote
                        ? "Notes added"
                        : "Optional notes"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isLiveSubject && (
                      <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white">
                        Live
                      </span>
                    )}
                    {expanded ? (
                      <ChevronUp className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-slate-200 px-4 pb-4 pt-3">
                    <div className="relative">
                      <Textarea
                        ref={(node) => {
                          subjectRefs.current[subject] = node;
                        }}
                        value={note}
                        onChange={(e) => updateSubject(subject, e.target.value)}
                        rows={compact ? 4 : 5}
                        placeholder={`Notes on ${subject}...`}
                        className="min-h-[120px] pb-8 leading-relaxed"
                      />
                      <div className="absolute bottom-2 right-2">
                        <FeedbackToolbar
                          text={note}
                          onImproved={(improved) =>
                            updateSubject(subject, improved)
                          }
                          textareaRef={{ current: subjectRefs.current[subject] ?? null }}
                          currentSubject={subject}
                          subjects={subjects}
                          onTextChange={(t) => updateSubject(subject, t)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
