import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Feedback } from "@/types/session";

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

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium uppercase tracking-widest text-slate-500">
          Overall feedback {finalRequired && <span className="text-red-500">*</span>}
        </label>
        <Textarea
          value={feedback.final}
          onChange={(e) => updateFinal(e.target.value)}
          placeholder="Overall feedback for the student..."
          rows={compact ? 5 : 6}
          autoFocus={finalAutoFocus}
          className="mt-3 min-h-[132px] bg-white leading-relaxed"
        />
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
                    <Textarea
                      ref={(node) => {
                        subjectRefs.current[subject] = node;
                      }}
                      value={note}
                      onChange={(e) => updateSubject(subject, e.target.value)}
                      rows={compact ? 4 : 5}
                      placeholder={`Notes on ${subject}...`}
                      className="min-h-[120px] leading-relaxed"
                    />
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
