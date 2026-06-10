import { useEffect, useState } from "react";
import { api } from "./api";
import { BoardPanel } from "./components/BoardPanel";
import { HandoffModal } from "./components/HandoffModal";
import { SettingsPanel } from "./components/SettingsPanel";
import { WinnerScreen } from "./components/WinnerScreen";
import { useGame } from "./useGame";
import { useSettings } from "./useSettings";
import "./App.css";

function App() {
  const { status, blueView, redView, activeCombat } = useGame();
  const { settings, setHandoffPopupEnabled, setPermanentRevealEnabled } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // When the handover popup is disabled, skip the confirmation step entirely —
  // confirm the instant a handoff becomes pending, same as if the player had
  // clicked through immediately (cursor still jumps via the backend command).
  useEffect(() => {
    if (settings.handoffPopupEnabled || !status?.pending_handoff) return;
    api.confirmHandoff();
  }, [settings.handoffPopupEnabled, status?.pending_handoff]);

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
        handoffPopupEnabled={settings.handoffPopupEnabled}
        permanentRevealEnabled={settings.permanentRevealEnabled}
        onToggleHandoffPopup={setHandoffPopupEnabled}
        onTogglePermanentReveal={setPermanentRevealEnabled}
        onNewGame={() => {
          api.newGame();
          setSettingsOpen(false);
        }}
      />
      <div className="app__panels">
        <BoardPanel
          side="Blue"
          view={blueView}
          status={status}
          combat={activeCombat}
          permanentRevealEnabled={settings.permanentRevealEnabled}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className="app__divider" title="Hier den Pappkarton aufkleben" />
        <BoardPanel
          side="Red"
          view={redView}
          status={status}
          combat={activeCombat}
          permanentRevealEnabled={settings.permanentRevealEnabled}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>
      {/* Held back until the clash banner finishes — otherwise the popup,
          which appears the instant `pending_handoff` is set, covers it.
          Also gated on the setting: when disabled, the effect above
          auto-confirms instead of ever showing this modal. */}
      {!activeCombat && settings.handoffPopupEnabled && <HandoffModal status={status} />}
      <WinnerScreen status={status} />
    </main>
  );
}

export default App;
