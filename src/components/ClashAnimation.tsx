import type { CSSProperties } from "react";
import { RANK_LABEL, RANK_NAME, type CombatResult, type Rank, type Side } from "../types";

type Props = {
  result: CombatResult;
  /** Unit vector of the attack, in this panel's *display* orientation
   * (Red's board is rotated 180°). The attacker card charges in along it,
   * the defender is knocked back along it. */
  chargeX: number;
  chargeY: number;
  /** How far to shift the card stack, in square widths, so a clash on an
   * edge square isn't half cut off by the panel border. The impact effects
   * stay on the square either way. */
  nudgeX: number;
  nudgeY: number;
};

/** Sparks fly out of the impact point; angles are spread by hand so the
 * burst looks struck rather than evenly radial. */
const SPARK_ANGLES = [8, 52, 96, 140, 184, 228, 272, 316, 34, 210];

function outcomeIcon(result: CombatResult): string {
  switch (result.outcome) {
    case "FlagCaptured":
      return "🚩";
    case "BothDestroyed":
      return "💥";
    default:
      return result.defender_rank === "Bomb" || result.attacker_rank === "Bomb" ? "💥" : "⚔️";
  }
}

/** One line of German colour commentary. The three iconic Stratego upsets
 * (Spy→Marshal, Miner→Bomb, Bomb defends) get their own wording. */
function verdictText(result: CombatResult): string {
  const attacker = RANK_NAME[result.attacker_rank];
  const defender = RANK_NAME[result.defender_rank];
  switch (result.outcome) {
    case "FlagCaptured":
      return `${attacker} erobert die Fahne!`;
    case "BothDestroyed":
      return `${attacker} und ${defender} fallen beide`;
    case "AttackerWins":
      if (result.attacker_rank === "Spy" && result.defender_rank === "Marshal") {
        return "Spion meuchelt den Marschall!";
      }
      if (result.attacker_rank === "Miner" && result.defender_rank === "Bomb") {
        return "Mineur entschärft die Bombe!";
      }
      return `${attacker} schlägt ${defender}`;
    case "DefenderWins":
      if (result.defender_rank === "Bomb") return `Bombe zerreißt den ${attacker}!`;
      return `${defender} wehrt den ${attacker} ab`;
  }
}

type FighterProps = {
  owner: Side;
  rank: Rank;
  role: "attacker" | "defender";
  lost: boolean;
};

/** A combatant card: charges in, takes the hit, then either flares up in
 * gold (survivor) or cracks apart into shards (loser). */
function Fighter({ owner, rank, role, lost }: FighterProps) {
  return (
    <span
      className={[
        "clash__fighter",
        `clash__fighter--${role}`,
        `clash__fighter--${owner.toLowerCase()}`,
        lost ? "clash__fighter--lost" : "clash__fighter--won",
      ].join(" ")}
      title={RANK_NAME[rank]}
    >
      <span className="clash__fighter-label">{RANK_LABEL[rank]}</span>
      {lost && (
        <span className="clash__shards" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="clash__shard" style={{ "--shard": i } as CSSProperties} />
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * The Zweikampf animation, anchored on the contested square and rendered on
 * both panels at once. Every layer runs on the same `--clash-ms` timeline
 * (set by App from the player's setting), so the whole sequence — charge,
 * impact flash, shockwaves, sparks, shatter, verdict — stretches or
 * compresses as one.
 *
 * It doubles as the clash *report*: the destroyed piece never lands on the
 * board, so these two cards are the only place either player gets to see it.
 */
export function ClashAnimation({ result, chargeX, chargeY, nudgeX, nudgeY }: Props) {
  const attackerLost = result.outcome === "DefenderWins" || result.outcome === "BothDestroyed";
  const defenderLost =
    result.outcome === "AttackerWins" ||
    result.outcome === "BothDestroyed" ||
    result.outcome === "FlagCaptured";

  return (
    <div
      className="clash"
      role="status"
      aria-label={`Zweikampf: ${verdictText(result)}`}
      style={
        {
          "--charge-x": chargeX,
          "--charge-y": chargeY,
          "--nudge-x": nudgeX,
          "--nudge-y": nudgeY,
        } as CSSProperties
      }
    >
      <span className="clash__flash" aria-hidden="true" />
      <span className="clash__ring clash__ring--outer" aria-hidden="true" />
      <span className="clash__ring clash__ring--inner" aria-hidden="true" />
      <span className="clash__sparks" aria-hidden="true">
        {SPARK_ANGLES.map((angle, i) => (
          <span key={i} className="clash__spark" style={{ "--angle": `${angle}deg` } as CSSProperties} />
        ))}
      </span>
      <span className="clash__stack">
        <span className="clash__fighters">
          <Fighter owner={result.attacker_owner} rank={result.attacker_rank} role="attacker" lost={attackerLost} />
          <span className="clash__impact" aria-hidden="true">
            {outcomeIcon(result)}
          </span>
          <Fighter owner={result.defender_owner} rank={result.defender_rank} role="defender" lost={defenderLost} />
        </span>
        <span className="clash__verdict">{verdictText(result)}</span>
      </span>
    </div>
  );
}
