import { type CSSProperties, useEffect } from "react";
import { api } from "../api";
import type { Side, StatusDto } from "../types";

type Props = {
  status: StatusDto;
  /** Milliseconds until the handoff goes through on its own. `0` disables
   * the timer — the players then confirm by hand (setting "Zeit bis zur
   * Übergabe"). */
  autoConfirmMs: number;
};

const TEAM_NAME: Record<Side, string> = { Blue: "Blau", Red: "Rot" };
const otherSide = (side: Side): Side => (side === "Blue" ? "Red" : "Blue");

export function HandoffModal({ status, autoConfirmMs }: Props) {
  const actingSide = status.pending_handoff;
  const cancelDisabled = status.pending_attack;

  useEffect(() => {
    if (!actingSide || autoConfirmMs <= 0) return;
    const timer = setTimeout(() => api.confirmHandoff(), autoConfirmMs);
    return () => clearTimeout(timer);
  }, [actingSide, autoConfirmMs]);

  if (!actingSide) return null;

  const nextSide = otherSide(actingSide);

  return (
    <div className={`handoff-overlay handoff-overlay--${actingSide.toLowerCase()}`}>
      <div className="handoff-modal">
        <h3>Steuerung an Team {TEAM_NAME[nextSide]} übergeben</h3>
        <p>
          Team {TEAM_NAME[actingSide]} ist fertig. Bitte Maus zur Bildschirmhälfte von Team {TEAM_NAME[nextSide]}{" "}
          wechseln lassen, bevor ihr bestätigt.
        </p>
        <div className="handoff-modal__actions">
          <button type="button" className="handoff-modal__confirm" onClick={() => api.confirmHandoff()}>
            Übergeben
          </button>
          <button
            type="button"
            className="handoff-modal__cancel"
            disabled={cancelDisabled}
            title={cancelDisabled ? "Ein Angriff kann nicht rückgängig gemacht werden" : undefined}
            onClick={() => api.cancelHandoff()}
          >
            Ich überlege noch einmal
          </button>
        </div>
        {/* Visible countdown so nobody is surprised by the auto-handover;
            the bar drains over exactly the configured time. */}
        {autoConfirmMs > 0 ? (
          <div className="handoff-modal__timer">
            <div
              className="handoff-modal__timer-bar"
              style={{ "--handoff-ms": `${autoConfirmMs}ms` } as CSSProperties}
            />
            <small>Übergabe automatisch nach {(autoConfirmMs / 1000).toFixed(1).replace(".", ",")} s</small>
          </div>
        ) : (
          <div className="handoff-modal__timer">
            <small>Automatische Übergabe ist aus – bitte bestätigen.</small>
          </div>
        )}
      </div>
    </div>
  );
}
