import { type CSSProperties, useEffect, useState } from "react";
import { api } from "./api";
import { BoardPanel } from "./components/BoardPanel";
import { HandoffModal } from "./components/HandoffModal";
import { SettingsPanel } from "./components/SettingsPanel";
import { WinnerScreen } from "./components/WinnerScreen";
import { useGame } from "./useGame";
import { useSettings } from "./useSettings";
import { useTilt } from "./useTilt";
import "./App.css";

function App() {
  const { settings, updateSettings } = useSettings();
  const combatAnimationMs = Math.round(settings.combatAnimationSeconds * 1000);
  const handoffDelayMs = Math.round(settings.handoffDelaySeconds * 1000);
  const { status, blueView, redView, activeCombat } = useGame(combatAnimationMs);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { rotX, rotY, isActive, isTiltLocked } = useTilt();

  // When the handover popup is disabled, skip the confirmation step entirely —
  // confirm the instant a handoff becomes pending, same as if the player had
  // clicked through immediately (cursor still jumps via the backend command).
  // `activeCombat` still gates it, so a clash animation is never cut short.
  useEffect(() => {
    if (settings.handoffPopupEnabled || !status?.pending_handoff || activeCombat) return;
    api.confirmHandoff();
  }, [settings.handoffPopupEnabled, status?.pending_handoff, activeCombat]);

  if (!status || !blueView || !redView) {
    return (
      <main className="app app--loading">
        <p>Lade Spiel …</p>
      </main>
    );
  }

  return (
    <main className="app">
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={updateSettings}
        onNewGame={() => {
          api.newGame();
          setSettingsOpen(false);
        }}
      />
      <div
        className={[
          "app__panels",
          isActive ? "board-tilt-active" : "",
          isTiltLocked ? "board-tilt-locked" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          {
            "--tilt-x": `${rotX}deg`,
            "--tilt-y": `${rotY}deg`,
            // Single source of truth for the clash timeline: every layer of
            // the animation (and the board shake) runs off this value, so
            // the setting stretches the whole sequence as one.
            "--clash-ms": `${combatAnimationMs}ms`,
          } as CSSProperties
        }
      >
        <BoardPanel
          side="Blue"
          view={blueView}
          status={status}
          combat={activeCombat}
          permanentRevealEnabled={settings.permanentRevealEnabled}
          onOpenSettings={() => setSettingsOpen(true)}
          isTiltLocked={isTiltLocked}
        />
        <div className="app__divider" title="Hier den Pappkarton aufkleben" />
        <BoardPanel
          side="Red"
          view={redView}
          status={status}
          combat={activeCombat}
          permanentRevealEnabled={settings.permanentRevealEnabled}
          onOpenSettings={() => setSettingsOpen(true)}
          isTiltLocked={isTiltLocked}
        />
      </div>
      {/* Held back until the clash animation finishes — otherwise the popup,
          which appears the instant `pending_handoff` is set, covers it.
          Also gated on the setting: when disabled, the effect above
          auto-confirms instead of ever showing this modal. */}
      {!activeCombat && settings.handoffPopupEnabled && (
        <HandoffModal status={status} autoConfirmMs={handoffDelayMs} />
      )}
      <WinnerScreen status={status} />
    </main>
  );
}

export default App;
