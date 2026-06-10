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
