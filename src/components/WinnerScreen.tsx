import { useEffect, useState } from "react";
import type { Side, StatusDto } from "../types";

type Props = {
  status: StatusDto;
};

const TEAM_NAME: Record<Side, string> = { Blue: "Blau", Red: "Rot" };

export function WinnerScreen({ status }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const isGameOver = status.phase.kind === "GameOver";

  useEffect(() => {
    if (!isGameOver) setDismissed(false);
  }, [isGameOver]);

  if (status.phase.kind !== "GameOver" || dismissed) return null;

  const winner = status.phase.winner;

  return (
    <div className="winner-overlay">
      <div className={`winner-modal winner-modal--${winner.toLowerCase()}`}>
        <p className="winner-modal__emoji">🏆🚩</p>
        <h2>Team {TEAM_NAME[winner]} gewinnt!</h2>
        <button type="button" className="winner-modal__dismiss" onClick={() => setDismissed(true)}>
          Board ansehen
        </button>
      </div>
    </div>
  );
}
