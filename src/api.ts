import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { BoardView, CombatResult, Pos, Rank, Side, StatusDto } from "./types";

export const STATE_CHANGED = "state-changed";
export const COMBAT_RESOLVED = "combat-resolved";

export function onStateChanged(callback: () => void): Promise<() => void> {
  return listen(STATE_CHANGED, callback);
}

export function onCombatResolved(callback: (result: CombatResult) => void): Promise<() => void> {
  return listen<CombatResult>(COMBAT_RESOLVED, (event) => callback(event.payload));
}

export const api = {
  getStatus: () => invoke<StatusDto>("get_status"),
  getBoardView: (side: Side) => invoke<BoardView>("get_board_view", { side }),
  placePiece: (side: Side, pos: Pos, rank: Rank) =>
    invoke<void>("place_piece", { side, pos, rank }),
  unplacePiece: (side: Side, pos: Pos) => invoke<void>("unplace_piece", { side, pos }),
  repositionPiece: (side: Side, from: Pos, to: Pos) =>
    invoke<void>("reposition_piece", { side, from, to }),
  randomSetup: (side: Side) => invoke<void>("random_setup", { side }),
  finishSetup: (side: Side) => invoke<void>("finish_setup", { side }),
  makeMove: (side: Side, from: Pos, to: Pos) => invoke<void>("make_move", { side, from, to }),
  confirmHandoff: () => invoke<void>("confirm_handoff"),
  cancelHandoff: () => invoke<void>("cancel_handoff"),
  newGame: () => invoke<void>("new_game"),
};
