import { useRef, useState } from "react";
import { Loader2, Mic, MicOff, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { improveFeedback, transcribeAndRefine } from "@/lib/ai-feedback";

type Props = {
  text: string;
  onImproved: (improved: string) => void;
};

export default function AiImproveButton({ text, onImproved }: Props) {
  // Improve state
  const [improving, setImproving] = useState(false);
  const [original, setOriginal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Recording state
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const canImprove = text.trim().length >= 10 && !improving && !transcribing;
  const canRevert = original !== null && !improving;
  const busy = improving || transcribing;

  const handleImprove = async () => {
    setError(null);
    setOriginal(text);
    setImproving(true);
    try {
      const result = await improveFeedback(text);
      onImproved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI failed");
      setOriginal(null);
    } finally {
      setImproving(false);
    }
  };

  const handleRevert = () => {
    if (original !== null) {
      onImproved(original);
      setOriginal(null);
    }
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunks.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        chunks.current = [];

        if (blob.size === 0) {
          setError("No audio recorded");
          return;
        }

        setTranscribing(true);
        try {
          const refined = await transcribeAndRefine(blob);
          const separator = text.trim().length > 0 ? " " : "";
          onImproved(text + separator + refined);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      mediaRecorder.current = recorder;
      setRecording(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Microphone access denied"
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
      mediaRecorder.current = null;
    }
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="flex items-center gap-1">
      {error && (
        <span className="text-[10px] text-red-500 max-w-[140px] truncate mr-1" title={error}>
          {error}
        </span>
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
        title={canImprove ? "Improve writing with AI" : "Type more text to use AI"}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
          improving
            ? "text-blue-500"
            : canImprove
            ? "text-slate-500 hover:bg-blue-50 hover:text-blue-600"
            : "text-slate-300 cursor-not-allowed"
        )}
      >
        {improving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : null}
        Improve
      </button>

      <button
        type="button"
        onClick={toggleRecording}
        disabled={busy && !recording}
        title={recording ? "Stop recording" : "Record voice note"}
        className={cn(
          "rounded-md p-1 transition-colors",
          transcribing
            ? "text-blue-400"
            : recording
            ? "text-red-500 animate-pulse hover:text-red-600"
            : "text-slate-400 hover:bg-blue-50 hover:text-blue-600"
        )}
      >
        {transcribing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : recording ? (
          <MicOff className="h-3.5 w-3.5" />
        ) : (
          <Mic className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
