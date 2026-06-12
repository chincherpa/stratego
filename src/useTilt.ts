import { useEffect, useRef, useState } from "react";

const SENSITIVITY = 0.3; // degrees per pixel
const MAX_ANGLE = 45;    // clamp for each axis
const LOCK_ANGLE = 30;   // √(rotX²+rotY²) threshold

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface TiltState {
  rotX: number;
  rotY: number;
  isActive: boolean;
  isTiltLocked: boolean;
}

export function useTilt(): TiltState {
  const [rotX, setRotX] = useState(0);
  const [rotY, setRotY] = useState(0);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      dragging.current = true;
      lastPos.current = { x: e.clientX, y: e.clientY };
    }

    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      setRotX((prev) => clamp(prev + dy * SENSITIVITY, -MAX_ANGLE, MAX_ANGLE));
      setRotY((prev) => clamp(prev + dx * SENSITIVITY, -MAX_ANGLE, MAX_ANGLE));
    }

    function onMouseUp() {
      dragging.current = false;
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Control") dragging.current = false;
    }

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const isActive = rotX !== 0 || rotY !== 0;
  const isTiltLocked = Math.sqrt(rotX ** 2 + rotY ** 2) > LOCK_ANGLE;

  return { rotX, rotY, isActive, isTiltLocked };
}
