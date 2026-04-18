export function fmt(s: number): string {
  const abs = Math.max(0, Math.floor(s));
  const m = Math.floor(abs / 60);
  const sec = abs % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function fmtClock(d: Date | null): string {
  if (!d) return "--:--";
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function fmtClockShort(d: Date | null): string {
  if (!d) return "--:--";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
