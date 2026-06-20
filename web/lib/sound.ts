/** Sound preference helpers + Web Audio alert. Browser-only. */

const STORAGE_KEY = "maid-cafe-pos:sound";

/** Returns true if the sound pref is enabled (default: on). */
export function isSoundEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  const val = localStorage.getItem(STORAGE_KEY);
  // Default on when no pref stored.
  return val !== "false";
}

/** Persist sound enabled/disabled preference. */
export function setSoundEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, String(enabled));
}

/**
 * Play a brief two-tone alert via Web Audio API.
 * No-ops when: sound is disabled, AudioContext unavailable, or called server-side.
 */
export function playAlert(): void {
  if (typeof window === "undefined") return;
  if (!isSoundEnabled()) return;

  const AudioCtxCtor =
    window.AudioContext ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webkitAudioContext;
  if (!AudioCtxCtor) return;

  try {
    const ctx = new AudioCtxCtor() as AudioContext;

    // Two short beeps: 880 Hz then 1100 Hz.
    const tones = [
      { freq: 880, start: 0, dur: 0.1 },
      { freq: 1100, start: 0.13, dur: 0.1 },
    ];

    for (const { freq, start, dur } of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    }

    // Auto-close context after tones finish.
    setTimeout(() => { void ctx.close(); }, 500);
  } catch {
    // Silently ignore — NotAllowedError (autoplay policy), etc.
  }
}
