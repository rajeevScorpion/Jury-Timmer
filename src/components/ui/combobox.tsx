import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const CUSTOM = "__custom__";

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  customPlaceholder?: string;
};

export function Combobox({ value, onChange, options, placeholder = "Select…", customPlaceholder = "Custom value" }: Props) {
  const isCustom = useMemo(
    () => value !== "" && !options.includes(value),
    [value, options],
  );
  const selectValue = isCustom ? CUSTOM : value;

  return (
    <div className="space-y-2">
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === CUSTOM) onChange("");
          else onChange(v);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Custom…</SelectItem>
        </SelectContent>
      </Select>
      {(isCustom || selectValue === CUSTOM) && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={customPlaceholder}
          autoFocus
        />
      )}
    </div>
  );
}
