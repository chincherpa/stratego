import { useCallback, useEffect, useState } from "react";

export type Settings = {
  handoffPopupEnabled: boolean;
  permanentRevealEnabled: boolean;
  /** How long the handoff popup waits before handing over on its own.
   * `0` = never auto-confirm, the players click "Übergeben" themselves. */
  handoffDelaySeconds: number;
  /** Length of the clash animation. `0` = off (no animation, no delay —
   * the handoff popup comes up immediately). */
  combatAnimationSeconds: number;
};

const STORAGE_KEY = "stratego-settings";

const DEFAULT_SETTINGS: Settings = {
  handoffPopupEnabled: true,
  permanentRevealEnabled: true,
  handoffDelaySeconds: 3,
  combatAnimationSeconds: 1.8,
};

/** Slider bounds, shared with SettingsPanel so the stored value and the
 * control can never drift apart. */
export const HANDOFF_DELAY_RANGE = { min: 0, max: 15, step: 0.5 };
export const COMBAT_ANIMATION_RANGE = { min: 0, max: 4, step: 0.2 };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readSeconds(value: unknown, fallback: number, { min, max }: { min: number; max: number }): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      handoffPopupEnabled: readBoolean(parsed.handoffPopupEnabled, DEFAULT_SETTINGS.handoffPopupEnabled),
      permanentRevealEnabled: readBoolean(parsed.permanentRevealEnabled, DEFAULT_SETTINGS.permanentRevealEnabled),
      handoffDelaySeconds: readSeconds(
        parsed.handoffDelaySeconds,
        DEFAULT_SETTINGS.handoffDelaySeconds,
        HANDOFF_DELAY_RANGE,
      ),
      combatAnimationSeconds: readSeconds(
        parsed.combatAnimationSeconds,
        DEFAULT_SETTINGS.combatAnimationSeconds,
        COMBAT_ANIMATION_RANGE,
      ),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Player-facing display/timing preferences, persisted in `localStorage` so
 * they survive app restarts. Unknown or corrupt values fall back to the
 * defaults rather than breaking the game.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  return { settings, updateSettings };
}
