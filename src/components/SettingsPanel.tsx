import { useEffect, useState } from "react";
import { COMBAT_ANIMATION_RANGE, HANDOFF_DELAY_RANGE, type Settings } from "../useSettings";

type Props = {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onNewGame: () => void;
};

function formatSeconds(value: number): string {
  return `${value.toFixed(1).replace(".", ",")} s`;
}

export function SettingsPanel({ open, onClose, settings, onChange, onNewGame }: Props) {
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
            checked={settings.handoffPopupEnabled}
            onChange={(event) => onChange({ handoffPopupEnabled: event.target.checked })}
          />
          <span>
            <strong>Übergabe-Popup anzeigen</strong>
            <small>Bei jedem Seitenwechsel erst bestätigen, statt sofort zu übergeben.</small>
          </span>
        </label>
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={settings.permanentRevealEnabled}
            onChange={(event) => onChange({ permanentRevealEnabled: event.target.checked })}
          />
          <span>
            <strong>Aufgedeckte Ränge dauerhaft zeigen</strong>
            <small>
              Figuren, die im Kampf waren, bleiben für beide sichtbar. Aus = wie am echten Brett — Rang selbst merken.
            </small>
          </span>
        </label>

        <div className={`settings-slider-row ${settings.handoffPopupEnabled ? "" : "settings-slider-row--muted"}`}>
          <div className="settings-slider-row__head">
            <strong>Zeit bis zur Übergabe</strong>
            <span className="settings-slider-row__value">
              {settings.handoffDelaySeconds === 0 ? "nur manuell" : formatSeconds(settings.handoffDelaySeconds)}
            </span>
          </div>
          <input
            type="range"
            min={HANDOFF_DELAY_RANGE.min}
            max={HANDOFF_DELAY_RANGE.max}
            step={HANDOFF_DELAY_RANGE.step}
            value={settings.handoffDelaySeconds}
            onChange={(event) => onChange({ handoffDelaySeconds: Number(event.target.value) })}
          />
          <small>
            Wie lange das Übergabe-Popup stehen bleibt, bevor es von selbst übergibt. Ganz links = gar nicht, ihr
            klickt selbst auf „Übergeben“.
            {!settings.handoffPopupEnabled && " (Ohne Übergabe-Popup wird sofort übergeben.)"}
          </small>
        </div>

        <div className="settings-slider-row">
          <div className="settings-slider-row__head">
            <strong>Dauer der Kampfanimation</strong>
            <span className="settings-slider-row__value">
              {settings.combatAnimationSeconds === 0 ? "aus" : formatSeconds(settings.combatAnimationSeconds)}
            </span>
          </div>
          <input
            type="range"
            min={COMBAT_ANIMATION_RANGE.min}
            max={COMBAT_ANIMATION_RANGE.max}
            step={COMBAT_ANIMATION_RANGE.step}
            value={settings.combatAnimationSeconds}
            onChange={(event) => onChange({ combatAnimationSeconds: Number(event.target.value) })}
          />
          <small>
            Der Zweikampf wird auf beiden Hälften gezeigt; so lange wartet auch die Übergabe. Ganz links = keine
            Animation. Nachlesen lässt sich jeder Kampf in der Zweikampf-Liste.
          </small>
        </div>

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
