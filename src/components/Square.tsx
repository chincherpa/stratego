import { ClashAnimation } from "./ClashAnimation";
import { Piece } from "./Piece";
import type { CombatResult, SquareView, Side } from "../types";

type Props = {
  square: SquareView;
  /** The side this panel belongs to — determines whether a piece on this square is "ours". */
  panelSide: Side;
  selected: boolean;
  legalTarget: boolean;
  /** From/to square of the most recent move — public info, shown on both panels. */
  lastFrom?: boolean;
  lastTo?: boolean;
  clickable: boolean;
  /** Setup phase only: cursor sits on this square but it's outside the
   * placing side's home rows — show a red X so the player knows a piece
   * can't go here. */
  notAllowed?: boolean;
  /** Set only on the square where a clash just resolved, for the brief animation window. */
  combat?: CombatResult | null;
  /** Attack direction in this panel's display orientation — the clash
   * animation charges the attacker card in along it. */
  chargeX?: number;
  chargeY?: number;
  /** Inward shift of the clash card stack, in square widths (edge squares). */
  nudgeX?: number;
  nudgeY?: number;
  /** Hovering the matching entry in the Zweikampf history lights this
   * square up, so the player can see where a past clash happened. */
  logHighlight?: boolean;
  /** When false, enemy pieces that were revealed by past combat are masked
   * back to the hidden card-back look — except the square currently showing
   * the combat banner, which always reveals both ranks regardless. */
  permanentRevealEnabled: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

export function Square({
  square,
  panelSide,
  selected,
  legalTarget,
  lastFrom,
  lastTo,
  clickable,
  notAllowed,
  combat,
  chargeX = 0,
  chargeY = 0,
  nudgeX = 0,
  nudgeY = 0,
  logHighlight,
  permanentRevealEnabled,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  const classes = ["square"];
  if (square.kind === "Lake") classes.push("square--lake");
  if (square.kind === "Empty") classes.push("square--empty");
  if (square.kind === "Piece") classes.push("square--piece");
  if (selected) classes.push("square--selected");
  if (legalTarget) classes.push("square--legal-target");
  if (lastFrom) classes.push("square--last-from");
  if (lastTo) classes.push("square--last-to");
  if (clickable) classes.push("square--clickable");
  if (notAllowed) classes.push("square--not-allowed");
  if (logHighlight) classes.push("square--log-highlight");
  if (combat) classes.push("square--clash");

  const maskRevealed =
    !permanentRevealEnabled &&
    square.kind === "Piece" &&
    square.owner !== panelSide &&
    square.rank !== null &&
    !combat;

  return (
    <div
      className={classes.join(" ")}
      onClick={clickable ? onClick : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {square.kind === "Piece" && (
        <Piece owner={square.owner} rank={square.rank} own={square.owner === panelSide} forceHidden={maskRevealed} />
      )}
      {combat && (
        <ClashAnimation
          result={combat}
          chargeX={chargeX}
          chargeY={chargeY}
          nudgeX={nudgeX}
          nudgeY={nudgeY}
        />
      )}
    </div>
  );
}
