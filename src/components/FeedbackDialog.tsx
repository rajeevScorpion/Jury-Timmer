import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Feedback } from "@/types/session";
import { Save, X } from "lucide-react";
import FeedbackEditor from "@/components/FeedbackEditor";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  subjects: string[];
  feedback: Feedback;
  onChange: (feedback: Feedback) => void;
  onSubmit: () => Promise<void>;
  saving: boolean;
  error: string | null;
};

export default function FeedbackDialog({
  open,
  onOpenChange,
  studentName,
  subjects,
  feedback,
  onChange,
  onSubmit,
  saving,
  error,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Feedback for {studentName}</DialogTitle>
          <DialogDescription>Record feedback before moving to the next student.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FeedbackEditor
            feedback={feedback}
            onChange={onChange}
            subjects={subjects}
            finalRequired
            finalAutoFocus
          />

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl sm:w-auto"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              <X className="mr-1.5 h-4 w-4" /> Cancel
            </Button>
            <Button
              type="button"
              className="w-full rounded-xl sm:w-auto"
              onClick={() => void onSubmit()}
              disabled={saving}
            >
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? "Saving..." : "Save & Continue"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
