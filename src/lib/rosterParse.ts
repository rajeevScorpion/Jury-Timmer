import type { RosterEntry } from "@/types/session";

export type RawRosterRow = {
  srNo: string;
  enrollmentNo: string;
  studentName: string;
};

export type RosterParseResult = {
  rows: RawRosterRow[];
  errors: string[];
};

const HEADER_RE = /^(sr\.?\s*no|#|s\.?\s*n|enrollment|enroll|student|name|roll)/i;

function detectDelimiter(lines: string[]): string {
  for (const line of lines.slice(0, 5)) {
    if (line.includes("\t")) return "\t";
  }
  return ",";
}

function isHeaderRow(line: string): boolean {
  return HEADER_RE.test(line.trim());
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === "\t") return line.split("\t").map((c) => c.trim());

  const cols: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      cols.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  return cols;
}

export function parseRosterText(text: string): RosterParseResult {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { rows: [], errors: [] };

  const delimiter = detectDelimiter(lines);
  let dataLines = lines;
  if (isHeaderRow(lines[0])) {
    dataLines = lines.slice(1);
  }

  const rows: RawRosterRow[] = [];
  const errors: string[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const cols = splitLine(dataLines[i], delimiter);
    const lineNum = i + 1;

    if (cols.length >= 3) {
      const name = cols[2].trim();
      if (!name) {
        errors.push(`Line ${lineNum}: student name is empty`);
        continue;
      }
      rows.push({ srNo: cols[0].trim(), enrollmentNo: cols[1].trim(), studentName: name });
    } else if (cols.length === 2) {
      const name = cols[1].trim();
      if (!name) {
        errors.push(`Line ${lineNum}: student name is empty`);
        continue;
      }
      rows.push({ srNo: String(lineNum), enrollmentNo: cols[0].trim(), studentName: name });
    } else if (cols.length === 1) {
      const name = cols[0].trim();
      if (!name) continue;
      rows.push({ srNo: String(lineNum), enrollmentNo: "", studentName: name });
    }
  }

  return { rows, errors };
}

export function rawToRosterEntries(rows: RawRosterRow[]): RosterEntry[] {
  return rows.map((row, i) => ({
    enrollmentNo: row.enrollmentNo,
    studentName: row.studentName,
    order: i + 1,
  }));
}
