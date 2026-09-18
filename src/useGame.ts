import { useCallback, useEffect, useRef, useState } from "react";
import { api, onCombatResolved, onStateChanged } from "./api";
import type { BoardView, CombatResult, StatusDto } from "./types";

export type GameSnapshot = {
  status: StatusDto | null;
  blueView: BoardView | null;
  redView: BoardView | null;
};

/**
 * Single source of truth on the frontend: pulls status + both perspective
 * views from the backend and refreshes whenever it emits "state-changed".
 * Both panels are always rendered, so both views are always fetched —
 * the backend is what enforces who is allowed to see what.
 *
 * `combatAnimationMs` is how long a resolved clash stays in `activeCombat`
 * (0 = animation switched off, nothing is ever set). App holds the handoff
 * popup back for exactly that window — otherwise the popup, which appears
 * the instant `pending_handoff` is set, would cover the animation. The CSS
 * gets the same number as the `--clash-ms` custom property, so there is no
 * constant to keep in sync by hand.
 */
export function useGame(combatAnimationMs: number) {
  const [snapshot, setSnapshot] = useState<GameSnapshot>({
    status: null,
    blueView: null,
    redView: null,
  });
  const [activeCombat, setActiveCombat] = useState<CombatResult | null>(null);
  // Read inside the (once-registered) event listener, so changing the
  // setting mid-game takes effect without re-subscribing.
  const durationRef = useRef(combatAnimationMs);
  durationRef.current = combatAnimationMs;

  const refresh = useCallback(async () => {
    const [status, blueView, redView] = await Promise.all([
      api.getStatus(),
      api.getBoardView("Blue"),
      api.getBoardView("Red"),
    ]);
    setSnapshot({ status, blueView, redView });
  }, []);

  useEffect(() => {
    refresh();
    let unlistenState: (() => void) | undefined;
    let unlistenCombat: (() => void) | undefined;
    let bannerTimer: ReturnType<typeof setTimeout> | undefined;

    onStateChanged(refresh).then((fn) => {
      unlistenState = fn;
    });
    onCombatResolved((result) => {
      const duration = durationRef.current;
      if (bannerTimer) clearTimeout(bannerTimer);
      if (duration <= 0) {
        setActiveCombat(null);
        return;
      }
      setActiveCombat(result);
      bannerTimer = setTimeout(() => setActiveCombat(null), duration);
    }).then((fn) => {
      unlistenCombat = fn;
    });

    return () => {
      unlistenState?.();
      unlistenCombat?.();
      if (bannerTimer) clearTimeout(bannerTimer);
    };
  }, [refresh]);

  return { ...snapshot, activeCombat, refresh };
}
