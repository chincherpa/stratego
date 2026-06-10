# Game Improvements: Neue Partie, Verlust-Tray, Letzter-Zug-Markierung, Hin-und-her-Regel

**Date:** 2026-06-10
**Status:** Approved

## Goal

Four improvements to the hot-seat Stratego app:

1. **Neue Partie** — restart command + settings button (currently no reset path; app must be killed after game over)
2. **Captured-pieces tray** — both players see which ranks each side has lost
3. **Last-move highlight** — from/to squares of the most recent move are marked on the board
4. **Two-squares rule** — a piece may not shuttle back and forth between the same two squares three times in a row

Explicitly out of scope: extra draw detection (move-limit, Remis button). The existing "player with no legal move loses" rule covers frozen endgames.

## Architecture

New public data (captured lists, last move) is added to **`StatusDto`**. `useGame.ts` already refetches status on every `state-changed` event and both panels read it. This data is public to both players by Stratego rules: combat reveals both ranks, and piece movement is visible to both players in the physical game. No per-viewer filtering needed, so `BoardView`/`square_view` stay untouched.

The handoff/undo snapshot grows from a bare `Board` to a struct so `cancel_handoff` restores all new state consistently:

```rust
struct UndoSnapshot {
    board: Board,
    last_move: Option<(Pos, Pos)>,
    shuttle_blue: Option<Shuttle>,
    shuttle_red: Option<Shuttle>,
}
```

Captured lists are *not* in the snapshot logic's danger zone: `cancel_handoff` is already refused after an attack (`pending_attack`), so captures can never be rolled back. They are still restored via the snapshot for uniformity and future-proofing — simplest correct behavior.

## 1. Neue Partie

**Backend**
- `GameState::reset(&mut self)` — `*self = GameState::new()`.
- New command `new_game` in `commands.rs`, registered in `lib.rs`. Allowed in **any** phase, including while a handoff is pending (reset clears the pending state too). Emits `state-changed` via `notify`.

**Frontend**
- `api.ts`: `newGame()` wrapper.
- `SettingsPanel.tsx`: new entry "Neue Partie" with an inline two-step confirm — first click shows "Wirklich neu starten? Aktuelle Partie geht verloren." with "Ja, neue Partie" / "Abbrechen". Prevents accidental or one-sided rage-wipe.
- **No** button on `WinnerScreen` (user decision) — after game over, restart goes through the settings panel like everywhere else.

## 2. Captured-pieces tray

**Backend**
- `GameState` gains `captured_blue: Vec<Rank>` and `captured_red: Vec<Rank>` — ranks **lost by** that side, in capture order.
- Filled inside `make_move` based on combat outcome:
  - `AttackerWins` → defender's rank pushed to defender side's list
  - `DefenderWins` → attacker's rank pushed to attacker side's list
  - `BothDestroyed` → both pushed
  - `FlagCaptured` → flag pushed to defender side's list
- Cleared by `reset`. Exposed in `StatusDto` as `captured_blue` / `captured_red` (serialized rank arrays).

**Frontend**
- `types.ts`: extend `StatusDto`.
- New component `CapturedTray.tsx`, rendered inside each `BoardPanel`: two rows ("Verluste Blau" / "Verluste Rot"), pieces grouped by rank with a count badge (e.g. "Aufklärer ×3"), sorted by rank strength. Identical content on both panels.
- During setup phases the tray is empty/hidden.

## 3. Last-move highlight

**Backend**
- `GameState` gains `last_move: Option<(Pos, Pos)>`. Set at the end of every successful `make_move` (from, to). For an attacker-loses combat, `to` is still the target square — the interesting square is where the fight happened.
- Cleared by `reset` and not set during setup. Restored by `cancel_handoff` from the snapshot.
- Exposed in `StatusDto` as `last_move: [Pos, Pos] | null`.

**Frontend**
- `Square.tsx` gets modifier classes `square--last-from` / `square--last-to` (subtle ring or background tint, distinct from the selection highlight). Applied on **both** panels — movement is public information.

## 4. Two-squares rule (Hin-und-her-Regel)

A piece may move back and forth between the same two squares at most **two** consecutive times; the third repetition is rejected.

**Backend**
- Tracking lives in `state.rs` (it is stateful history; `rules.rs` stays stateless):

```rust
struct Shuttle { a: Pos, b: Pos, count: u8 }
```

- One `Option<Shuttle>` per side. On each successful move `from → to` by side S:
  - If `Some(s)` and `{from, to} == {s.a, s.b}` (the reverse hop): `count += 1`.
  - Otherwise: replace with `Some(Shuttle { a: from, b: to, count: 1 })`.
- **Validation before the move executes:** if the move would be the reverse hop and `count >= 3` for that pair (i.e. it would be the fourth consecutive hop), reject with new error variant `TwoSquares` (German UI text: "Hin-und-her-Regel: Diese Figur darf nicht erneut zwischen denselben Feldern hin- und herziehen."). Sequence allowed: A→B, B→A, A→B; the fourth hop B→A is rejected. Any move of a different piece or to a different square by that side resets its shuttle tracking.
- Scout note: the pair is matched on exact squares, so a Scout sliding A→B then B→A counts the same as a single-step shuttle.
- `cancel_handoff` restores both shuttle slots from the snapshot.
- Error surfaces through the existing move-error path (`ActionError`), displayed in `BoardPanel` like other rejected moves.

## Error handling

- `new_game` cannot fail (no preconditions) — returns `()`.
- `TwoSquares` is a normal rejected-move error: board unchanged, no handoff triggered, player picks another move.

## Testing

**Rust (`cargo test` in `src-tauri`):**
- Two-squares: A→B, B→A, A→B allowed; next B→A rejected; rejected also when interleaved with opponent moves (opponent moves don't reset the mover's shuttle); shuttle resets when the side moves a different piece/square; Scout slide pair counts.
- Captured tracking: one test per combat outcome verifying the right list grows.
- `reset`: returns phase to `SetupBlue`, clears board, captured lists, `last_move`, shuttles, pending handoff.
- `cancel_handoff`: restores `last_move` and shuttle state alongside the board.
- `last_move`: set after a move, points at (from, to) including for lost attacks.

**Frontend:** `pnpm build` (tsc) for type-check; manual verification via `pnpm tauri dev` (no JS test runner configured).
