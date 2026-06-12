# 3D Brett-Kipp-Feature — Design Spec

**Datum:** 2026-06-12  
**Status:** Genehmigt

## Überblick

Spieler können das Spielbrett per `Ctrl + Maus-Drag` dreidimensional kippen. Ab einem Kippwinkel von 30° werden Klicks gesperrt. Wenn das Brett gekippt ist, werden Figuren dreidimensional (extrudierter Block-Stil) dargestellt. Der Winkel bleibt eingefroren wenn Ctrl losgelassen wird.

---

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Kipp-Achse | Beide Achsen (X + Y), freie Rotation |
| Figuren-3D-Stil | Extrudiert (CSS box-shadow als Block-Seite) |
| Reset bei Ctrl-Loslassen | Eingefroren — Winkel bleibt |
| Scope | Synchron — beide Panels kippen gemeinsam |
| Klick-Schwellwert | √(rotX² + rotY²) > 30° |

---

## Architektur

### Neue Datei: `src/useTilt.ts`

Hook, der den Tilt-State verwaltet und globale Window-Events behandelt.

**Konstanten:**
```typescript
const SENSITIVITY = 0.3; // °/px Mausbewegung
const MAX_ANGLE   = 45;  // Clamp für rotX und rotY
const LOCK_ANGLE  = 30;  // Euklidischer Winkel für isTiltLocked
```

**Rückgabewert:**
```typescript
interface TiltResult {
  rotX: number;        // Aktuelle X-Rotation in Grad
  rotY: number;        // Aktuelle Y-Rotation in Grad
  isActive: boolean;   // rotX !== 0 || rotY !== 0
  isTiltLocked: boolean; // √(rotX² + rotY²) > LOCK_ANGLE
}
```

**Verhalten:**
- `mousedown`: Drag starten wenn `e.ctrlKey === true`
- `mousemove`: Delta × SENSITIVITY auf rotX/rotY addieren, clamp auf ±MAX_ANGLE
- `mouseup` + `keyup[Control]`: Drag stoppen (State bleibt — kein Reset)
- Cleanup: alle Listener in useEffect-Cleanup entfernen

---

### Geändert: `src/App.tsx`

```tsx
const { rotX, rotY, isActive, isTiltLocked } = useTilt();

const tiltClasses = [
  'tilt-root',
  isActive ? 'board-tilt-active' : '',
  isTiltLocked ? 'board-tilt-locked' : '',
].join(' ').trim();

<div
  className={tiltClasses}
  style={{ '--tilt-x': `${rotX}deg`, '--tilt-y': `${rotY}deg` } as CSSProperties}
>
  <BoardPanel ... isTiltLocked={isTiltLocked} />
  <BoardPanel ... isTiltLocked={isTiltLocked} />
</div>
```

Der `tilt-root`-Div umschließt beide BoardPanels. CSS-Variablen `--tilt-x` und `--tilt-y` propagieren automatisch an beide `.board-grid`-Elemente.

---

### Geändert: `src/components/BoardPanel.tsx`

Neues Prop `isTiltLocked: boolean` in der Props-Interface.

Guard in `handleClick`:
```typescript
function handleClick(pos: Position, square: SquareView) {
  if (isTiltLocked) return;
  // ... rest unverändert
}
```

---

### Geändert: `src/App.css`

#### Brett-Perspektive
```css
.tilt-root {
  perspective: 1200px;
}

.board-grid {
  transform: rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg));
  transform-style: preserve-3d;
  /* kein transition — eingefroren, kein Snap-Back */
}
```

#### Figuren-Extrusion (nur bei aktivem Tilt)
```css
.board-tilt-active .piece--blue.piece--revealed {
  box-shadow: 0 6px 0 #1d4ed8, 0 10px 16px rgba(0, 0, 0, 0.6);
}
.board-tilt-active .piece--red.piece--revealed {
  box-shadow: 0 6px 0 #991b1b, 0 10px 16px rgba(0, 0, 0, 0.6);
}
.board-tilt-active .piece--blue.piece--hidden {
  box-shadow: 0 6px 0 #1e3a8a, 0 10px 16px rgba(0, 0, 0, 0.6);
}
.board-tilt-active .piece--red.piece--hidden {
  box-shadow: 0 6px 0 #7f1d1d, 0 10px 16px rgba(0, 0, 0, 0.6);
}
```

#### Tilt-Lock Feedback
```css
.board-tilt-locked .square--clickable {
  cursor: not-allowed;
  pointer-events: none;
}
```

---

## Verifikation

1. `pnpm tauri dev` starten
2. Ctrl gedrückt halten + Maus ziehen → Brett kippt in beide Achsen
3. Figuren zeigen box-shadow Extrusion sobald Brett nicht flach ist
4. Winkel über 30° ziehen → Klicks auf Felder haben keine Wirkung, Cursor wechselt
5. Ctrl loslassen → Winkel bleibt eingefroren
6. Erneut Ctrl + Drag → Winkel verändert sich vom eingefrorenen Stand
7. Beide Panels (Blau + Rot) kippen synchron

---

## Nicht in Scope

- Reset-Button / Taste zum Zurücksetzen auf 0°
- Tilt-Anzeige (Gradangabe im UI)
- Animiertes Einfedern
- Tilt während Handoff-Popup
