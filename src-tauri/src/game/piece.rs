use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum Side {
    Blue,
    Red,
}

impl Side {
    pub fn other(self) -> Side {
        match self {
            Side::Blue => Side::Red,
            Side::Red => Side::Blue,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum Rank {
    Marshal,
    General,
    Colonel,
    Major,
    Captain,
    Lieutenant,
    Sergeant,
    Miner,
    Scout,
    Spy,
    Bomb,
    Flag,
}

impl Rank {
    /// Baseline combat strength: higher wins on a plain comparison. Bomb sits
    /// above every attacker (only a Miner defuses it) and Flag ends the game
    /// on capture — both exceptions, plus the Spy-vs-Marshal assassination,
    /// are special-cased in [`resolve_combat`](super::rules::resolve_combat)
    /// rather than expressed through these numbers.
    pub fn strength(self) -> u8 {
        use Rank::*;
        match self {
            Marshal => 10,
            General => 9,
            Colonel => 8,
            Major => 7,
            Captain => 6,
            Lieutenant => 5,
            Sergeant => 4,
            Miner => 3,
            Scout => 2,
            Spy => 1,
            Bomb => 255,
            Flag => 0,
        }
    }

    /// Bombs and the Flag never move.
    pub fn is_static(self) -> bool {
        matches!(self, Rank::Bomb | Rank::Flag)
    }

    /// Standard Stratego piece count per side (40 total).
    pub fn count(self) -> u8 {
        use Rank::*;
        match self {
            Marshal => 1,
            General => 1,
            Colonel => 2,
            Major => 3,
            Captain => 4,
            Lieutenant => 4,
            Sergeant => 4,
            Miner => 5,
            Scout => 8,
            Spy => 1,
            Bomb => 6,
            Flag => 1,
        }
    }

    pub const ALL: [Rank; 12] = [
        Rank::Marshal,
        Rank::General,
        Rank::Colonel,
        Rank::Major,
        Rank::Captain,
        Rank::Lieutenant,
        Rank::Sergeant,
        Rank::Miner,
        Rank::Scout,
        Rank::Spy,
        Rank::Bomb,
        Rank::Flag,
    ];
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct Piece {
    pub owner: Side,
    pub rank: Rank,
    pub revealed: bool,
}

impl Piece {
    pub fn new(owner: Side, rank: Rank) -> Self {
        Piece {
            owner,
            rank,
            revealed: false,
        }
    }
}
