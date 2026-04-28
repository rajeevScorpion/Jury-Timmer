import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, ArrowUp, ArrowDown, Play, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/context/SessionContext";
import { computePerStudentPlan, TimingConfigError } from "@/lib/timing";
import { fmtHM } from "@/lib/timeFormat";
import {
  DEFAULT_FEEDBACK_MODE,
  feedbackModeDescription,
  feedbackModeLabel,
  feedbackModeOptions,
  fetchDefaultFeedbackMode,
} from "@/lib/appSettings";
import type { FeedbackMode, RosterEntry } from "@/types/session";
import { parseRosterText, rawToRosterEntries } from "@/lib/rosterParse";

const SECTIONS = ["A", "B", "C", "D", "E"];
const SEMESTERS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
const JURY_TYPES = ["Mid Sem", "End Sem"];

function academicYearOptions(now: Date): string[] {
  const start = now.getFullYear() - 1;
  return Array.from({ length: 6 }, (_, i) => {
    const a = (start + i) % 100;
    const b = (start + i + 1) % 100;
    return `${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  });
}

export default function DaySetupForm() {
  const navigate = useNavigate();
  const { createSession } = useSession();

  const [juryType, setJuryType] = useState("Mid Sem");
  const [department, setDepartment] = useState("");
  const [section, setSection] = useState("");
  const [semester, setSemester] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [hours, setHours] = useState(2);
  const [minutes, setMinutes] = useState(0);
  const [studentCount, setStudentCount] = useState(6);
  const [bufferMinutes, setBufferMinutes] = useState(5);
  const [feedbackMinutes, setFeedbackMinutes] = useState(2);
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>(DEFAULT_FEEDBACK_MODE);
  const [subjects, setSubjects] = useState<string[]>(["", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [settingsHint, setSettingsHint] = useState("Loading admin default...");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterMode, setRosterMode] = useState<"manual" | "roster">("manual");
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const feedbackModeTouched = useRef(false);

  const ayOptions = useMemo(() => academicYearOptions(new Date()), []);

  const totalSeconds = hours * 3600 + minutes * 60;
  const bufferSeconds = bufferMinutes * 60;
  const feedbackSeconds = feedbackMinutes * 60;
  const cleanSubjects = subjects.map((subject) => subject.trim()).filter(Boolean);

  const preview = useMemo(() => {
    if (!cleanSubjects.length || studentCount < 1 || totalSeconds <= 0) return null;
    try {
      return computePerStudentPlan({
        totalSeconds,
        students: studentCount,
        bufferSeconds,
        subjects: cleanSubjects,
        feedbackSeconds,
      });
    } catch {
      return null;
    }
  }, [totalSeconds, studentCount, bufferSeconds, cleanSubjects, feedbackSeconds]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const mode = await fetchDefaultFeedbackMode();
      if (cancelled) return;
      if (!feedbackModeTouched.current) setFeedbackMode(mode);
      setSettingsHint("Prefilled from Admin default. You can override it for this jury day.");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (rosterMode === "roster" && roster.length > 0) {
      setStudentCount(roster.length);
    }
  }, [roster, rosterMode]);

  const handleParseRoster = () => {
    setRosterError(null);
    const result = parseRosterText(pasteText);
    if (result.errors.length > 0) {
      setRosterError(result.errors.join("; "));
      return;
    }
    if (result.rows.length === 0) {
      setRosterError("No students found. Check the format.");
      return;
    }
    setRoster(rawToRosterEntries(result.rows));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setPasteText(text);
      setRosterError(null);
      const result = parseRosterText(text);
      if (result.errors.length > 0) {
        setRosterError(result.errors.join("; "));
      } else if (result.rows.length === 0) {
        setRosterError("No students found in file.");
      } else {
        setRoster(rawToRosterEntries(result.rows));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const removeRosterEntry = (index: number) => {
    setRoster((prev) =>
      prev.filter((_, i) => i !== index).map((entry, i) => ({ ...entry, order: i + 1 })),
    );
  };

  const updateSubject = (index: number, value: string) =>
    setSubjects((prev) => prev.map((subject, currentIndex) => (currentIndex === index ? value : subject)));

  const addSubject = () => setSubjects((prev) => [...prev, ""]);

  const removeSubject = (index: number) =>
    setSubjects((prev) => prev.filter((_, currentIndex) => currentIndex !== index));

  const moveSubject = (index: number, direction: -1 | 1) =>
    setSubjects((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });

  const handleFeedbackModeChange = (value: string) => {
    feedbackModeTouched.current = true;
    setFeedbackMode(value as FeedbackMode);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!juryType.trim()) return setError("Jury type is required.");
    if (!department.trim()) return setError("Department is required.");
    if (!section.trim()) return setError("Section is required.");
    if (!semester.trim()) return setError("Semester is required.");
    if (!academicYear.trim()) return setError("Academic year is required.");
    if (cleanSubjects.length < 1) return setError("Add at least one subject.");
    if (studentCount < 1) return setError("Need at least one student.");

    try {
      setSubmitting(true);
      await createSession({
        jury_type: juryType.trim(),
        department: department.trim(),
        section: section.trim(),
        semester: semester.trim(),
        academic_year: academicYear.trim(),
        total_time_seconds: totalSeconds,
        number_of_students: studentCount,
        buffer_seconds: bufferSeconds,
        subjects: cleanSubjects,
        feedback_seconds: feedbackSeconds,
        feedback_mode: feedbackMode,
        student_roster: rosterMode === "roster" && roster.length > 0 ? roster : null,
      });
      navigate("/jury");
    } catch (err) {
      if (err instanceof TimingConfigError) setError(err.message);
      else setError(err instanceof Error ? err.message : "Failed to create session.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <form onSubmit={onSubmit} className="space-y-5">
        <Card className="rounded-3xl border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Jury Day</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <Field label="Jury Type">
              <Combobox
                value={juryType}
                onChange={setJuryType}
                options={JURY_TYPES}
                placeholder="Select jury type"
                customPlaceholder="Enter custom jury type"
              />
            </Field>
            <Field label="Department">
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Communication Design"
              />
            </Field>
            <Field label="Section">
              <Combobox
                value={section}
                onChange={setSection}
                options={SECTIONS}
                placeholder="Select section"
                customPlaceholder="Custom section"
              />
            </Field>
            <Field label="Semester">
              <Combobox
                value={semester}
                onChange={setSemester}
                options={SEMESTERS}
                placeholder="Select semester"
                customPlaceholder="Custom semester"
              />
            </Field>
            <Field label="Academic Year">
              <Combobox
                value={academicYear}
                onChange={setAcademicYear}
                options={ayOptions}
                placeholder="Select year"
                customPlaceholder="e.g. 26-27"
              />
            </Field>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Time & Students</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <Field label="Total available time">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    min={0}
                    value={hours}
                    onChange={(e) => setHours(Math.max(0, Number(e.target.value) || 0))}
                  />
                  <div className="mt-1 text-xs text-slate-400">Hours</div>
                </div>
                <div className="flex-1">
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    value={minutes}
                    onChange={(e) =>
                      setMinutes(Math.max(0, Math.min(59, Number(e.target.value) || 0)))
                    }
                  />
                  <div className="mt-1 text-xs text-slate-400">Minutes</div>
                </div>
              </div>
            </Field>
            <Field label="Number of students">
              <Input
                type="number"
                min={1}
                value={studentCount}
                onChange={(e) => setStudentCount(Math.max(1, Number(e.target.value) || 1))}
                readOnly={rosterMode === "roster" && roster.length > 0}
                className={rosterMode === "roster" && roster.length > 0 ? "bg-slate-50" : ""}
              />
              {rosterMode === "roster" && roster.length > 0 && (
                <div className="mt-1 text-xs text-slate-400">Auto-set from roster ({roster.length} students)</div>
              )}
            </Field>
            <Field label="Buffer between students (minutes)">
              <Input
                type="number"
                min={0}
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
            <Field label="Final feedback duration (minutes)">
              <Input
                type="number"
                min={0}
                value={feedbackMinutes}
                onChange={(e) => setFeedbackMinutes(Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
            <Field label="Feedback mode">
              <Select value={feedbackMode} onValueChange={handleFeedbackModeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select feedback mode" />
                </SelectTrigger>
                <SelectContent>
                  {feedbackModeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-1 space-y-1 text-xs text-slate-400">
                <p>{settingsHint}</p>
                <p>{feedbackModeDescription(feedbackMode)}</p>
              </div>
            </Field>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-0 shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-xl">Student Roster</CardTitle>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={rosterMode === "manual" ? "default" : "outline"}
                size="sm"
                className="rounded-full"
                onClick={() => setRosterMode("manual")}
              >
                Manual Entry
              </Button>
              <Button
                type="button"
                variant={rosterMode === "roster" ? "default" : "outline"}
                size="sm"
                className="rounded-full"
                onClick={() => setRosterMode("roster")}
              >
                Upload Roster
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {rosterMode === "roster" ? (
              <div className="space-y-4">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={"Paste CSV or tabular data here:\nSr. No, Enrollment No., Student Name\n1, EN001, Aavriti Sharma\n2, EN002, Rohan Patel"}
                  className="h-32 w-full rounded-2xl border border-slate-200 bg-white p-4 font-mono text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={handleParseRoster}>
                    Parse Roster
                  </Button>
                  <label className="cursor-pointer">
                    <Button type="button" variant="outline" size="sm" className="rounded-full pointer-events-none">
                      <Upload className="mr-1 h-4 w-4" /> Upload CSV
                    </Button>
                    <input type="file" accept=".csv,.txt,.tsv" hidden onChange={handleFileUpload} />
                  </label>
                  {roster.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => { setRoster([]); setPasteText(""); }}
                    >
                      Clear Roster
                    </Button>
                  )}
                </div>

                {rosterError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {rosterError}
                  </div>
                )}

                {roster.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-600">{roster.length} students loaded</div>
                    <div className="max-h-64 overflow-y-auto rounded-2xl ring-1 ring-slate-200">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="px-4 py-2">#</th>
                            <th className="px-4 py-2">Enrollment</th>
                            <th className="px-4 py-2">Name</th>
                            <th className="w-12 px-4 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {roster.map((entry, i) => (
                            <tr key={i} className="border-t border-slate-100">
                              <td className="px-4 py-2 text-slate-400">{entry.order}</td>
                              <td className="px-4 py-2 font-mono text-xs">{entry.enrollmentNo || "—"}</td>
                              <td className="px-4 py-2">{entry.studentName}</td>
                              <td className="px-4 py-2">
                                <button type="button" onClick={() => removeRosterEntry(i)} className="text-red-400 hover:text-red-600">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Student names will be entered one at a time during the jury.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-0 shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-xl">Subjects</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSubject}
              className="w-full rounded-full sm:w-auto"
            >
              <Plus className="mr-1 h-4 w-4" /> Add subject
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {subjects.map((subject, index) => (
              <div key={index} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 sm:bg-transparent sm:p-0 sm:ring-0">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="w-8 text-center text-xs font-medium text-slate-400">{index + 1}</div>
                  <Input
                    value={subject}
                    onChange={(e) => updateSubject(index, e.target.value)}
                    placeholder={`Subject ${index + 1}`}
                  />
                  <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full px-2"
                      onClick={() => moveSubject(index, -1)}
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full px-2"
                      onClick={() => moveSubject(index, 1)}
                      disabled={index === subjects.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full px-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => removeSubject(index)}
                      disabled={subjects.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-400">
              Subjects present in order. A final feedback segment is added automatically.
            </p>
          </CardContent>
        </Card>

        {preview && (
          <Card className="rounded-3xl border-0 bg-slate-50 shadow-none ring-1 ring-slate-200">
            <CardContent className="grid gap-3 py-5 text-sm sm:grid-cols-2 xl:grid-cols-5">
              <Stat label="Per student" value={fmtHM(preview.totalSeconds)} />
              <Stat label="Per subject" value={fmtHM(preview.perSubjectSeconds)} />
              <Stat label="Final feedback" value={fmtHM(preview.feedbackSeconds)} />
              <Stat label="Feedback mode" value={feedbackModeLabel(feedbackMode)} />
              <Stat
                label="Buffer x (n-1)"
                value={fmtHM(bufferSeconds * Math.max(studentCount - 1, 0))}
              />
            </CardContent>
          </Card>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" size="lg" className="w-full rounded-2xl px-10 sm:w-auto" disabled={submitting}>
            <Play className="mr-2 h-5 w-5" />
            {submitting ? "Creating..." : "Start Jury Day"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-widest text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-widest text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}
