use serde::Serialize;

use super::board::{Board, Pos, Square};
use super::piece::{Rank, Side};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MoveError {
    OutOfBounds,
    NoPieceAtSource,
    NotOwnPiece,
    PieceIsStatic,
    NotOrthogonalSingleStep,
    DestinationIsLake,
    DestinationOccupiedByOwnPiece,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaceError {
    NotHomeRow,
    SquareIsLake,
    SquareOccupied,
    RankQuotaExceeded,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum CombatOutcome {
    AttackerWins,
    DefenderWins,
    BothDestroyed,
    FlagCaptured,
}

/// v1 movement rules: orthogonal, exactly one square, no diagonals,
/// can't land on water, can't land on own piece, Bombs/Flag never move.
pub fn validate_move(board: &Board, side: Side, from: Pos, to: Pos) -> Result<(), MoveError> {
    if !Board::in_bounds(from.0 as isize, from.1 as isize)
        || !Board::in_bounds(to.0 as isize, to.1 as isize)
    {
        return Err(MoveError::OutOfBounds);
    }

    let piece = match board.get(from) {
        Square::Occupied(p) => p,
        _ => return Err(MoveError::NoPieceAtSource),
    };
    if piece.owner != side {
        return Err(MoveError::NotOwnPiece);
    }
    if piece.rank.is_static() {
        return Err(MoveError::PieceIsStatic);
    }

    let row_delta = (to.0 as isize - from.0 as isize).abs();
    let col_delta = (to.1 as isize - from.1 as isize).abs();
    if !((row_delta == 1 && col_delta == 0) || (row_delta == 0 && col_delta == 1)) {
        return Err(MoveError::NotOrthogonalSingleStep);
    }

    match board.get(to) {
        Square::Lake => Err(MoveError::DestinationIsLake),
        Square::Occupied(target) if target.owner == side => {
            Err(MoveError::DestinationOccupiedByOwnPiece)
        }
        _ => Ok(()),
    }
}

/// Higher rank wins; equal ranks destroy each other; capturing the Flag ends the game.
pub fn resolve_combat(attacker: Rank, defender: Rank) -> CombatOutcome {
    if defender == Rank::Flag {
        return CombatOutcome::FlagCaptured;
    }
    let (a, d) = (attacker.strength(), defender.strength());
    if a > d {
        CombatOutcome::AttackerWins
    } else if a < d {
        CombatOutcome::DefenderWins
    } else {
        CombatOutcome::BothDestroyed
    }
}

/// True if `side` has at least one piece that can make a legal move.
/// Used for the stalemate-loss check after each turn.
pub fn has_legal_move(board: &Board, side: Side) -> bool {
    for row in 0..super::board::SIZE {
        for col in 0..super::board::SIZE {
            let from = (row, col);
            if let Square::Occupied(piece) = board.get(from) {
                if piece.owner == side && !piece.rank.is_static() {
                    for to in Board::orthogonal_neighbors(from) {
                        if validate_move(board, side, from, to).is_ok() {
                            return true;
                        }
                    }
                }
            }
        }
    }
    false
}

fn count_on_board(board: &Board, side: Side, rank: Rank) -> u8 {
    let mut n = 0;
    for row in board.squares.iter() {
        for square in row.iter() {
            if let Square::Occupied(p) = square {
                if p.owner == side && p.rank == rank {
                    n += 1;
                }
            }
        }
    }
    n
}

/// Setup placement rules: own home rows only, empty land square,
/// and no more than the standard quota per rank (40-piece set).
pub fn validate_placement(board: &Board, side: Side, pos: Pos, rank: Rank) -> Result<(), PlaceError> {
    if !Board::is_home_row(side, pos) {
        return Err(PlaceError::NotHomeRow);
    }
    match board.get(pos) {
        Square::Lake => return Err(PlaceError::SquareIsLake),
        Square::Occupied(_) => return Err(PlaceError::SquareOccupied),
        Square::Empty => {}
    }
    if count_on_board(board, side, rank) >= rank.count() {
        return Err(PlaceError::RankQuotaExceeded);
    }
    Ok(())
}

pub fn setup_complete(board: &Board, side: Side) -> bool {
    Rank::ALL
        .iter()
        .all(|&rank| count_on_board(board, side, rank) == rank.count())
}

/// Ranks `side` still has left to place, each repeated by its remaining
/// quota — e.g. two unplaced Bombs yield `[Bomb, Bomb]`.
pub fn remaining_ranks(board: &Board, side: Side) -> Vec<Rank> {
    Rank::ALL
        .iter()
        .flat_map(|&rank| {
            let missing = rank.count() - count_on_board(board, side, rank);
            std::iter::repeat(rank).take(missing as usize)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::super::piece::Piece;
    use super::*;

    fn board_with(pieces: &[(Pos, Side, Rank)]) -> Board {
        let mut b = Board::new();
        for &(pos, side, rank) in pieces {
            b.set(pos, Square::Occupied(Piece::new(side, rank)));
        }
        b
    }

    #[test]
    fn rejects_diagonal_and_multi_step() {
        let b = board_with(&[((6, 5), Side::Blue, Rank::Scout)]);
        assert_eq!(
            validate_move(&b, Side::Blue, (6, 5), (5, 4)),
            Err(MoveError::NotOrthogonalSingleStep)
        );
        assert_eq!(
            validate_move(&b, Side::Blue, (6, 5), (8, 5)),
            Err(MoveError::NotOrthogonalSingleStep)
        );
    }

    #[test]
    fn rejects_move_onto_lake() {
        let b = board_with(&[((6, 2), Side::Blue, Rank::Scout)]);
        // (5,2) is a lake cell
        assert_eq!(
            validate_move(&b, Side::Blue, (6, 2), (5, 2)),
            Err(MoveError::DestinationIsLake)
        );
    }

    #[test]
    fn rejects_static_piece_movement() {
        let b = board_with(&[((6, 5), Side::Blue, Rank::Bomb)]);
        assert_eq!(
            validate_move(&b, Side::Blue, (6, 5), (6, 6)),
            Err(MoveError::PieceIsStatic)
        );
    }

    #[test]
    fn rejects_capturing_own_piece() {
        let b = board_with(&[
            ((6, 5), Side::Blue, Rank::Scout),
            ((6, 6), Side::Blue, Rank::Miner),
        ]);
        assert_eq!(
            validate_move(&b, Side::Blue, (6, 5), (6, 6)),
            Err(MoveError::DestinationOccupiedByOwnPiece)
        );
    }

    #[test]
    fn allows_attacking_enemy_piece() {
        let b = board_with(&[
            ((6, 5), Side::Blue, Rank::Scout),
            ((6, 6), Side::Red, Rank::Miner),
        ]);
        assert_eq!(validate_move(&b, Side::Blue, (6, 5), (6, 6)), Ok(()));
    }

    #[test]
    fn combat_higher_rank_wins() {
        assert_eq!(
            resolve_combat(Rank::Marshal, Rank::Spy),
            CombatOutcome::AttackerWins
        );
        assert_eq!(
            resolve_combat(Rank::Spy, Rank::Marshal),
            CombatOutcome::DefenderWins
        );
    }

    #[test]
    fn combat_equal_rank_mutual_destruction() {
        assert_eq!(
            resolve_combat(Rank::Captain, Rank::Captain),
            CombatOutcome::BothDestroyed
        );
    }

    #[test]
    fn combat_bomb_always_wins_as_defender_in_v1() {
        assert_eq!(
            resolve_combat(Rank::Marshal, Rank::Bomb),
            CombatOutcome::DefenderWins
        );
    }

    #[test]
    fn combat_capturing_flag_ends_game() {
        assert_eq!(
            resolve_combat(Rank::Spy, Rank::Flag),
            CombatOutcome::FlagCaptured
        );
    }

    #[test]
    fn detects_stalemate() {
        // Single Blue Bomb (immobile) surrounded by own pieces / board edge -> no legal move.
        let b = board_with(&[
            ((9, 9), Side::Blue, Rank::Bomb),
            ((9, 8), Side::Blue, Rank::Flag),
            ((8, 9), Side::Blue, Rank::Flag),
        ]);
        assert!(!has_legal_move(&b, Side::Blue));
    }

    #[test]
    fn finds_legal_move_when_available() {
        let b = board_with(&[((6, 5), Side::Blue, Rank::Scout)]);
        assert!(has_legal_move(&b, Side::Blue));
    }

    #[test]
    fn placement_respects_home_rows_and_quota() {
        let mut b = Board::new();
        assert_eq!(
            validate_placement(&b, Side::Blue, (3, 5), Rank::Scout),
            Err(PlaceError::NotHomeRow)
        );
        assert_eq!(validate_placement(&b, Side::Blue, (9, 5), Rank::Flag), Ok(()));
        b.set((9, 5), Square::Occupied(Piece::new(Side::Blue, Rank::Flag)));
        assert_eq!(
            validate_placement(&b, Side::Blue, (9, 5), Rank::Marshal),
            Err(PlaceError::SquareOccupied)
        );
        assert_eq!(
            validate_placement(&b, Side::Blue, (9, 6), Rank::Flag),
            Err(PlaceError::RankQuotaExceeded)
        );
    }
}
