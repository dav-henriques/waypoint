/**
 * haptics.js — tactile confirmation.
 *
 * iOS Safari does not expose the Taptic Engine to web apps, so on iPhone this
 * is a silent no-op today. It is wired everywhere anyway: it costs nothing,
 * Android gets it now, and if Safari ever ships the Vibration API the whole
 * app gains haptics without a single new call site.
 */

const can = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

let enabled = true;

export function setHapticsEnabled(v) {
  enabled = !!v;
}

const PATTERNS = {
  select: 8,
  light: 12,
  medium: 18,
  heavy: 26,
  success: [10, 40, 16],
  warning: [16, 60, 16],
  error: [22, 50, 22, 50, 22],
};

export function haptic(kind = "select") {
  if (!enabled || !can()) return;
  try {
    navigator.vibrate(PATTERNS[kind] ?? PATTERNS.select);
  } catch {
    /* a failed buzz is never worth an exception */
  }
}
