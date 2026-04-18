import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  customPlaceholder?: string;
};

export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select...",
  customPlaceholder = "Type a custom value",
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalizedValue = value.trim().toLowerCase();
  const exactMatch = useMemo(
    () => options.find((option) => option.toLowerCase() === normalizedValue) ?? null,
    [normalizedValue, options],
  );

  const filteredOptions = useMemo(() => {
    if (!normalizedValue) return options;
    return options.filter((option) => option.toLowerCase().includes(normalizedValue));
  }, [normalizedValue, options]);

  const showCreateHint =
    normalizedValue.length > 0 &&
    !exactMatch &&
    filteredOptions.every((option) => option.toLowerCase() !== normalizedValue);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    setHighlightedIndex(0);
  }, [open, normalizedValue]);

  const selectOption = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    inputRef.current?.focus();
  };

  const activateCustomEntry = () => {
    setOpen(true);
    if (exactMatch) onChange("");
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setHighlightedIndex((current) =>
              filteredOptions.length === 0 ? 0 : Math.min(current + 1, filteredOptions.length - 1),
            );
            return;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setHighlightedIndex((current) => Math.max(current - 1, 0));
            return;
          }

          if (event.key === "Enter" && open && filteredOptions[highlightedIndex]) {
            event.preventDefault();
            selectOption(filteredOptions[highlightedIndex]);
            return;
          }

          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="pr-10"
      />

      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 transition hover:text-slate-700"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setOpen((current) => !current);
          inputRef.current?.focus();
        }}
        aria-label={open ? "Close options" : "Open options"}
      >
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="max-h-60 overflow-y-auto py-1">
            {filteredOptions.map((option, index) => {
              const isSelected = option === exactMatch;
              const isHighlighted = index === highlightedIndex;

              return (
                <button
                  key={option}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 transition",
                    isHighlighted && "bg-slate-50",
                    isSelected && "text-slate-950",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => selectOption(option)}
                >
                  <span>{option}</span>
                  {isSelected && <Check className="h-4 w-4 text-slate-500" />}
                </button>
              );
            })}

            <button
              type="button"
              className={cn(
                "flex w-full items-start gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm transition",
                filteredOptions.length === 0 && "border-t-0",
                showCreateHint ? "text-slate-900" : "text-slate-500",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={activateCustomEntry}
            >
              <span className="font-medium">Custom...</span>
              <span className="text-xs text-slate-400">{customPlaceholder}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
