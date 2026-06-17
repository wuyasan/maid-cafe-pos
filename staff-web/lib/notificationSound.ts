"use client";

export const SOUND_ENABLED_KEY =
  "maid-cafe-pos:sound-enabled";

let audioContext: AudioContext | null = null;

export function isSoundEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.localStorage.getItem(
      SOUND_ENABLED_KEY,
    ) === "true"
  );
}

export async function requestBrowserNotifications() {
  if (
    typeof window === "undefined" ||
    !("Notification" in window)
  ) {
    return "unsupported" as const;
  }

  if (Notification.permission === "granted") {
    return "granted" as const;
  }

  if (Notification.permission === "denied") {
    return "denied" as const;
  }

  return await Notification.requestPermission();
}

export function showBrowserNotification(
  title: string,
  body: string,
) {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  new Notification(title, {
    body,
    tag: `${title}-${body}`,
  });
}

export async function enableSound() {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextClass =
    window.AudioContext ||
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error(
      "This browser does not support notification sounds.",
    );
  }

  audioContext =
    audioContext ?? new AudioContextClass();

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  window.localStorage.setItem(
    SOUND_ENABLED_KEY,
    "true",
  );

  await requestBrowserNotifications();

  playNotificationTone("ready");
}

export function disableSound() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    SOUND_ENABLED_KEY,
    "false",
  );
}

export function playNotificationTone(
  kind: "new-order" | "ready",
) {
  if (
    typeof window === "undefined" ||
    !isSoundEnabled()
  ) {
    return;
  }

  const AudioContextClass =
    window.AudioContext ||
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  audioContext =
    audioContext ?? new AudioContextClass();

  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }

  const now = audioContext.currentTime;
  const frequencies =
    kind === "new-order"
      ? [650, 820]
      : [880, 1100, 1320];

  frequencies.forEach((frequency, index) => {
    const oscillator =
      audioContext!.createOscillator();
    const gain =
      audioContext!.createGain();
    const start = now + index * 0.17;

    oscillator.frequency.value = frequency;
    oscillator.type = "sine";

    gain.gain.setValueAtTime(
      0.0001,
      start,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.28,
      start + 0.02,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + 0.14,
    );

    oscillator.connect(gain);
    gain.connect(audioContext!.destination);

    oscillator.start(start);
    oscillator.stop(start + 0.16);
  });
}
