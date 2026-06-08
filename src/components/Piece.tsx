import { RANK_LABEL, type Rank, type Side } from "../types";

type Props = {
  owner: Side;
  rank: Rank | null;
  /** True when this square belongs to the panel's own side. */
  own: boolean;
  /** Render as a hidden card-back even though `rank` is known — used to mask
   * permanently-revealed enemy pieces when that display setting is off. */
  forceHidden?: boolean;
};

export function Piece({ owner, rank, own, forceHidden }: Props) {
  if (rank === null || forceHidden) {
    return (
      <div className={`piece piece--hidden piece--${owner.toLowerCase()}`} title="Verdeckte gegnerische Figur" />
    );
  }
  return (
    <div
      className={`piece piece--revealed piece--${owner.toLowerCase()} ${own ? "piece--own" : "piece--enemy"}`}
      title={rank}
    >
      {RANK_LABEL[rank]}
    </div>
  );
}
