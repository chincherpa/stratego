import { useEffect } from "react";
import { api } from "../api";
import type { Side, StatusDto } from "../types";

type Props = {
  status: StatusDto;
};

const TEAM_NAME: Record<Side, string> = { Blue: "Blau", Red: "Rot" };
const otherSide = (side: Side): Side => (side === "Blue" ? "Red" : "Blue");
const AUTO_CONFIRM_MS = 3000;

export function HandoffModal({ status }: Props) {
  const actingSide = status.pending_handoff;
  const cancelDisabled = status.pending_attack;

  useEffect(() => {
    if (!actingSide) return;
    const timer = setTimeout(() => api.confirmHandoff(), AUTO_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [actingSide]);

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
      </div>
    </div>
  );
}
