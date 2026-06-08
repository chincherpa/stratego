import { ALL_RANKS, RANK_COUNT, RANK_LABEL, type BoardView, type Rank, type Side } from "../types";

type Props = {
  side: Side;
  boardView: BoardView;
  selectedRank: Rank | null;
  /** Rank of the currently marked on-board piece, if any — its tray slot
   * stays clickable even at full quota so the player can send it back. */
  markedRank: Rank | null;
  onSelectRank: (rank: Rank) => void;
};

export function SetupTray({ side, boardView, selectedRank, markedRank, onSelectRank }: Props) {
  const placed = countOwnByRank(boardView, side);

  return (
    <div className="setup-tray">
      <p className="setup-tray__hint">
        Figur wählen, dann auf eigenes Feld klicken zum Platzieren — oder eine stehende Figur
        anklicken, um sie zu markieren: erneut klicken setzt sie um, der Bankplatz nimmt sie zurück.
      </p>
      <div className="setup-tray__items">
        {ALL_RANKS.map((rank) => {
          const remaining = RANK_COUNT[rank] - (placed[rank] ?? 0);
          const isBenchTarget = markedRank === rank;
          return (
            <button
              key={rank}
              type="button"
              className={`tray-item ${selectedRank === rank ? "tray-item--selected" : ""} ${isBenchTarget ? "tray-item--bench-target" : ""}`}
              disabled={remaining <= 0 && !isBenchTarget}
              onClick={() => onSelectRank(rank)}
              title={rank}
            >
              <span className="tray-item__label">{RANK_LABEL[rank]}</span>
              <span className="tray-item__count">×{remaining}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function countOwnByRank(view: BoardView, side: Side): Partial<Record<Rank, number>> {
  const counts: Partial<Record<Rank, number>> = {};
  for (const row of view) {
    for (const square of row) {
      if (square.kind === "Piece" && square.owner === side && square.rank) {
        counts[square.rank] = (counts[square.rank] ?? 0) + 1;
      }
    }
  }
  return counts;
}
