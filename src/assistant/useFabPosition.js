import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_ANCHOR, clampFabPosition } from './panelGeometry.js';
import { readViewport } from './useViewport.js';

// Posição do botão (arrastável). Sem valor salvo, vale o canto padrão do CSS.
const POS_KEY = 'elara-assistant-pos';
const DRAG_THRESHOLD = 6;
const NUDGE_STEP = 24;
const NUDGE_DELTAS = { ArrowLeft: [-NUDGE_STEP, 0], ArrowRight: [NUDGE_STEP, 0], ArrowUp: [0, -NUDGE_STEP], ArrowDown: [0, NUDGE_STEP] };

const readStoredPosition = () => {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY));
    return p && Number.isFinite(p.right) && Number.isFinite(p.bottom) ? clampFabPosition(p, readViewport()) : null;
  } catch { return null; }
};
const storePosition = p => { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* sem storage: vale só nesta sessão */ } };

// Arrastar: o botão (sempre) e o topo do chat (em telas largas) movem o assistente. Um toque sem mover continua abrindo/fechando.
export function useFabPosition(vp) {
  const fabRef = useRef(null);
  const [pos, setPos] = useState(readStoredPosition);
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  const justDragged = useRef(false);

  // Janela menor: o botão não pode ficar para fora dela.
  useEffect(() => { setPos(p => (p ? clampFabPosition(p, vp) : p)); }, [vp]);

  const currentAnchor = () => {
    if (pos) return pos;
    const rect = fabRef.current?.getBoundingClientRect();
    const view = readViewport();
    return rect ? { right: view.w - rect.right, bottom: view.h - rect.bottom } : DEFAULT_ANCHOR;
  };

  const beginDrag = event => {
    if (event.button > 0) return;
    if (event.currentTarget !== fabRef.current && event.target.closest('button, a, input')) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: currentAnchor(), moved: false, last: null };
    justDragged.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = event => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x, dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) { d.moved = true; setDragging(true); }
    d.last = clampFabPosition({ right: d.start.right - dx, bottom: d.start.bottom - dy }, readViewport());
    setPos(d.last);
  };
  const endDrag = event => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    justDragged.current = true; // o "click" que vem logo depois do arrasto não deve abrir nem fechar o chat
    setDragging(false);
    if (d.last) storePosition(d.last);
  };
  const dragProps = { onPointerDown: beginDrag, onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag };

  // Teclado: Shift + setas movem o botão.
  const nudge = event => {
    const delta = NUDGE_DELTAS[event.key];
    if (!event.shiftKey || !delta) return;
    event.preventDefault();
    const anchor = currentAnchor();
    const next = clampFabPosition({ right: anchor.right - delta[0], bottom: anchor.bottom - delta[1] }, readViewport());
    setPos(next);
    storePosition(next);
  };

  // O "click" que vem logo depois de um arrasto é descartado (uma única vez).
  const consumeDragClick = useCallback(() => {
    const wasDrag = justDragged.current;
    justDragged.current = false;
    return wasDrag;
  }, []);

  return { fabRef, pos, dragging, dragProps, nudge, consumeDragClick };
}
