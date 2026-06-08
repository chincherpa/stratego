import { useEffect, useState } from "react";

export type Settings = {
  handoffPopupEnabled: boolean;
  permanentRevealEnabled: boolean;
};

const STORAGE_KEY = "stratego-settings";

const DEFAULT_SETTINGS: Settings = {
  handoffPopupEnabled: true,
  permanentRevealEnabled: true,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      handoffPopupEnabled:
        typeof parsed.handoffPopupEnabled === "boolean" ? parsed.handoffPopupEnabled : DEFAULT_SETTINGS.handoffPopupEnabled,
      permanentRevealEnabled:
        typeof parsed.permanentRevealEnabled === "boolean"
          ? parsed.permanentRevealEnabled
          : DEFAULT_SETTINGS.permanentRevealEnabled,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Two player-facing display preferences, persisted in `localStorage` so they
 * survive app restarts. Both default to `true` — today's behavior — so a
 * player has to deliberately opt into the "leaner"/"hardcore" variants.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  return {
    settings,
    setHandoffPopupEnabled: (value: boolean) => setSettings((s) => ({ ...s, handoffPopupEnabled: value })),
    setPermanentRevealEnabled: (value: boolean) => setSettings((s) => ({ ...s, permanentRevealEnabled: value })),
  };
}
