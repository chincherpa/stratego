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

#[derive(Serialize, Clone, Debug)]
pub struct StatusDto {
    pub phase: PhaseDto,
    pub pending_handoff: Option<Side>,
    /// `true` when the pending handoff was triggered by an attack (a move
    /// onto an occupied square) — the frontend disables "Ich überlege noch
    /// einmal" in that case, since combat outcomes can't be taken back.
    pub pending_attack: bool,
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
    /// Board snapshot taken right before the pending action was applied,
    /// restored verbatim on cancel.
    undo_snapshot: Option<Board>,
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
        }
    }

    pub fn status(&self) -> StatusDto {
        StatusDto {
            phase: self.phase.into(),
            pending_handoff: self.pending_handoff,
            pending_attack: self.pending_attack,
        }
    }

    pub fn board_view(&self, viewer: Side) -> BoardView {
        self.board
            .squares
            .iter()
            .map(|row| row.iter().map(|&sq| square_view(sq, viewer, self.phase)).collect())
            .collect()
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

    /// Scatters every rank `side` hasn't placed yet across its still-empty
    /// home-row squares (lakes and already-occupied squares excluded), so a
    /// player can skip manual placement entirely or fill in whatever's left.
    pub fn random_setup(&mut self, side: Side) -> Result<(), ActionError> {
        self.expect_no_pending()?;
        let expected = match side {
            Side::Blue => Phase::SetupBlue,
            Side::Red => Phase::SetupRed,
        };
        if self.phase != expected {
            return Err(ActionError::WrongPhase);
        }

        let mut empties: Vec<Pos> = Board::home_rows(side)
            .flat_map(|row| (0..super::board::SIZE).map(move |col| (row, col)))
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
        self.undo_snapshot = Some(self.board.clone());
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

        self.undo_snapshot = Some(self.board.clone());

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

    fn apply_combat(&mut self, from: Pos, to: Pos, mut attacker: Piece, mut defender: Piece, outcome: CombatOutcome) {
        attacker.revealed = true;
        defender.revealed = true;
        match outcome {
            CombatOutcome::AttackerWins | CombatOutcome::FlagCaptured => {
                self.board.set(to, Square::Occupied(attacker));
                self.board.set(from, Square::Empty);
            }
            CombatOutcome::DefenderWins => {
                self.board.set(to, Square::Occupied(defender));
                self.board.set(from, Square::Empty);
            }
            CombatOutcome::BothDestroyed => {
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
        if let Some(board) = self.undo_snapshot.take() {
            self.board = board;
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
