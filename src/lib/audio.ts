type CtxRef = { current: AudioContext | null };

export async function ensureAudio(ref: CtxRef): Promise<void> {
  const Ctx =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  if (!ref.current) ref.current = new Ctx();
  if (ref.current.state === "suspended") await ref.current.resume();
}

export function beep(
  ref: CtxRef,
  enabled: boolean,
  freq = 880,
  durMs = 250,
  repeat = 1,
): void {
  if (!enabled || !ref.current) return;
  const ctx = ref.current;
  if (ctx.state === "suspended") ctx.resume();
  for (let i = 0; i < repeat; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = ctx.currentTime + i * 0.35;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durMs / 1000);
    osc.start(t);
    osc.stop(t + durMs / 1000 + 0.03);
  }
}
