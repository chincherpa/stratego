# Game Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four features to the hot-seat Stratego app: restart command ("Neue Partie" in settings), captured-pieces tray, last-move highlight, and the two-squares rule (Hin-und-her-Regel).

**Architecture:** All game logic lives in Rust (`src-tauri/src/game/`); the frontend is a dumb view. New public data (captured lists, last move) is added to `StatusDto`, which `useGame.ts` already refetches on every `state-changed` event. The handoff/undo snapshot grows from a bare `Board` into an `UndoSnapshot` struct so `cancel_handoff` restores all new state consistently. Spec: `docs/superpowers/specs/2026-06-10-game-improvements-design.md`.

**Tech Stack:** Tauri 2, Rust (state machine in `src-tauri/src/game/state.rs`), React 19 + TypeScript + Vite. Tests: `cargo test` in `src-tauri` (no JS test runner; frontend verified with `pnpm build` type-check + manual `pnpm tauri dev`).

**Conventions that matter:**
- Use **pnpm**, never npm/yarn.
- Run Rust tests from `src-tauri`: `cd src-tauri; cargo test`
- `Pos` is a tuple `(usize, usize)` = (row, col). Lakes sit at rows 4–5, cols 2–3 and 6–7. Blue home rows 6–9, Red 0–3.
- Backend errors reach the frontend as Rust `Debug` strings, e.g. `"Move(TwoSquares)"` — the frontend maps them to German text.
- Every mutating command in `commands.rs` calls `notify(&window)` on success and must be registered in `lib.rs`'s `generate_handler!`.

---

### Task 1: UndoSnapshot refactor + state test scaffolding

Pure refactor: replace `undo_snapshot: Option<Board>` with a struct, plus a test module in `state.rs` with helpers all later tasks use. No behavior change — existing tests must stay green.

**Files:**
- Modify: `src-tauri/src/game/state.rs`

- [ ] **Step 1: Add the `UndoSnapshot` struct and switch the field**

In `src-tauri/src/game/state.rs`, above `pub struct GameState`:

```rust
/// Everything `cancel_handoff` ("Ich überlege noch einmal") must restore.
/// Grows alongside GameState: any per-game field mutated by a cancellable
/// action belongs in here.
#[derive(Clone)]
struct UndoSnapshot {
    board: Board,
}
```

Change the field in `GameState`:

```rust
    /// Snapshot taken right before the pending action was applied,
    /// restored verbatim on cancel.
    undo_snapshot: Option<UndoSnapshot>,
```

- [ ] **Step 2: Add `take_snapshot` and use it in `finish_setup` and `make_move`**

Add as a private method on `impl GameState`:

```rust
    fn take_snapshot(&mut self) {
        self.undo_snapshot = Some(UndoSnapshot {
            board: self.board.clone(),
        });
    }
```

In `finish_setup`, replace `self.undo_snapshot = Some(self.board.clone());` with `self.take_snapshot();`.
In `make_move`, replace `self.undo_snapshot = Some(self.board.clone());` with `self.take_snapshot();`.

- [ ] **Step 3: Restore from the struct in `cancel_handoff`**

Replace:

```rust
        if let Some(board) = self.undo_snapshot.take() {
            self.board = board;
        }
```

with:

```rust
        if let Some(snapshot) = self.undo_snapshot.take() {
            self.board = snapshot.board;
        }
```

- [ ] **Step 4: Add the test module with shared helpers and a smoke test**

At the bottom of `state.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    /// Builds a GameState already in Playing(Blue) with exactly these pieces.
    /// Bypasses setup so tests stay deterministic and small.
    fn playing_with(pieces: &[(Pos, Side, Rank)]) -> GameState {
        let mut gs = GameState::new();
        for &(pos, side, rank) in pieces {
            gs.board.set(pos, Square::Occupied(Piece::new(side, rank)));
        }
        gs.phase = Phase::Playing(Side::Blue);
        gs
    }

    /// A board where both sides always keep a legal move (no accidental
    /// stalemate-loss): one Miner and one Scout each, far apart.
    fn two_movers() -> GameState {
        playing_with(&[
            ((9, 0), Side::Blue, Rank::Miner),
            ((9, 9), Side::Blue, Rank::Scout),
            ((0, 0), Side::Red, Rank::Miner),
            ((0, 9), Side::Red, Rank::Scout),
        ])
    }

    /// Makes a move and clicks through the handoff popup (game-ending moves
    /// skip the handoff, so confirm only when one is pending).
    fn move_and_confirm(gs: &mut GameState, side: Side, from: Pos, to: Pos) {
        gs.make_move(side, from, to).expect("move should be legal");
        if gs.pending_handoff.is_some() {
            gs.confirm_handoff().expect("confirm_handoff");
        }
    }

    #[test]
    fn cancel_handoff_restores_board() {
        let mut gs = two_movers();
        gs.make_move(Side::Blue, (9, 0), (8, 0)).unwrap();
        gs.cancel_handoff().unwrap();
        assert!(matches!(gs.board.get((9, 0)), Square::Occupied(p) if p.rank == Rank::Miner));
        assert_eq!(gs.board.get((8, 0)), Square::Empty);
        assert_eq!(gs.phase, Phase::Playing(Side::Blue));
    }
}
```

Note: `two_movers` and `move_and_confirm` may trigger `dead_code` warnings in this task only — they're used from Task 2 on. That's fine; do not delete them.

- [ ] **Step 5: Run all tests**

Run: `cd src-tauri; cargo test`
Expected: all existing rules tests + `cancel_handoff_restores_board` PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/game/state.rs
git commit -m "refactor: UndoSnapshot struct + state test scaffolding"
```

---

### Task 2: last_move tracking (backend)

**Files:**
- Modify: `src-tauri/src/game/state.rs`

- [ ] **Step 1: Write the failing tests**

Add to the `tests` module in `state.rs`:

```rust
    #[test]
    fn last_move_tracks_most_recent_move() {
        let mut gs = two_movers();
        assert_eq!(gs.last_move, None);
        move_and_confirm(&mut gs, Side::Blue, (9, 0), (8, 0));
        assert_eq!(gs.last_move, Some(((9, 0), (8, 0))));
        move_and_confirm(&mut gs, Side::Red, (0, 0), (1, 0));
        assert_eq!(gs.last_move, Some(((0, 0), (1, 0))));
    }

    #[test]
    fn cancel_handoff_restores_last_move() {
        let mut gs = two_movers();
        move_and_confirm(&mut gs, Side::Blue, (9, 0), (8, 0));
        // Red moves but reconsiders.
        gs.make_move(Side::Red, (0, 0), (1, 0)).unwrap();
        gs.cancel_handoff().unwrap();
        assert_eq!(gs.last_move, Some(((9, 0), (8, 0))));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri; cargo test last_move`
Expected: compile error — `GameState` has no field `last_move`. That counts as the failing state.

- [ ] **Step 3: Implement**

In `GameState`, add the field (after `undo_snapshot`):

```rust
    /// From/to of the most recent executed move, shown to both players
    /// (movement is public information in Stratego).
    last_move: Option<(Pos, Pos)>,
```

In `GameState::new()`, add `last_move: None,`.

Extend `UndoSnapshot`:

```rust
#[derive(Clone)]
struct UndoSnapshot {
    board: Board,
    last_move: Option<(Pos, Pos)>,
}
```

Extend `take_snapshot`:

```rust
    fn take_snapshot(&mut self) {
        self.undo_snapshot = Some(UndoSnapshot {
            board: self.board.clone(),
            last_move: self.last_move,
        });
    }
```

In `make_move`, right after the `let combat_result = match … };` block (the move has been applied), add:

```rust
        self.last_move = Some((from, to));
```

In `cancel_handoff`, extend the restore:

```rust
        if let Some(snapshot) = self.undo_snapshot.take() {
            self.board = snapshot.board;
            self.last_move = snapshot.last_move;
        }
```

- [ ] **Step 4: Expose in StatusDto**

Above `StatusDto` in `state.rs`:

```rust
/// `last_move` flattened for the frontend (Pos tuples would serialize as
/// arrays, which is awkward to type on the TS side).
#[derive(Serialize, Clone, Copy, Debug)]
pub struct LastMoveDto {
    pub from_row: usize,
    pub from_col: usize,
    pub to_row: usize,
    pub to_col: usize,
}
```

Extend `StatusDto`:

```rust
#[derive(Serialize, Clone, Debug)]
pub struct StatusDto {
    pub phase: PhaseDto,
    pub pending_handoff: Option<Side>,
    /// `true` when the pending handoff was triggered by an attack (a move
    /// onto an occupied square) — the frontend disables "Ich überlege noch
    /// einmal" in that case, since combat outcomes can't be taken back.
    pub pending_attack: bool,
    pub last_move: Option<LastMoveDto>,
}
```

Extend `status()`:

```rust
    pub fn status(&self) -> StatusDto {
        StatusDto {
            phase: self.phase.into(),
            pending_handoff: self.pending_handoff,
            pending_attack: self.pending_attack,
            last_move: self.last_move.map(|(from, to)| LastMoveDto {
                from_row: from.0,
                from_col: from.1,
                to_row: to.0,
                to_col: to.1,
            }),
        }
    }
```

- [ ] **Step 5: Run all tests**

Run: `cd src-tauri; cargo test`
Expected: all PASS, including the two new ones.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/game/state.rs
git commit -m "feat: track last move, expose in StatusDto, restore on cancel"
```

---

### Task 3: Captured-pieces lists (backend)

**Files:**
- Modify: `src-tauri/src/game/state.rs`

- [ ] **Step 1: Write the failing tests**

Add to the `tests` module. Each combat board keeps a spare Scout per side so the loser never hits the stalemate-loss rule mid-test:

```rust
    /// Blue attacker at (5,0), Red defender at (4,0), plus spare movers.
    fn combat_board(attacker: Rank, defender: Rank) -> GameState {
        playing_with(&[
            ((5, 0), Side::Blue, attacker),
            ((4, 0), Side::Red, defender),
            ((9, 9), Side::Blue, Rank::Scout),
            ((0, 9), Side::Red, Rank::Scout),
        ])
    }

    #[test]
    fn attacker_win_records_defender_loss() {
        let mut gs = combat_board(Rank::Marshal, Rank::Miner);
        gs.make_move(Side::Blue, (5, 0), (4, 0)).unwrap();
        assert_eq!(gs.captured_red, vec![Rank::Miner]);
        assert!(gs.captured_blue.is_empty());
    }

    #[test]
    fn defender_win_records_attacker_loss() {
        let mut gs = combat_board(Rank::Miner, Rank::Marshal);
        gs.make_move(Side::Blue, (5, 0), (4, 0)).unwrap();
        assert_eq!(gs.captured_blue, vec![Rank::Miner]);
        assert!(gs.captured_red.is_empty());
    }

    #[test]
    fn mutual_destruction_records_both_losses() {
        let mut gs = combat_board(Rank::Captain, Rank::Captain);
        gs.make_move(Side::Blue, (5, 0), (4, 0)).unwrap();
        assert_eq!(gs.captured_blue, vec![Rank::Captain]);
        assert_eq!(gs.captured_red, vec![Rank::Captain]);
    }

    #[test]
    fn flag_capture_records_flag_loss() {
        let mut gs = combat_board(Rank::Scout, Rank::Flag);
        gs.make_move(Side::Blue, (5, 0), (4, 0)).unwrap();
        assert_eq!(gs.captured_red, vec![Rank::Flag]);
        assert_eq!(gs.phase, Phase::GameOver(Side::Blue));
    }

    #[test]
    fn plain_move_captures_nothing() {
        let mut gs = two_movers();
        move_and_confirm(&mut gs, Side::Blue, (9, 0), (8, 0));
        assert!(gs.captured_blue.is_empty());
        assert!(gs.captured_red.is_empty());
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri; cargo test captur`
Expected: compile error — no field `captured_red` / `captured_blue`.

- [ ] **Step 3: Implement**

In `GameState`, add fields (after `last_move`):

```rust
    /// Ranks each side has LOST, in capture order. Public to both players:
    /// combat reveals both ranks anyway.
    captured_blue: Vec<Rank>,
    captured_red: Vec<Rank>,
```

In `GameState::new()`, add:

```rust
            captured_blue: Vec::new(),
            captured_red: Vec::new(),
```

Extend `UndoSnapshot` (restored on cancel purely for uniformity — `cancel_handoff` is already refused after attacks, so these never actually roll back):

```rust
#[derive(Clone)]
struct UndoSnapshot {
    board: Board,
    last_move: Option<(Pos, Pos)>,
    captured_blue: Vec<Rank>,
    captured_red: Vec<Rank>,
}
```

Extend `take_snapshot`:

```rust
    fn take_snapshot(&mut self) {
        self.undo_snapshot = Some(UndoSnapshot {
            board: self.board.clone(),
            last_move: self.last_move,
            captured_blue: self.captured_blue.clone(),
            captured_red: self.captured_red.clone(),
        });
    }
```

Extend the restore in `cancel_handoff`:

```rust
        if let Some(snapshot) = self.undo_snapshot.take() {
            self.board = snapshot.board;
            self.last_move = snapshot.last_move;
            self.captured_blue = snapshot.captured_blue;
            self.captured_red = snapshot.captured_red;
        }
```

Add a helper method on `impl GameState`:

```rust
    fn record_loss(&mut self, side: Side, rank: Rank) {
        match side {
            Side::Blue => self.captured_blue.push(rank),
            Side::Red => self.captured_red.push(rank),
        }
    }
```

In `apply_combat`, record losses per outcome (full method after the change):

```rust
    fn apply_combat(&mut self, from: Pos, to: Pos, mut attacker: Piece, mut defender: Piece, outcome: CombatOutcome) {
        attacker.revealed = true;
        defender.revealed = true;
        match outcome {
            CombatOutcome::AttackerWins | CombatOutcome::FlagCaptured => {
                self.record_loss(defender.owner, defender.rank);
                self.board.set(to, Square::Occupied(attacker));
                self.board.set(from, Square::Empty);
            }
            CombatOutcome::DefenderWins => {
                self.record_loss(attacker.owner, attacker.rank);
                self.board.set(to, Square::Occupied(defender));
                self.board.set(from, Square::Empty);
            }
            CombatOutcome::BothDestroyed => {
                self.record_loss(attacker.owner, attacker.rank);
                self.record_loss(defender.owner, defender.rank);
                self.board.set(to, Square::Empty);
                self.board.set(from, Square::Empty);
            }
        }
    }
```

- [ ] **Step 4: Expose in StatusDto**

Add to `StatusDto`:

```rust
    pub captured_blue: Vec<Rank>,
    pub captured_red: Vec<Rank>,
```

And in `status()`:

```rust
            captured_blue: self.captured_blue.clone(),
            captured_red: self.captured_red.clone(),
```

(`Rank` already derives `Serialize` — it serializes as the rank name string, matching the TS `Rank` union.)

- [ ] **Step 5: Run all tests**

Run: `cd src-tauri; cargo test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/game/state.rs
git commit -m "feat: track captured pieces per side, expose in StatusDto"
```

---

### Task 4: Two-squares rule (backend)

A piece may hop between the same two squares at most three consecutive times; the fourth hop is rejected with `MoveError::TwoSquares`.

**Files:**
- Modify: `src-tauri/src/game/rules.rs` (one enum variant only)
- Modify: `src-tauri/src/game/state.rs` (tracking + validation — stateful history does NOT belong in stateless `rules.rs`)

- [ ] **Step 1: Add the error variant**

In `src-tauri/src/game/rules.rs`, extend `MoveError`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MoveError {
    OutOfBounds,
    NoPieceAtSource,
    NotOwnPiece,
    PieceIsStatic,
    InvalidDirection,
    TooFar,
    PathBlocked,
    DestinationIsLake,
    DestinationOccupiedByOwnPiece,
    /// Hin-und-her-Regel: same piece shuttling between the same two squares
    /// for a fourth consecutive time. Enforced by GameState (needs history).
    TwoSquares,
}
```

- [ ] **Step 2: Write the failing tests**

Add to the `tests` module in `state.rs`. Red interleaves moves but stays under its own shuttle limit (and switches to its Scout where needed):

```rust
    #[test]
    fn two_squares_rule_blocks_fourth_hop() {
        let mut gs = two_movers();
        move_and_confirm(&mut gs, Side::Blue, (9, 0), (8, 0)); // hop 1
        move_and_confirm(&mut gs, Side::Red, (0, 0), (1, 0));
        move_and_confirm(&mut gs, Side::Blue, (8, 0), (9, 0)); // hop 2
        move_and_confirm(&mut gs, Side::Red, (1, 0), (0, 0));
        move_and_confirm(&mut gs, Side::Blue, (9, 0), (8, 0)); // hop 3 — still legal
        move_and_confirm(&mut gs, Side::Red, (0, 9), (1, 9));
        // hop 4 — forbidden
        assert!(matches!(
            gs.make_move(Side::Blue, (8, 0), (9, 0)),
            Err(ActionError::Move(MoveError::TwoSquares))
        ));
        // ...and the board is untouched: the piece is still on (8,0).
        assert!(matches!(gs.board.get((8, 0)), Square::Occupied(p) if p.owner == Side::Blue));
    }

    #[test]
    fn two_squares_counter_resets_on_other_move() {
        let mut gs = two_movers();
        move_and_confirm(&mut gs, Side::Blue, (9, 0), (8, 0));
        move_and_confirm(&mut gs, Side::Red, (0, 0), (1, 0));
        move_and_confirm(&mut gs, Side::Blue, (8, 0), (9, 0));
        move_and_confirm(&mut gs, Side::Red, (1, 0), (0, 0));
        move_and_confirm(&mut gs, Side::Blue, (9, 0), (8, 0));
        move_and_confirm(&mut gs, Side::Red, (0, 9), (1, 9));
        // Blue moves a DIFFERENT piece — the shuttle counter resets.
        move_and_confirm(&mut gs, Side::Blue, (9, 9), (8, 9));
        move_and_confirm(&mut gs, Side::Red, (1, 9), (0, 9));
        // The previously forbidden hop is legal again.
        assert!(gs.make_move(Side::Blue, (8, 0), (9, 0)).is_ok());
    }

    #[test]
    fn two_squares_rule_applies_to_scout_slides() {
        // Scout slides count by exact square pair, same as single steps.
        let mut gs = two_movers();
        move_and_confirm(&mut gs, Side::Blue, (9, 9), (6, 9)); // hop 1
        move_and_confirm(&mut gs, Side::Red, (0, 0), (1, 0));
        move_and_confirm(&mut gs, Side::Blue, (6, 9), (9, 9)); // hop 2
        move_and_confirm(&mut gs, Side::Red, (1, 0), (0, 0));
        move_and_confirm(&mut gs, Side::Blue, (9, 9), (6, 9)); // hop 3
        move_and_confirm(&mut gs, Side::Red, (0, 9), (1, 9));
        assert!(matches!(
            gs.make_move(Side::Blue, (6, 9), (9, 9)),
            Err(ActionError::Move(MoveError::TwoSquares))
        ));
    }

    #[test]
    fn cancel_handoff_restores_shuttle_state() {
        let mut gs = two_movers();
        move_and_confirm(&mut gs, Side::Blue, (9, 0), (8, 0)); // count 1
        move_and_confirm(&mut gs, Side::Red, (0, 0), (1, 0));
        // Blue hops back (count 2) but reconsiders.
        gs.make_move(Side::Blue, (8, 0), (9, 0)).unwrap();
        gs.cancel_handoff().unwrap();
        assert_eq!(gs.shuttle_blue, Some(Shuttle { a: (9, 0), b: (8, 0), count: 1 }));
    }
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd src-tauri; cargo test two_squares`
Expected: compile error — `Shuttle` / `shuttle_blue` don't exist.

- [ ] **Step 4: Implement**

In `state.rs`, above `UndoSnapshot`:

```rust
/// Hin-und-her-Regel bookkeeping: `a → b` was the side's last move, and it
/// was the `count`-th consecutive hop within the unordered pair {a, b}.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Shuttle {
    a: Pos,
    b: Pos,
    count: u8,
}
```

In `GameState`, add fields (after `captured_red`):

```rust
    shuttle_blue: Option<Shuttle>,
    shuttle_red: Option<Shuttle>,
```

In `GameState::new()`, add `shuttle_blue: None,` and `shuttle_red: None,`.

Extend `UndoSnapshot` (final form):

```rust
#[derive(Clone)]
struct UndoSnapshot {
    board: Board,
    last_move: Option<(Pos, Pos)>,
    captured_blue: Vec<Rank>,
    captured_red: Vec<Rank>,
    shuttle_blue: Option<Shuttle>,
    shuttle_red: Option<Shuttle>,
}
```

Extend `take_snapshot` (final form):

```rust
    fn take_snapshot(&mut self) {
        self.undo_snapshot = Some(UndoSnapshot {
            board: self.board.clone(),
            last_move: self.last_move,
            captured_blue: self.captured_blue.clone(),
            captured_red: self.captured_red.clone(),
            shuttle_blue: self.shuttle_blue,
            shuttle_red: self.shuttle_red,
        });
    }
```

Extend the restore in `cancel_handoff` (final form):

```rust
        if let Some(snapshot) = self.undo_snapshot.take() {
            self.board = snapshot.board;
            self.last_move = snapshot.last_move;
            self.captured_blue = snapshot.captured_blue;
            self.captured_red = snapshot.captured_red;
            self.shuttle_blue = snapshot.shuttle_blue;
            self.shuttle_red = snapshot.shuttle_red;
        }
```

Add helper methods on `impl GameState`:

```rust
    fn shuttle(&self, side: Side) -> &Option<Shuttle> {
        match side {
            Side::Blue => &self.shuttle_blue,
            Side::Red => &self.shuttle_red,
        }
    }

    fn shuttle_mut(&mut self, side: Side) -> &mut Option<Shuttle> {
        match side {
            Side::Blue => &mut self.shuttle_blue,
            Side::Red => &mut self.shuttle_red,
        }
    }

    /// Hin-und-her-Regel: the move is the fourth consecutive hop within the
    /// same square pair. After `a → b` the piece sits on `b`, so the only
    /// possible continuation of the shuttle is the exact reverse `b → a`.
    fn violates_two_squares(&self, side: Side, from: Pos, to: Pos) -> bool {
        matches!(self.shuttle(side), Some(s) if s.b == from && s.a == to && s.count >= 3)
    }

    /// Records the executed move: reverse hop extends the streak, anything
    /// else starts a fresh pair at count 1.
    fn track_shuttle(&mut self, side: Side, from: Pos, to: Pos) {
        let slot = self.shuttle_mut(side);
        let count = match *slot {
            Some(s) if s.b == from && s.a == to => s.count + 1,
            _ => 1,
        };
        *slot = Some(Shuttle { a: from, b: to, count });
    }
```

In `make_move`, right after the `rules::validate_move(...)` line and **before** `self.take_snapshot()`:

```rust
        if self.violates_two_squares(side, from, to) {
            return Err(ActionError::Move(MoveError::TwoSquares));
        }
```

And right after the `self.last_move = Some((from, to));` line from Task 2:

```rust
        self.track_shuttle(side, from, to);
```

- [ ] **Step 5: Run all tests**

Run: `cd src-tauri; cargo test`
Expected: all PASS (verify the four new two-squares/shuttle tests are listed).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/game/rules.rs src-tauri/src/game/state.rs
git commit -m "feat: two-squares rule (Hin-und-her-Regel) with undo-safe tracking"
```

---

### Task 5: `new_game` command (backend)

**Files:**
- Modify: `src-tauri/src/game/state.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs:29-40` (generate_handler list)

- [ ] **Step 1: Write the failing test**

Add to the `tests` module in `state.rs`:

```rust
    #[test]
    fn reset_returns_to_fresh_setup() {
        let mut gs = combat_board(Rank::Marshal, Rank::Miner);
        // Mutate everything: a capture fills captured_red, sets last_move,
        // shuttle, and leaves a handoff pending.
        gs.make_move(Side::Blue, (5, 0), (4, 0)).unwrap();
        gs.reset();
        assert_eq!(gs.phase, Phase::SetupBlue);
        assert_eq!(gs.last_move, None);
        assert!(gs.captured_blue.is_empty());
        assert!(gs.captured_red.is_empty());
        assert_eq!(gs.shuttle_blue, None);
        assert!(gs.pending_handoff.is_none());
        assert!(gs.status().pending_handoff.is_none());
        // Board is empty again (4,0 held the winning Marshal).
        assert_eq!(gs.board.get((4, 0)), Square::Empty);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri; cargo test reset_returns`
Expected: compile error — no method `reset`.

- [ ] **Step 3: Implement `reset`**

On `impl GameState` (next to `new`):

```rust
    /// "Neue Partie": throws everything away and starts over at Blue's setup.
    /// Deliberately has no preconditions — allowed mid-game and even while a
    /// handoff is pending (the reset clears that too).
    pub fn reset(&mut self) {
        *self = GameState::new();
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri; cargo test`
Expected: all PASS.

- [ ] **Step 5: Add the Tauri command and register it**

In `src-tauri/src/commands.rs` (at the end):

```rust
/// "Neue Partie": full reset to a fresh SetupBlue. No preconditions — works
/// in any phase, including while a handoff popup is pending.
#[tauri::command]
pub fn new_game(window: WebviewWindow, state: State<AppState>) {
    state.0.lock().unwrap().reset();
    notify(&window);
}
```

In `src-tauri/src/lib.rs`, add to `generate_handler!` after `commands::cancel_handoff,`:

```rust
            commands::new_game,
```

- [ ] **Step 6: Verify it compiles + tests pass**

Run: `cd src-tauri; cargo test`
Expected: all PASS, no warnings about `new_game`.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/game/state.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: new_game command resets to fresh setup"
```

---

### Task 6: Frontend types + API wrapper

**Files:**
- Modify: `src/types.ts:77-81` (StatusDto)
- Modify: `src/api.ts`

- [ ] **Step 1: Extend `StatusDto` in `src/types.ts`**

Replace the existing `StatusDto` block with:

```ts
/** Mirrors Rust's LastMoveDto: most recent executed move, public to both. */
export type LastMove = {
  from_row: number;
  from_col: number;
  to_row: number;
  to_col: number;
};

export type StatusDto = {
  phase: PhaseDto;
  pending_handoff: Side | null;
  pending_attack: boolean;
  last_move: LastMove | null;
  /** Ranks each side has LOST, in capture order (combat is public info). */
  captured_blue: Rank[];
  captured_red: Rank[];
};
```

- [ ] **Step 2: Add the `newGame` wrapper in `src/api.ts`**

In the `api` object, after `cancelHandoff`:

```ts
  newGame: () => invoke<void>("new_game"),
```

- [ ] **Step 3: Type-check**

Run: `pnpm build`
Expected: PASS (tsc clean; new fields are additive, nothing consumes them yet).

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/api.ts
git commit -m "feat: frontend types + api for new_game, last_move, captured lists"
```

---

### Task 7: CapturedTray component

**Files:**
- Create: `src/components/CapturedTray.tsx`
- Modify: `src/components/BoardPanel.tsx` (render below the grid)
- Modify: `src/App.css` (append styles)

- [ ] **Step 1: Create `src/components/CapturedTray.tsx`**

```tsx
import { ALL_RANKS, RANK_LABEL, type Rank, type Side } from "../types";

type Props = {
  /** Ranks LOST by Blue / Red, in capture order (from StatusDto). */
  capturedBlue: Rank[];
  capturedRed: Rank[];
};

const ROWS: { side: Side; label: string }[] = [
  { side: "Blue", label: "Verluste Blau" },
  { side: "Red", label: "Verluste Rot" },
];

/** Collapses the capture list into (rank, count) pairs, ordered strong→weak
 * (ALL_RANKS order) so the trays on both panels always look identical. */
function groupByRank(captured: Rank[]): [Rank, number][] {
  const counts = new Map<Rank, number>();
  for (const rank of captured) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  return ALL_RANKS.filter((rank) => counts.has(rank)).map((rank) => [rank, counts.get(rank)!]);
}

/** Identical on both panels — combat publicly reveals both ranks, so the
 * graveyard leaks nothing the players haven't already seen. */
export function CapturedTray({ capturedBlue, capturedRed }: Props) {
  return (
    <div className="captured-tray">
      {ROWS.map(({ side, label }) => {
        const groups = groupByRank(side === "Blue" ? capturedBlue : capturedRed);
        return (
          <div className="captured-tray__row" key={side}>
            <span className="captured-tray__label">{label}:</span>
            {groups.length === 0 && <span className="captured-tray__empty">–</span>}
            {groups.map(([rank, count]) => (
              <span
                key={rank}
                className={`captured-tray__chip captured-tray__chip--${side.toLowerCase()}`}
              >
                {RANK_LABEL[rank]}
                {count > 1 && <small> ×{count}</small>}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Render it in `BoardPanel.tsx`**

Add the import at the top:

```tsx
import { CapturedTray } from "./CapturedTray";
```

In the JSX, directly after `<div className="board-grid">{rows}</div>` and before the `{error && …}` line:

```tsx
      {!isSetupPhase && (
        <CapturedTray capturedBlue={status.captured_blue} capturedRed={status.captured_red} />
      )}
```

(Hidden during setup: nothing can be captured yet and vertical space is taken by the SetupTray.)

- [ ] **Step 3: Append styles to `src/App.css`**

```css
/* --- Captured-pieces tray (Verluste) --- */
.captured-tray {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  font-size: 0.78rem;
}

.captured-tray__row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.captured-tray__label {
  opacity: 0.7;
  min-width: 7.5em;
}

.captured-tray__empty {
  opacity: 0.4;
}

.captured-tray__chip {
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  white-space: nowrap;
}

.captured-tray__chip--blue {
  border-color: rgba(80, 140, 255, 0.6);
}

.captured-tray__chip--red {
  border-color: rgba(255, 90, 90, 0.6);
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/CapturedTray.tsx src/components/BoardPanel.tsx src/App.css
git commit -m "feat: captured-pieces tray on both panels"
```

---

### Task 8: Last-move highlight

**Files:**
- Modify: `src/components/Square.tsx`
- Modify: `src/components/BoardPanel.tsx`
- Modify: `src/App.css` (append styles)

- [ ] **Step 1: Add props + classes to `Square.tsx`**

Add to the `Props` type (after `legalTarget: boolean;`):

```tsx
  /** From/to square of the most recent move — public info, shown on both panels. */
  lastFrom?: boolean;
  lastTo?: boolean;
```

Add the props to the destructuring in the function signature (after `legalTarget,`):

```tsx
  lastFrom,
  lastTo,
```

Add the classes (after the `if (legalTarget)` line):

```tsx
  if (lastFrom) classes.push("square--last-from");
  if (lastTo) classes.push("square--last-to");
```

- [ ] **Step 2: Wire them up in `BoardPanel.tsx`**

In the `BoardPanel` body, after the `const highlightedFrom = …` line:

```tsx
  const lastMove = status.last_move;
```

In the cell loop, add to the `<Square …>` element (after `legalTarget={…}`):

```tsx
          lastFrom={lastMove !== null && lastMove.from_row === pos.row && lastMove.from_col === pos.col}
          lastTo={lastMove !== null && lastMove.to_row === pos.row && lastMove.to_col === pos.col}
```

- [ ] **Step 3: Append styles to `src/App.css`**

`:not(.square--selected)` keeps the (earlier-defined) selection highlight visually dominant when both apply — appended rules would otherwise win the cascade:

```css
/* --- Last-move highlight (public info, both panels) --- */
.square--last-from:not(.square--selected) {
  box-shadow: inset 0 0 0 3px rgba(255, 200, 60, 0.45);
}

.square--last-to:not(.square--selected) {
  box-shadow: inset 0 0 0 3px rgba(255, 200, 60, 0.85);
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Square.tsx src/components/BoardPanel.tsx src/App.css
git commit -m "feat: highlight last move's from/to squares"
```

---

### Task 9: "Neue Partie" in SettingsPanel

**Files:**
- Modify: `src/components/SettingsPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css` (append styles)

- [ ] **Step 1: Rewrite `SettingsPanel.tsx` with the two-step confirm**

Full new file content (existing toggles unchanged; adds `onNewGame` prop, confirm state that re-arms whenever the panel closes):

```tsx
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
```

- [ ] **Step 2: Wire `onNewGame` in `App.tsx`**

Add to the `<SettingsPanel …>` element (after `onTogglePermanentReveal={setPermanentRevealEnabled}`):

```tsx
        onNewGame={() => {
          api.newGame();
          setSettingsOpen(false);
        }}
```

(`new_game` emits `state-changed`, so `useGame` refreshes both panels automatically; no extra handling needed.)

- [ ] **Step 3: Append styles to `src/App.css`**

```css
/* --- Neue Partie (settings) --- */
.settings-newgame {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-newgame__start,
.settings-newgame__confirm {
  border: 1px solid rgba(255, 90, 90, 0.6);
  color: rgb(255, 140, 140);
  background: transparent;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
}

.settings-newgame__confirm:hover,
.settings-newgame__start:hover {
  background: rgba(255, 90, 90, 0.15);
}

.settings-newgame__warning {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.85;
}

.settings-newgame__buttons {
  display: flex;
  gap: 8px;
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsPanel.tsx src/App.tsx src/App.css
git commit -m "feat: Neue Partie button in settings with two-step confirm"
```

---

### Task 10: German error text for TwoSquares + final verification

**Files:**
- Modify: `src/components/BoardPanel.tsx`

- [ ] **Step 1: Map the backend error to German**

Backend errors arrive as Debug strings (e.g. `"Move(TwoSquares)"`). Add above the `BoardPanel` function (next to the other module-level helpers like `isStatic`):

```tsx
/** Backend errors arrive as Rust Debug strings; translate the ones a player
 * can actually run into through normal clicking. Everything else (already
 * prevented by the UI's legal-target filter) stays raw. */
function describeError(raw: string): string {
  if (raw.includes("TwoSquares")) {
    return "Hin-und-her-Regel: Diese Figur darf nicht erneut zwischen denselben Feldern hin- und herziehen.";
  }
  return raw;
}
```

In the `run` helper, change the catch line from `setError(String(err));` to:

```tsx
      setError(describeError(String(err)));
```

- [ ] **Step 2: Full verification**

Run: `cd src-tauri; cargo test`
Expected: all tests PASS (rules + the ~12 new state tests).

Run: `pnpm build`
Expected: tsc + vite build PASS.

- [ ] **Step 3: Manual smoke test**

Run: `pnpm tauri dev` and check:
1. Setup both sides ("Rest zufällig verteilen" + "Aufstellung abschließen"), play a move — moved piece's from/to squares show the yellow highlight on **both** panels.
2. Attack an enemy piece — after the banner, both "Verluste" rows show the fallen rank chip.
3. Shuttle one piece A→B→A→B (with opponent moves in between) — the 4th hop B→A shows the German Hin-und-her-Regel error and the board is unchanged.
4. Settings → "Neue Partie" → confirm prompt appears → "Ja, neue Partie" → back to Blue setup, trays/highlights cleared. "Abbrechen" backs out. Closing and reopening settings re-arms the confirm step.
5. Make a plain (non-attack) move, click "Ich überlege noch einmal" — last-move highlight reverts to the previous move.

- [ ] **Step 4: Commit**

```bash
git add src/components/BoardPanel.tsx
git commit -m "feat: German error text for Hin-und-her-Regel"
```
