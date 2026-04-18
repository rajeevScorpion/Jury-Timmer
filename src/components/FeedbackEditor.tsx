import { useEffect, useState } from "react";
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
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpandedSubjects((prev) => {
      const defaultExpanded = activeSubject ?? subjects[0] ?? null;
      return Object.fromEntries(
        subjects.map((subject) => [subject, prev[subject] ?? subject === defaultExpanded]),
      );
    });
  }, [subjects, activeSubject]);

  useEffect(() => {
    if (!activeSubject) return;
    setExpandedSubjects((prev) =>
      prev[activeSubject] ? prev : { ...prev, [activeSubject]: true },
    );
  }, [activeSubject]);

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

  const toggleSubject = (subject: string) => {
    setExpandedSubjects((prev) => ({
      ...prev,
      [subject]: !prev[subject],
    }));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500">
          Overall feedback {finalRequired && <span className="text-red-500">*</span>}
        </label>
        <Textarea
          value={feedback.final}
          onChange={(e) => updateFinal(e.target.value)}
          placeholder="Overall feedback for the student..."
          rows={compact ? 4 : 5}
          autoFocus={finalAutoFocus}
        />
      </div>

      {subjects.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-widest text-slate-500">
            Per-subject notes
          </div>
          {subjects.map((subject) => {
            const note = feedback.perSubject[subject] ?? "";
            const expanded = !!expandedSubjects[subject];
            const isActive = activeSubject === subject;

            return (
              <div
                key={subject}
                className={cn(
                  "overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 transition-all",
                  isActive && "bg-slate-50 ring-slate-900",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleSubject(subject)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{subject}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {note.trim()
                        ? "Notes added"
                        : isActive
                        ? "Current subject"
                        : "Optional notes"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isActive && (
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white">
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
                  <div className="border-t border-slate-200 px-4 py-3">
                    <Textarea
                      value={note}
                      onChange={(e) => updateSubject(subject, e.target.value)}
                      rows={compact ? 3 : 4}
                      placeholder={`Notes on ${subject}...`}
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
