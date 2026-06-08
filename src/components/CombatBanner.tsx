import { RANK_LABEL, type CombatOutcome, type CombatResult } from "../types";

type Props = {
  result: CombatResult;
};

const OUTCOME_ICON: Record<CombatOutcome, string> = {
  AttackerWins: "⚔️",
  DefenderWins: "⚔️",
  BothDestroyed: "💢",
  FlagCaptured: "🚩",
};

/** Floating clash report over the contested square: shows both ranks (the
 * destroyed piece never lands on the board, so this is the only place either
 * player sees it) plus a shatter mark over whoever lost. */
export function CombatBanner({ result }: Props) {
  const attackerLost = result.outcome === "DefenderWins" || result.outcome === "BothDestroyed";
  const defenderLost =
    result.outcome === "AttackerWins" || result.outcome === "BothDestroyed" || result.outcome === "FlagCaptured";

  return (
    <div className="combat-banner" role="status" aria-label="Kampf">
      <span
        className={`combat-banner__chip combat-banner__chip--${result.attacker_owner.toLowerCase()} ${
          attackerLost ? "combat-banner__chip--destroyed" : "combat-banner__chip--victor"
        }`}
      >
        {RANK_LABEL[result.attacker_rank]}
      </span>
      <span className="combat-banner__icon">{OUTCOME_ICON[result.outcome]}</span>
      <span
        className={`combat-banner__chip combat-banner__chip--${result.defender_owner.toLowerCase()} ${
          defenderLost ? "combat-banner__chip--destroyed" : "combat-banner__chip--victor"
        }`}
      >
        {RANK_LABEL[result.defender_rank]}
      </span>
    </div>
  );
}
