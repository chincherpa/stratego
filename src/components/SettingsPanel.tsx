import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  handoffPopupEnabled: boolean;
  permanentRevealEnabled: boolean;
  onToggleHandoffPopup: (next: boolean) => void;
  onTogglePermanentReveal: (next: boolean) => void;
  onNewGame: () => void;
};

export function SettingsPanel({
  open,
  onClose,
  handoffPopupEnabled,
  permanentRevealEnabled,
  onToggleHandoffPopup,
  onTogglePermanentReveal,
  onNewGame,
}: Props) {
  // Two-step confirm so a single misclick (or one frustrated player) can't
  // wipe the running game. Re-arms whenever the panel closes.
  const [confirmingNewGame, setConfirmingNewGame] = useState(false);

  useEffect(() => {
    if (!open) setConfirmingNewGame(false);
  }, [open]);

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="settings-modal__close" aria-label="Einstellungen schließen" onClick={onClose}>
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
              Figuren, die im Kampf waren, bleiben für beide sichtbar. Aus = wie am echten Brett — Rang selbst merken.
            </small>
          </span>
        </label>
        <div className="settings-newgame">
          {!confirmingNewGame ? (
            <button type="button" className="settings-newgame__start" onClick={() => setConfirmingNewGame(true)}>
              Neue Partie
            </button>
          ) : (
            <>
              <p className="settings-newgame__warning">Wirklich neu starten? Aktuelle Partie geht verloren.</p>
              <div className="settings-newgame__buttons">
                <button type="button" className="settings-newgame__confirm" onClick={onNewGame}>
                  Ja, neue Partie
                </button>
                <button type="button" onClick={() => setConfirmingNewGame(false)}>
                  Abbrechen
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
