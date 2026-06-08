use serde::{Deserialize, Serialize};

use super::piece::{Piece, Side};

pub const SIZE: usize = 10;

/// (row, col), 0-indexed. Row 0..=3 = Red home rows, row 6..=9 = Blue home rows,
/// rows 4..=5 hold the two lakes (standard Stratego layout).
pub type Pos = (usize, usize);

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum Square {
    Empty,
    Lake,
    Occupied(Piece),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Board {
    pub squares: [[Square; SIZE]; SIZE],
}

const LAKE_CELLS: [(usize, usize); 8] = [
    (4, 2),
    (4, 3),
    (5, 2),
    (5, 3),
    (4, 6),
    (4, 7),
    (5, 6),
    (5, 7),
];

impl Board {
    pub fn new() -> Self {
        let mut squares = [[Square::Empty; SIZE]; SIZE];
        for &(r, c) in &LAKE_CELLS {
            squares[r][c] = Square::Lake;
        }
        Board { squares }
    }

    pub fn get(&self, pos: Pos) -> Square {
        self.squares[pos.0][pos.1]
    }

    pub fn set(&mut self, pos: Pos, square: Square) {
        self.squares[pos.0][pos.1] = square;
    }

    pub fn in_bounds(row: isize, col: isize) -> bool {
        row >= 0 && row < SIZE as isize && col >= 0 && col < SIZE as isize
    }

    /// Home rows where a side may place pieces during setup.
    pub fn home_rows(side: Side) -> std::ops::RangeInclusive<usize> {
        match side {
            Side::Red => 0..=3,
            Side::Blue => 6..=9,
        }
    }

    pub fn is_home_row(side: Side, pos: Pos) -> bool {
        Self::home_rows(side).contains(&pos.0)
    }

    pub fn orthogonal_neighbors(pos: Pos) -> Vec<Pos> {
        let (r, c) = (pos.0 as isize, pos.1 as isize);
        [(r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)]
            .into_iter()
            .filter(|&(nr, nc)| Self::in_bounds(nr, nc))
            .map(|(nr, nc)| (nr as usize, nc as usize))
            .collect()
    }
}
