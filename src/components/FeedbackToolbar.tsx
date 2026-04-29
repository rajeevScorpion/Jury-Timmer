import { useRef, useState } from "react";
import { BookmarkPlus, Library } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import AiImproveButton from "@/components/AiImproveButton";
import SaveSnippetDialog from "@/components/SaveSnippetDialog";
import SnippetBrowser from "@/components/SnippetBrowser";

type Props = {
  text: string;
  onImproved: (improved: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  currentSubject: string | null;
  subjects: string[];
  onTextChange: (newFullText: string) => void;
};

export default function FeedbackToolbar({
  text,
  onImproved,
  textareaRef,
  currentSubject,
  subjects,
  onTextChange,
}: Props) {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [browserOpen, setBrowserOpen] = useState(false);
  const [snippetVersion, setSnippetVersion] = useState(0);

  // Store cursor position when browser opens (textarea loses focus when popover opens)
  const cursorPosRef = useRef<number | null>(null);

  const getSelectedText = (): string => {
    const ta = textareaRef.current;
    if (!ta) return "";
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) return "";
    return ta.value.slice(start, end);
  };

  const handleSaveSnippet = () => {
    const sel = getSelectedText();
    if (!sel.trim()) return;
    setSelectedText(sel);
    setSaveDialogOpen(true);
  };

  const handleBrowserOpenChange = (open: boolean) => {
    if (open) {
      // Capture cursor position before textarea loses focus
      const ta = textareaRef.current;
      cursorPosRef.current = ta ? ta.selectionStart : null;
    }
    setBrowserOpen(open);
  };

  const handleInsertSnippet = (snippetText: string) => {
    const ta = textareaRef.current;
    const pos = cursorPosRef.current;

    if (ta && pos !== null && pos >= 0) {
      const before = text.slice(0, pos);
      const after = text.slice(pos);
      const separator =
        before.length > 0 && !before.endsWith("\n") && !before.endsWith(" ")
          ? "\n"
          : "";
      onTextChange(before + separator + snippetText + after);
    } else {
      // No cursor position — append
      const separator = text.trim().length > 0 ? "\n" : "";
      onTextChange(text + separator + snippetText);
    }

    setBrowserOpen(false);
  };

  const hasSelection = (): boolean => {
    const ta = textareaRef.current;
    if (!ta) return false;
    return ta.selectionStart !== ta.selectionEnd;
  };

  return (
    <>
      <div className="flex items-center gap-1">
        {/* Save selection as snippet */}
        <button
          type="button"
          onClick={handleSaveSnippet}
          title="Save selection as snippet"
          className={cn(
            "rounded-md p-1 transition-colors",
            "text-slate-400 hover:bg-blue-50 hover:text-blue-600",
          )}
        >
          <BookmarkPlus className="h-3.5 w-3.5" />
        </button>

        {/* Browse snippets */}
        <Popover open={browserOpen} onOpenChange={handleBrowserOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Browse snippets"
              className={cn(
                "rounded-md p-1 transition-colors",
                browserOpen
                  ? "bg-blue-50 text-blue-600"
                  : "text-slate-400 hover:bg-blue-50 hover:text-blue-600",
              )}
            >
              <Library className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80" side="top">
            <SnippetBrowser
              key={snippetVersion}
              currentSubject={currentSubject}
              subjects={subjects}
              onInsert={handleInsertSnippet}
            />
          </PopoverContent>
        </Popover>

        {/* Separator */}
        <div className="mx-0.5 h-3 w-px bg-slate-200" />

        {/* Existing AI tools */}
        <AiImproveButton text={text} onImproved={onImproved} />
      </div>

      {/* Save dialog */}
      <SaveSnippetDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        selectedText={selectedText}
        currentSubject={currentSubject}
        subjects={subjects}
        onSaved={() => setSnippetVersion((v) => v + 1)}
      />
    </>
  );
}
