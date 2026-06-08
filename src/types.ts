export type Side = "Blue" | "Red";

export type Rank =
  | "Marshal"
  | "General"
  | "Colonel"
  | "Major"
  | "Captain"
  | "Lieutenant"
  | "Sergeant"
  | "Miner"
  | "Scout"
  | "Spy"
  | "Bomb"
  | "Flag";

/** Standard Stratego quota per rank (40 pieces total per side). */
export const RANK_COUNT: Record<Rank, number> = {
  Marshal: 1,
  General: 1,
  Colonel: 2,
  Major: 3,
  Captain: 4,
  Lieutenant: 4,
  Sergeant: 4,
  Miner: 5,
  Scout: 8,
  Spy: 1,
  Bomb: 6,
  Flag: 1,
};

/** Compact on-square label: short rank abbreviation + v1 combat strength. */
export const RANK_LABEL: Record<Rank, string> = {
  Marshal: "M·10",
  General: "G·9",
  Colonel: "C·8",
  Major: "Mj·7",
  Captain: "Ca·6",
  Lieutenant: "Lt·5",
  Sergeant: "Sg·4",
  Miner: "Mi·3",
  Scout: "Sc·2",
  Spy: "Sp·1",
  Bomb: "💣",
  Flag: "🚩",
};

export const ALL_RANKS: Rank[] = [
  "Marshal",
  "General",
  "Colonel",
  "Major",
  "Captain",
  "Lieutenant",
  "Sergeant",
  "Miner",
  "Scout",
  "Spy",
  "Bomb",
  "Flag",
];

export type SquareView =
  | { kind: "Empty" }
  | { kind: "Lake" }
  | { kind: "Piece"; owner: Side; rank: Rank | null };

export type BoardView = SquareView[][];

export type PhaseDto =
  | { kind: "SetupBlue" }
  | { kind: "SetupRed" }
  | { kind: "Playing"; turn: Side }
  | { kind: "GameOver"; winner: Side };

export type StatusDto = {
  phase: PhaseDto;
  pending_handoff: Side | null;
  pending_attack: boolean;
};

export type Pos = { row: number; col: number };

export type CombatOutcome = "AttackerWins" | "DefenderWins" | "BothDestroyed" | "FlagCaptured";

/** Snapshot of a resolved clash, broadcast so both panels can animate it —
 * the destroyed piece never lands on the board, so the board diff alone
 * wouldn't reveal who it was. */
export type CombatResult = {
  row: number;
  col: number;
  attacker_owner: Side;
  attacker_rank: Rank;
  defender_owner: Side;
  defender_rank: Rank;
  outcome: CombatOutcome;
};
