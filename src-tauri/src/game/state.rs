use rand::{seq::SliceRandom, thread_rng};
use serde::Serialize;

use super::board::{Board, Pos, Square};
use super::piece::{Piece, Rank, Side};
use super::rules::{self, CombatOutcome, MoveError, PlaceError};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase {
    SetupBlue,
    SetupRed,
    Playing(Side),
    GameOver(Side),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActionError {
    WrongPhase,
    HandoffPending,
    NoPendingHandoff,
    CannotCancelAttack,
    SetupIncomplete,
    Placement(PlaceError),
    Move(MoveError),
}

impl std::fmt::Display for ActionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self)
    }
}

/// What a single square looks like to one particular viewer.
/// `rank: None` is the hidden card-back; during blind setup the opponent's
/// pieces don't even show up as occupied (see [`square_view`]).
#[derive(Serialize, Clone, Debug)]
#[serde(tag = "kind")]
pub enum SquareView {
    Empty,
    Lake,
    Piece { owner: Side, rank: Option<Rank> },
}

pub type BoardView = Vec<Vec<SquareView>>;

#[derive(Serialize, Clone, Copy, Debug)]
#[serde(tag = "kind")]
pub enum PhaseDto {
    SetupBlue,
    SetupRed,
    Playing { turn: Side },
    GameOver { winner: Side },
}

impl From<Phase> for PhaseDto {
    fn from(phase: Phase) -> Self {
        match phase {
            Phase::SetupBlue => PhaseDto::SetupBlue,
            Phase::SetupRed => PhaseDto::SetupRed,
            Phase::Playing(turn) => PhaseDto::Playing { turn },
            Phase::GameOver(winner) => PhaseDto::GameOver { winner },
        }
    }
}

/// Snapshot of a single combat resolution, sent to the frontend so it can
/// animate the clash even though the destroyed piece never lands on the board.
#[derive(Serialize, Clone, Copy, Debug)]
pub struct CombatResultDto {
    pub row: usize,
    pub col: usize,
    pub attacker_owner: Side,
    pub attacker_rank: Rank,
    pub defender_owner: Side,
    pub defender_rank: Rank,
    pub outcome: CombatOutcome,
}

/// `last_move` flattened for the frontend (Pos tuples would serialize as
/// arrays, which is awkward to type on the TS side).
#[derive(Serialize, Clone, Copy, Debug)]
pub struct LastMoveDto {
    pub from_row: usize,
    pub from_col: usize,
    pub to_row: usize,
    pub to_col: usize,
}

#[derive(Serialize, Clone, Debug)]
pub struct StatusDto {
    pub phase: PhaseDto,
    pub pending_handoff: Option<Side>,
    /// `true` when the pending handoff was triggered by an attack (a move
    /// onto an occupied square) — the frontend disables "Ich überlege noch
    /// einmal" in that case, since combat outcomes can't be taken back.
    pub pending_attack: bool,
    pub last_move: Option<LastMoveDto>,
    pub captured_blue: Vec<Rank>,
    pub captured_red: Vec<Rank>,
}

/// Hin-und-her-Regel bookkeeping: `a → b` was the side's last move, and it
/// was the `count`-th consecutive hop within the unordered pair {a, b}.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Shuttle {
    a: Pos,
    b: Pos,
    count: u8,
}

/// Everything `cancel_handoff` ("Ich überlege noch einmal") must restore.
/// Grows alongside GameState: any per-game field mutated by a cancellable
/// action belongs in here.
#[derive(Clone)]
struct UndoSnapshot {
    board: Board,
    last_move: Option<(Pos, Pos)>,
    captured_blue: Vec<Rank>,
    captured_red: Vec<Rank>,
    shuttle_blue: Option<Shuttle>,
    shuttle_red: Option<Shuttle>,
}

pub struct GameState {
    board: Board,
    phase: Phase,
    /// Phase to switch to once "Übergeben" is confirmed. `None` while no
    /// handoff popup is pending.
    pending_transition: Option<Phase>,
    /// Side whose action is awaiting confirmation (drives which popup shows
    /// and which side regains control on "Ich überlege noch einmal").
    pending_handoff: Option<Side>,
    /// Whether the pending handoff resulted from an attack (combat), as
    /// opposed to a plain move or finishing setup. Combat can't be undone,
    /// so [`cancel_handoff`](Self::cancel_handoff) refuses while this is set.
    pending_attack: bool,
    /// Snapshot taken right before the pending action was applied,
    /// restored verbatim on cancel.
    undo_snapshot: Option<UndoSnapshot>,
    /// From/to of the most recent executed move, shown to both players
    /// (movement is public information in Stratego).
    last_move: Option<(Pos, Pos)>,
    /// Ranks each side has LOST, in capture order. Public to both players:
    /// combat reveals both ranks anyway.
    captured_blue: Vec<Rank>,
    captured_red: Vec<Rank>,
    shuttle_blue: Option<Shuttle>,
    shuttle_red: Option<Shuttle>,
}

impl GameState {
    pub fn new() -> Self {
        GameState {
            board: Board::new(),
            phase: Phase::SetupBlue,
            pending_transition: None,
            pending_handoff: None,
            pending_attack: false,
            undo_snapshot: None,
            last_move: None,
            captured_blue: Vec::new(),
            captured_red: Vec::new(),
            shuttle_blue: None,
            shuttle_red: None,
        }
    }

    /// "Neue Partie": throws everything away and starts over at Blue's setup.
    /// Deliberately has no preconditions — allowed mid-game and even while a
    /// handoff is pending (the reset clears that too).
    pub fn reset(&mut self) {
        *self = GameState::new();
    }

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
            captured_blue: self.captured_blue.clone(),
            captured_red: self.captured_red.clone(),
        }
    }

    pub fn board_view(&self, viewer: Side) -> BoardView {
        self.board
            .squares
            .iter()
            .map(|row| row.iter().map(|&sq| square_view(sq, viewer, self.phase)).collect())
            .collect()
    }

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

    fn expect_no_pending(&self) -> Result<(), ActionError> {
        if self.pending_handoff.is_some() {
            Err(ActionError::HandoffPending)
        } else {
            Ok(())
        }
    }

    pub fn place_piece(&mut self, side: Side, pos: Pos, rank: Rank) -> Result<(), ActionError> {
        self.expect_no_pending()?;
        let expected = match side {
            Side::Blue => Phase::SetupBlue,
            Side::Red => Phase::SetupRed,
        };
        if self.phase != expected {
            return Err(ActionError::WrongPhase);
        }
        rules::validate_placement(&self.board, side, pos, rank).map_err(ActionError::Placement)?;
        self.board.set(pos, Square::Occupied(Piece::new(side, rank)));
        Ok(())
    }

    /// Take a piece back off the board during one's own setup phase
    /// (so the player can rearrange before clicking "fertig").
    pub fn unplace_piece(&mut self, side: Side, pos: Pos) -> Result<(), ActionError> {
        self.expect_no_pending()?;
        let expected = match side {
            Side::Blue => Phase::SetupBlue,
            Side::Red => Phase::SetupRed,
        };
        if self.phase != expected {
            return Err(ActionError::WrongPhase);
        }
        match self.board.get(pos) {
            Square::Occupied(p) if p.owner == side => {
                self.board.set(pos, Square::Empty);
                Ok(())
            }
            _ => Err(ActionError::Placement(PlaceError::SquareOccupied)),
        }
    }

    /// Move an already-placed piece to a different square during one's own
    /// setup phase, without giving it back to the reserve. Lifts the piece
    /// off `from` first so `validate_placement` doesn't count it against its
    /// own quota at the destination, then restores it on failure.
    pub fn reposition_piece(&mut self, side: Side, from: Pos, to: Pos) -> Result<(), ActionError> {
        self.expect_no_pending()?;
        let expected = match side {
            Side::Blue => Phase::SetupBlue,
            Side::Red => Phase::SetupRed,
        };
        if self.phase != expected {
            return Err(ActionError::WrongPhase);
        }
        let piece = match self.board.get(from) {
            Square::Occupied(p) if p.owner == side => p,
            _ => return Err(ActionError::Placement(PlaceError::SquareOccupied)),
        };
        self.board.set(from, Square::Empty);
        if let Err(e) = rules::validate_placement(&self.board, side, to, piece.rank) {
            self.board.set(from, Square::Occupied(piece));
            return Err(ActionError::Placement(e));
        }
        self.board.set(to, Square::Occupied(piece));
        Ok(())
    }

    /// Clears every piece `side` has on its home rows and re-scatters the
    /// full set across them at random, so repeated clicks keep reshuffling
    /// into a fresh layout rather than only filling in whatever's left.
    pub fn random_setup(&mut self, side: Side) -> Result<(), ActionError> {
        self.expect_no_pending()?;
        let expected = match side {
            Side::Blue => Phase::SetupBlue,
            Side::Red => Phase::SetupRed,
        };
        if self.phase != expected {
            return Err(ActionError::WrongPhase);
        }

        let home: Vec<Pos> = Board::home_rows(side)
            .flat_map(|row| (0..super::board::SIZE).map(move |col| (row, col)))
            .collect();
        for &pos in &home {
            if matches!(self.board.get(pos), Square::Occupied(p) if p.owner == side) {
                self.board.set(pos, Square::Empty);
            }
        }

        let mut empties: Vec<Pos> = home
            .into_iter()
            .filter(|&pos| matches!(self.board.get(pos), Square::Empty))
            .collect();
        let mut ranks = rules::remaining_ranks(&self.board, side);

        let mut rng = thread_rng();
        empties.shuffle(&mut rng);
        ranks.shuffle(&mut rng);

        for (pos, rank) in empties.into_iter().zip(ranks) {
            self.board.set(pos, Square::Occupied(Piece::new(side, rank)));
        }
        Ok(())
    }

    pub fn finish_setup(&mut self, side: Side) -> Result<(), ActionError> {
        self.expect_no_pending()?;
        let (expected, next) = match side {
            Side::Blue => (Phase::SetupBlue, Phase::SetupRed),
            Side::Red => (Phase::SetupRed, Phase::Playing(Side::Blue)),
        };
        if self.phase != expected {
            return Err(ActionError::WrongPhase);
        }
        if !rules::setup_complete(&self.board, side) {
            return Err(ActionError::SetupIncomplete);
        }
        self.take_snapshot();
        self.pending_transition = Some(next);
        self.pending_handoff = Some(side);
        self.pending_attack = false;
        Ok(())
    }

    pub fn make_move(&mut self, side: Side, from: Pos, to: Pos) -> Result<Option<CombatResultDto>, ActionError> {
        self.expect_no_pending()?;
        if self.phase != Phase::Playing(side) {
            return Err(ActionError::WrongPhase);
        }
        rules::validate_move(&self.board, side, from, to).map_err(ActionError::Move)?;

        if self.violates_two_squares(side, from, to) {
            return Err(ActionError::Move(MoveError::TwoSquares));
        }

        self.take_snapshot();

        let attacker = match self.board.get(from) {
            Square::Occupied(p) => p,
            _ => unreachable!("validate_move guarantees a piece at `from`"),
        };

        let combat_result = match self.board.get(to) {
            Square::Occupied(defender) => {
                let outcome = rules::resolve_combat(attacker.rank, defender.rank);
                self.apply_combat(from, to, attacker, defender, outcome);
                Some(CombatResultDto {
                    row: to.0,
                    col: to.1,
                    attacker_owner: attacker.owner,
                    attacker_rank: attacker.rank,
                    defender_owner: defender.owner,
                    defender_rank: defender.rank,
                    outcome,
                })
            }
            _ => {
                self.board.set(to, Square::Occupied(attacker));
                self.board.set(from, Square::Empty);
                None
            }
        };

        self.last_move = Some((from, to));
        self.track_shuttle(side, from, to);

        let flag_captured = matches!(
            combat_result,
            Some(CombatResultDto { outcome: CombatOutcome::FlagCaptured, .. })
        );
        let next_phase = if flag_captured {
            Phase::GameOver(side)
        } else {
            let opponent = side.other();
            if rules::has_legal_move(&self.board, opponent) {
                Phase::Playing(opponent)
            } else {
                Phase::GameOver(side)
            }
        };

        if let Phase::GameOver(_) = next_phase {
            // Game-ending move: skip the "Übergeben" handoff — there's no
            // next side to hand control to, so jump straight to GameOver.
            self.phase = next_phase;
            self.undo_snapshot = None;
        } else {
            self.pending_transition = Some(next_phase);
            self.pending_handoff = Some(side);
            self.pending_attack = combat_result.is_some();
        }
        Ok(combat_result)
    }

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

    fn record_loss(&mut self, side: Side, rank: Rank) {
        match side {
            Side::Blue => self.captured_blue.push(rank),
            Side::Red => self.captured_red.push(rank),
        }
    }

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

    /// Confirms the pending handoff: applies the queued phase transition,
    /// clears the undo snapshot and reports which side now has control
    /// (so the caller can trigger the cursor jump).
    pub fn confirm_handoff(&mut self) -> Result<Side, ActionError> {
        let next_phase = self
            .pending_transition
            .take()
            .ok_or(ActionError::NoPendingHandoff)?;
        self.pending_handoff = None;
        self.undo_snapshot = None;
        self.phase = next_phase;
        Ok(self.side_in_control())
    }

    /// "Ich überlege noch einmal": restores the board to the snapshot taken
    /// right before the pending action, drops the queued transition, and
    /// hands control straight back to the side that just acted (no phase
    /// change, no cursor jump).
    pub fn cancel_handoff(&mut self) -> Result<Side, ActionError> {
        if self.pending_handoff.is_none() {
            return Err(ActionError::NoPendingHandoff);
        }
        if self.pending_attack {
            return Err(ActionError::CannotCancelAttack);
        }
        let acting_side = self
            .pending_handoff
            .take()
            .ok_or(ActionError::NoPendingHandoff)?;
        if let Some(snapshot) = self.undo_snapshot.take() {
            self.board = snapshot.board;
            self.last_move = snapshot.last_move;
            self.captured_blue = snapshot.captured_blue;
            self.captured_red = snapshot.captured_red;
            self.shuttle_blue = snapshot.shuttle_blue;
            self.shuttle_red = snapshot.shuttle_red;
        }
        self.pending_transition = None;
        Ok(acting_side)
    }

    fn side_in_control(&self) -> Side {
        match self.phase {
            Phase::SetupBlue | Phase::Playing(Side::Blue) => Side::Blue,
            Phase::SetupRed | Phase::Playing(Side::Red) => Side::Red,
            Phase::GameOver(winner) => winner,
        }
    }
}

/// Filters a raw square into what `viewer` is allowed to see:
/// - own pieces: full rank
/// - pieces ever involved in combat (`revealed`): full rank for everyone
/// - opponent pieces otherwise: hidden card-back (`rank: None`)
/// - during either setup phase, the opponent's pieces are fully invisible
///   (not even as "occupied") so neither side can react to the other's
///   placement — mirrors the screens coming down simultaneously at kickoff.
fn square_view(square: Square, viewer: Side, phase: Phase) -> SquareView {
    match square {
        Square::Empty => SquareView::Empty,
        Square::Lake => SquareView::Lake,
        Square::Occupied(piece) => {
            let blind_setup = piece.owner != viewer && matches!(phase, Phase::SetupBlue | Phase::SetupRed);
            if blind_setup {
                SquareView::Empty
            } else if piece.owner == viewer || piece.revealed || matches!(phase, Phase::GameOver(_)) {
                SquareView::Piece {
                    owner: piece.owner,
                    rank: Some(piece.rank),
                }
            } else {
                SquareView::Piece {
                    owner: piece.owner,
                    rank: None,
                }
            }
        }
    }
}

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

    #[test]
    fn cancel_handoff_restores_board() {
        let mut gs = two_movers();
        gs.make_move(Side::Blue, (9, 0), (8, 0)).unwrap();
        gs.cancel_handoff().unwrap();
        assert!(matches!(gs.board.get((9, 0)), Square::Occupied(p) if p.rank == Rank::Miner));
        assert_eq!(gs.board.get((8, 0)), Square::Empty);
        assert_eq!(gs.phase, Phase::Playing(Side::Blue));
    }

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
}
