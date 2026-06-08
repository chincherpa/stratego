import { useEffect, useState } from "react";
import { Square } from "./Square";
import { countOwnByRank, SetupTray } from "./SetupTray";
import { api } from "../api";
import { RANK_COUNT, type BoardView, type CombatResult, type Pos, type Rank, type Side, type StatusDto, type SquareView } from "../types";

/** Setup auto-pick queue: flag first (most critical to place well), then
 * bombs, then combat ranks ascending by strength (Spy·1 … Marshal·10) so
 * the cheapest, most numerous pieces clear out before the scarce high
 * cards — mirrors how players conventionally fill a Stratego back line. */
const SETUP_RANK_ORDER: Rank[] = [
  "Flag",
  "Bomb",
  "Spy",
  "Scout",
  "Miner",
  "Sergeant",
  "Lieutenant",
  "Captain",
  "Major",
  "Colonel",
  "General",
  "Marshal",
];

type Props = {
  side: Side;
  view: BoardView;
  status: StatusDto;
  /** Clash currently animating (shared from useGame so both panels — and
   * App's handoff gate — agree on when the banner is up). */
  combat: CombatResult | null;
  /** Display preference: when false, mask permanently-revealed enemy pieces
   * back to hidden card-backs (outside the live combat-banner square). */
  permanentRevealEnabled: boolean;
  /** Opens the (shared, global) settings modal — both halves' gear buttons
   * trigger the same dialog so either player can reach it from their seat. */
  onOpenSettings: () => void;
};

const BOARD_SIZE = 10;
const TOTAL_PIECES = 40;
const NEIGHBOR_DELTAS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function sideInControl(status: StatusDto): Side | null {
  switch (status.phase.kind) {
    case "SetupBlue":
      return "Blue";
    case "SetupRed":
      return "Red";
    case "Playing":
      return status.phase.turn;
    case "GameOver":
      return null;
  }
}

function isStatic(rank: Rank): boolean {
  return rank === "Bomb" || rank === "Flag";
}

function samePos(a: Pos, b: Pos): boolean {
  return a.row === b.row && a.col === b.col;
}

/** Mirrors backend `Board::home_rows`: the rows where a side may place
 * pieces during setup (Red 0-3, Blue 6-9 in canonical coordinates). */
const HOME_ROWS: Record<Side, [number, number]> = { Red: [0, 3], Blue: [6, 9] };

function isHomeRow(side: Side, pos: Pos): boolean {
  const [start, end] = HOME_ROWS[side];
  return pos.row >= start && pos.row <= end;
}

/** Squares this side's piece at `from` could legally move onto, judged purely
 * from what's visible on the board (no hidden info needed: empty / enemy /
 * own-occupied / lake are all observable). The backend re-validates anyway. */
function legalTargets(view: BoardView, side: Side, from: Pos): Pos[] {
  const targets: Pos[] = [];
  for (const [dr, dc] of NEIGHBOR_DELTAS) {
    const row = from.row + dr;
    const col = from.col + dc;
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) continue;
    const square = view[row][col];
    if (square.kind === "Lake") continue;
    if (square.kind === "Piece" && square.owner === side) continue;
    targets.push({ row, col });
  }
  return targets;
}

/** Blue's home rows sit at the bottom of the canonical board already; Red's
 * panel is rotated 180° so Red's own back rows likewise appear closest to
 * the Red player (mirrors sitting across the board from each other). */
function toCanonical(side: Side, displayRow: number, displayCol: number): Pos {
  if (side === "Blue") return { row: displayRow, col: displayCol };
  return { row: BOARD_SIZE - 1 - displayRow, col: BOARD_SIZE - 1 - displayCol };
}

export function BoardPanel({ side, view, status, combat, permanentRevealEnabled, onOpenSettings }: Props) {
  const [selectedRank, setSelectedRank] = useState<Rank | null>(null);
  const [selectedFrom, setSelectedFrom] = useState<Pos | null>(null);
  /** Setup-phase only: a piece already on the board, picked up so it can be
   * reset elsewhere or sent back to the bench — kept distinct from
   * `selectedFrom` (Playing) since the two phases highlight differently. */
  const [markedPos, setMarkedPos] = useState<Pos | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Setup phase only: square the cursor currently rests on, so we can mark
   * out-of-home-row squares with a red X while hovering. */
  const [hoverPos, setHoverPos] = useState<Pos | null>(null);

  const phase = status.phase;
  const isSetupPhase = phase.kind === "SetupBlue" || phase.kind === "SetupRed";
  const interactive = status.pending_handoff === null && sideInControl(status) === side;

  const targets = selectedFrom ? legalTargets(view, side, selectedFrom) : [];
  const markedSquare = markedPos ? view[markedPos.row][markedPos.col] : null;
  const markedRank = markedSquare && markedSquare.kind === "Piece" ? markedSquare.rank : null;
  const highlightedFrom = isSetupPhase ? markedPos : selectedFrom;

  // Drop any in-progress selection once this panel stops being interactive
  // (turn passes on, setup finishes) so a stale mark can't linger.
  useEffect(() => {
    if (!interactive) {
      setSelectedFrom(null);
      setMarkedPos(null);
      setSelectedRank(null);
      setHoverPos(null);
    }
  }, [interactive]);

  // Auto-advance the setup selection through SETUP_RANK_ORDER: once the
  // current rank's quota is used up (or nothing is picked yet), jump to the
  // next rank still in reserve. Suspended while a placed piece is marked so
  // the reposition/bench flow isn't fought over by two selections at once.
  useEffect(() => {
    if (!isSetupPhase || !interactive || markedPos) return;
    const placed = countOwnByRank(view, side);
    const hasReserve = (rank: Rank) => RANK_COUNT[rank] - (placed[rank] ?? 0) > 0;
    if (selectedRank === null || !hasReserve(selectedRank)) {
      setSelectedRank(SETUP_RANK_ORDER.find(hasReserve) ?? null);
    }
  }, [isSetupPhase, interactive, markedPos, view, side, selectedRank]);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(String(err));
    }
  }

  /** Tray-slot click during setup: if it matches the marked piece's rank,
   * that's the "Bankplatz" — send the piece back to reserve. Otherwise it's
   * the usual pick-a-rank-to-place toggle. */
  function handleTraySelect(rank: Rank) {
    if (markedPos && markedRank === rank) {
      const from = markedPos;
      setMarkedPos(null);
      run(() => api.unplacePiece(side, from));
      return;
    }
    setMarkedPos(null);
    setSelectedRank((current) => (current === rank ? null : rank));
  }

  function handleClick(pos: Pos, square: SquareView) {
    if (!interactive) return;
    setError(null);

    if (isSetupPhase) {
      if (markedPos && samePos(markedPos, pos)) {
        setMarkedPos(null);
        return;
      }
      if (square.kind === "Piece" && square.owner === side) {
        setSelectedRank(null);
        setMarkedPos(pos);
        return;
      }
      if (square.kind === "Empty" && markedPos) {
        const from = markedPos;
        setMarkedPos(null);
        run(() => api.repositionPiece(side, from, pos));
        return;
      }
      if (square.kind === "Empty" && selectedRank) {
        run(() => api.placePiece(side, pos, selectedRank));
      }
      return;
    }

    // Playing phase
    if (selectedFrom) {
      if (samePos(selectedFrom, pos)) {
        setSelectedFrom(null);
        return;
      }
      if (square.kind === "Piece" && square.owner === side) {
        setSelectedFrom(square.rank && !isStatic(square.rank) ? pos : null);
        return;
      }
      const from = selectedFrom;
      setSelectedFrom(null);
      run(() => api.makeMove(side, from, pos));
      return;
    }

    if (square.kind === "Piece" && square.owner === side && square.rank && !isStatic(square.rank)) {
      setSelectedFrom(pos);
    }
  }

  const rows = [];
  for (let displayRow = 0; displayRow < BOARD_SIZE; displayRow++) {
    const cells = [];
    for (let displayCol = 0; displayCol < BOARD_SIZE; displayCol++) {
      const pos = toCanonical(side, displayRow, displayCol);
      const square = view[pos.row][pos.col];
      const notAllowed =
        isSetupPhase &&
        interactive &&
        hoverPos !== null &&
        samePos(hoverPos, pos) &&
        !isHomeRow(side, pos);
      cells.push(
        <Square
          key={`${pos.row}-${pos.col}`}
          square={square}
          panelSide={side}
          selected={highlightedFrom !== null && samePos(highlightedFrom, pos)}
          legalTarget={targets.some((t) => samePos(t, pos))}
          clickable={interactive}
          notAllowed={notAllowed}
          combat={combat && combat.row === pos.row && combat.col === pos.col ? combat : null}
          permanentRevealEnabled={permanentRevealEnabled}
          onClick={() => handleClick(pos, square)}
          onMouseEnter={isSetupPhase && interactive ? () => setHoverPos(pos) : undefined}
          onMouseLeave={isSetupPhase && interactive ? () => setHoverPos(null) : undefined}
        />,
      );
    }
    rows.push(
      <div className="board-row" key={displayRow}>
        {cells}
      </div>,
    );
  }

  const placedCount = countOwnPieces(view, side);
  const setupDone = placedCount === TOTAL_PIECES;

  return (
    // `|| combat`: pending_handoff flips the instant combat resolves, which
    // would otherwise dim the board well before the (deliberately delayed)
    // handoff popup appears. Keep both transitions in lockstep.
    <section
      className={`board-panel board-panel--${side.toLowerCase()} ${
        interactive || combat ? "board-panel--active" : ""
      }`}
    >
      <header className="board-panel__header">
        <button
          type="button"
          className="settings-button"
          title="Einstellungen"
          aria-label="Einstellungen"
          onClick={onOpenSettings}
        >
          ⚙
        </button>
        <h2>Team {side === "Blue" ? "Blau" : "Rot"}</h2>
        <p className="board-panel__status">{describeStatus(status, side)}</p>
      </header>

      <div className="board-grid">{rows}</div>

      {error && <p className="board-panel__error">{error}</p>}

      {isSetupPhase && interactive && (
        <>
          <button
            type="button"
            className="random-setup-button"
            onClick={() => run(() => api.randomSetup(side))}
          >
            Rest zufällig verteilen
          </button>
          <SetupTray
            side={side}
            boardView={view}
            selectedRank={selectedRank}
            markedRank={markedRank}
            onSelectRank={handleTraySelect}
          />
          <button
            type="button"
            className="finish-setup-button"
            disabled={!setupDone}
            onClick={() => run(() => api.finishSetup(side))}
          >
            Aufstellung abschließen ({placedCount}/{TOTAL_PIECES})
          </button>
        </>
      )}
    </section>
  );
}

function countOwnPieces(view: BoardView, side: Side): number {
  let n = 0;
  for (const row of view) {
    for (const square of row) {
      if (square.kind === "Piece" && square.owner === side) n++;
    }
  }
  return n;
}

function describeStatus(status: StatusDto, side: Side): string {
  const phase = status.phase;
  switch (phase.kind) {
    case "SetupBlue":
      return side === "Blue" ? "Ihr stellt auf." : "Wartet, bis Team Blau fertig ist …";
    case "SetupRed":
      return side === "Red" ? "Ihr stellt auf." : "Wartet, bis Team Rot fertig ist …";
    case "Playing":
      return phase.turn === side ? "Ihr seid am Zug." : "Gegner ist am Zug …";
    case "GameOver":
      return phase.winner === side ? "Gewonnen! 🎉" : "Verloren.";
  }
}
