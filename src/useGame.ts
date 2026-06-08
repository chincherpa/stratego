import { useCallback, useEffect, useState } from "react";
import { api, onCombatResolved, onStateChanged } from "./api";
import type { BoardView, CombatResult, StatusDto } from "./types";

export type GameSnapshot = {
  status: StatusDto | null;
  blueView: BoardView | null;
  redView: BoardView | null;
};

/** How long the clash banner stays up. Lifted up here (rather than into
 * BoardPanel) so App can hold the handoff popup back until it's done —
 * otherwise the popup, which appears the instant `pending_handoff` is set,
 * covers the animation immediately. Must match `combat-banner-pop` in App.css. */
const COMBAT_BANNER_DURATION_MS = 1600;

/**
 * Single source of truth on the frontend: pulls status + both perspective
 * views from the backend and refreshes whenever it emits "state-changed".
 * Both panels are always rendered, so both views are always fetched —
 * the backend is what enforces who is allowed to see what.
 */
export function useGame() {
  const [snapshot, setSnapshot] = useState<GameSnapshot>({
    status: null,
    blueView: null,
    redView: null,
  });
  const [activeCombat, setActiveCombat] = useState<CombatResult | null>(null);

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
      setActiveCombat(result);
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => setActiveCombat(null), COMBAT_BANNER_DURATION_MS);
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
