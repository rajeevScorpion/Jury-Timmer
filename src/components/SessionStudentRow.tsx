import { type MouseEvent, useState } from "react";
import { ChevronDown, ChevronUp, FileDown, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exportStudentPdf } from "@/lib/pdf";
import { fmt } from "@/lib/timeFormat";
import type { JurySession, StudentRecord } from "@/types/session";

type SessionStudentRowProps = {
  session: JurySession;
  record: StudentRecord;
};

export default function SessionStudentRow({ session, record }: SessionStudentRowProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handlePdf = async (event: MouseEvent) => {
    event.stopPropagation();
    try {
      setExporting(true);
      await exportStudentPdf(session, record);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex flex-1 flex-wrap items-center gap-3 text-left"
        >
          <span className="w-8 text-xs font-medium text-slate-400">#{record.student_order}</span>
          <span className="font-semibold text-slate-900">{record.student_name}</span>
          <span className="text-xs tabular-nums text-slate-500">
            Total {fmt(record.total_time_used_seconds)} / Setup {fmt(record.setup_seconds)} / Pres{" "}
            {fmt(record.presentation_seconds)}
          </span>
          {record.overtime_seconds > 0 && (
            <Badge variant="outline" className="rounded-full border-red-200 text-red-700">
              +{fmt(record.overtime_seconds)} over
            </Badge>
          )}
          {record.time_saved_seconds > 0 && (
            <Badge variant="outline" className="rounded-full border-emerald-200 text-emerald-700">
              {fmt(record.time_saved_seconds)} saved
            </Badge>
          )}
        </button>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={handlePdf}
            disabled={exporting}
          >
            <FileDown className="mr-1.5 h-4 w-4" />
            {exporting ? "Generating..." : "PDF"}
          </Button>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={open ? "Collapse student feedback" : "Expand student feedback"}
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-4 text-sm">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-slate-500">
              <FileText className="h-3 w-3" /> Final feedback
            </div>
            <div className="whitespace-pre-wrap text-slate-700">
              {record.feedback?.final || <span className="text-slate-400">-</span>}
            </div>
          </div>

          {record.feedback?.perSubject && Object.keys(record.feedback.perSubject).length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-widest text-slate-500">
                Per-subject notes
              </div>
              <div className="space-y-1.5">
                {Object.entries(record.feedback.perSubject).map(([subject, note]) => (
                  <div key={subject} className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-600">{subject}</div>
                    <div className="mt-0.5 whitespace-pre-wrap text-slate-700">{note}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
            <span>Setup started {formatEventTime(record.setup_started_at)}</span>
            <span>Presented {formatEventTime(record.presentation_started_at)}</span>
            <span>Ended {formatEventTime(record.ended_at)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatEventTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
