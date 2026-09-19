import { RANK_LABEL, RANK_NAME, type CombatResult, type Pos, type Side } from "../types";

type Props = {
  /** The panel's own side — everything is phrased from its point of view. */
  side: Side;
  entries: CombatResult[];
  /** Hovering an entry lights up the square it happened on, on this panel's
   * board (so nobody has to decode coordinates on a mirrored board). */
  onHoverSquare: (pos: Pos | null) => void;
};

/** Clash from this panel's point of view. "Tausch" = both pieces died. */
type Verdict = "win" | "loss" | "trade";

const VERDICT_LABEL: Record<Verdict, string> = {
  win: "Gewonnen",
  loss: "Verloren",
  trade: "Tausch",
};

const COLUMN_LETTERS = "ABCDEFGHIJ";

/** Canonical square name, identical on both panels so the two players can
 * actually talk about the same square across the divider. */
function squareName(entry: CombatResult): string {
  return `${COLUMN_LETTERS[entry.col]}${entry.row + 1}`;
}

function verdictFor(entry: CombatResult, side: Side): Verdict {
  switch (entry.outcome) {
    case "BothDestroyed":
      return "trade";
    case "AttackerWins":
    case "FlagCaptured":
      return entry.attacker_owner === side ? "win" : "loss";
    case "DefenderWins":
      return entry.defender_owner === side ? "win" : "loss";
  }
}

/**
 * Scrollable history of every Zweikampf of the running game, newest first,
 * rendered once per panel from that player's perspective ("Euer Mineur" vs.
 * "Gegner"). The data itself is public — combat reveals both ranks to both
 * sides — so the two lists hold the same clashes, only the wording and the
 * win/loss colouring differ.
 */
export function CombatLog({ side, entries, onHoverSquare }: Props) {
  const newestFirst = [...entries].reverse();
  const won = entries.filter((entry) => verdictFor(entry, side) === "win").length;
  const lost = entries.filter((entry) => verdictFor(entry, side) === "loss").length;

  return (
    <section className="combat-log" onMouseLeave={() => onHoverSquare(null)}>
      <header className="combat-log__header">
        <h3>Zweikämpfe</h3>
        {entries.length > 0 && (
          <span className="combat-log__tally">
            {won} gewonnen · {lost} verloren · {entries.length - won - lost} Tausch
          </span>
        )}
      </header>

      <div className="combat-log__scroll">
        {newestFirst.length === 0 && <p className="combat-log__empty">Noch kein Zweikampf.</p>}
        {newestFirst.map((entry) => {
          const verdict = verdictFor(entry, side);
          const attackerIsOurs = entry.attacker_owner === side;
          return (
            <div
              key={entry.index}
              className={`combat-log__row combat-log__row--${verdict}`}
              onMouseEnter={() => onHoverSquare({ row: entry.row, col: entry.col })}
              title={`Zweikampf #${entry.index} auf ${squareName(entry)}`}
            >
              <span className="combat-log__move">{entry.move_number}.</span>
              <span className="combat-log__fighters">
                <span
                  className={`combat-log__chip combat-log__chip--${entry.attacker_owner.toLowerCase()} ${
                    attackerIsOurs ? "combat-log__chip--own" : "combat-log__chip--enemy"
                  }`}
                >
                  {RANK_LABEL[entry.attacker_rank]}
                </span>
                <span className="combat-log__arrow" aria-label="greift an">
                  ⚔
                </span>
                <span
                  className={`combat-log__chip combat-log__chip--${entry.defender_owner.toLowerCase()} ${
                    attackerIsOurs ? "combat-log__chip--enemy" : "combat-log__chip--own"
                  }`}
                >
                  {RANK_LABEL[entry.defender_rank]}
                </span>
              </span>
              <span className="combat-log__text">
                {attackerIsOurs ? "Euer " : "Gegner: "}
                {RANK_NAME[entry.attacker_rank]} → {RANK_NAME[entry.defender_rank]}
              </span>
              <span className="combat-log__square">{squareName(entry)}</span>
              <span className={`combat-log__verdict combat-log__verdict--${verdict}`}>
                {VERDICT_LABEL[verdict]}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
