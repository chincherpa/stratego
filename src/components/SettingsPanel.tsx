import { useState } from "react";

type Props = {
  handoffPopupEnabled: boolean;
  permanentRevealEnabled: boolean;
  onToggleHandoffPopup: (next: boolean) => void;
  onTogglePermanentReveal: (next: boolean) => void;
};

export function SettingsPanel({
  handoffPopupEnabled,
  permanentRevealEnabled,
  onToggleHandoffPopup,
  onTogglePermanentReveal,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="settings-button" title="Einstellungen" aria-label="Einstellungen" onClick={() => setOpen(true)}>
        ⚙
      </button>
      {open && (
        <div className="settings-overlay" onClick={() => setOpen(false)}>
          <div className="settings-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="settings-modal__close"
              aria-label="Einstellungen schließen"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <h3>Einstellungen</h3>
            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={handoffPopupEnabled}
                onChange={(event) => onToggleHandoffPopup(event.target.checked)}
              />
              <span>
                <strong>Übergabe-Popup anzeigen</strong>
                <small>Bei jedem Seitenwechsel erst bestätigen, statt sofort zu übergeben.</small>
              </span>
            </label>
            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={permanentRevealEnabled}
                onChange={(event) => onTogglePermanentReveal(event.target.checked)}
              />
              <span>
                <strong>Aufgedeckte Ränge dauerhaft zeigen</strong>
                <small>
                  Figuren, die im Kampf waren, bleiben für beide sichtbar. Aus = wie am echten Brett — Rang selbst
                  merken.
                </small>
              </span>
            </label>
          </div>
        </div>
      )}
    </>
  );
}
