import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, KeyboardEvent } from "react";

const STORAGE_KEY = "smartqueue:assistant-position:v1";
const SIZE = 56;
const GAP = 20;
type Position = { x: number; y: number };

function clamp(position: Position): Position {
  return {
    x: Math.max(GAP, Math.min(position.x, window.innerWidth - SIZE - GAP)),
    y: Math.max(GAP, Math.min(position.y, window.innerHeight - SIZE - GAP)),
  };
}

function defaultPosition(): Position {
  return clamp({ x: window.innerWidth - SIZE - GAP, y: window.innerHeight - SIZE - GAP - 8 });
}

function initialPosition(): Position {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return clamp(saved);
  } catch { /* Storage may be blocked; dragging still works in memory. */ }
  return defaultPosition();
}

function persist(position: Position) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(position)); } catch { /* Optional preference. */ }
}

export function useFloatingPosition() {
  const [position, setPosition] = useState(initialPosition);
  const [dragging, setDragging] = useState(false);
  const positionRef = useRef(position);
  const gesture = useRef<{ id: number; startX: number; startY: number; origin: Position; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  function move(next: Position) {
    const bounded = clamp(next);
    positionRef.current = bounded;
    setPosition(bounded);
    return bounded;
  }

  useEffect(() => {
    const resize = () => {
      const next = clamp(positionRef.current);
      positionRef.current = next;
      setPosition(next);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick.current = false;
    gesture.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, origin: positionRef.current, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < 8) return;
    current.moved = true;
    setDragging(true);
    move({ x: current.origin.x + dx, y: current.origin.y + dy });
  }

  function finish(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    suppressClick.current = current.moved || event.type === "pointercancel";
    gesture.current = null;
    setDragging(false);
    persist(positionRef.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const offsets: Record<string, Position> = {
      ArrowLeft: { x: -24, y: 0 }, ArrowRight: { x: 24, y: 0 },
      ArrowUp: { x: 0, y: -24 }, ArrowDown: { x: 0, y: 24 },
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    persist(move({ x: positionRef.current.x + offset.x, y: positionRef.current.y + offset.y }));
  }

  return {
    position, dragging,
    handlers: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish, onKeyDown },
    consumeDragClick: () => {
      const suppressed = suppressClick.current;
      suppressClick.current = false;
      return suppressed;
    },
    dock: (side: "left" | "right") => persist(move({ ...defaultPosition(), x: side === "left" ? GAP : defaultPosition().x })),
  };
}
