import { useCallback, useEffect, useRef, useState } from 'react';
import { addMark, removeMark, updateToken } from '../../lib/board.js';
import { snapInsideGrid } from '../../boardGrid.js';
import { centerViewOn, clamp, constrainView, fitWidth, keepIn, refitView, zoomAroundCenter, zoomAroundPoint } from './boardViewport.js';

const DRAG_START_PX = 5;
const DRAG_BROADCAST_MS = 60;

// Visao do tabuleiro (zoom, arraste do mapa, roda do mouse) e gestos de ponteiro: arrastar token, tocar, marcar.
// Nao conhece as regras dos tokens: recebe `canMove`/`onSelect` e grava so a posicao e as marcas.
// `gesture` e o ref do gesto em andamento, compartilhado com quem precisa saber se ha um (useStepMove).
export function useBoardGestures({ geometry, board, tokens, marks, tool, closed, isGm, me, canMove, movingToken, gesture, local, sendBroadcast, onSelect, setError }) {
  const { W, H, grid, gsize, tokenHalf } = geometry;
  const svgRef = useRef(null);
  const ratioRef = useRef(0.6); // altura/largura do SVG na tela
  const [view, setViewRaw] = useState(null);
  const lastSend = useRef(0);
  const wheelRef = useRef(null);

  const constrain = v => constrainView(v, W, H, ratioRef.current);
  const setView = next => setViewRaw(prev => constrain(typeof next === 'function' ? next(prev) : next));
  const frameMap = () => setView({ x: 0, y: 0, w: fitWidth(W, H, ratioRef.current) });
  useEffect(() => { frameMap(); }, [W, H, board?.id, board?.map_path]);

  // Acompanha o tamanho do SVG (janela redimensionada, painel aberto) e reajusta a visao.
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) return;
      const previousRatio = ratioRef.current;
      const ratio = b.height / b.width;
      if (Math.abs(previousRatio - ratio) < 0.001) return;
      ratioRef.current = ratio;
      setViewRaw(prev => (prev ? refitView(prev, W, H, previousRatio, ratio) : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [Boolean(board), W, H]);

  const toMap = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  // O onWheel do React e passivo (preventDefault e ignorado e a pagina rola); por isso o listener e nativo.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const handler = e => wheelRef.current?.(e);
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [Boolean(board)]);

  function onWheel(e) {
    e.preventDefault(); // impede a pagina de rolar enquanto o mouse esta sobre o tabuleiro
    const pt = toMap(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 0.88 : 1.14;
    setView(v => (v ? zoomAroundPoint(v, pt, factor, W, H, ratioRef.current) : v));
  }
  wheelRef.current = onWheel;
  const zoomBy = factor => view && setView(v => zoomAroundCenter(v, factor, W, H, ratioRef.current));
  const centerOn = token => {
    setView(previous => centerViewOn(previous, token, W, ratioRef.current));
    svgRef.current?.scrollIntoView({ block: 'nearest' });
  };

  function onPointerDown(e) {
    if (e.button !== 0 || !view || movingToken || gesture.current) return;
    const tokenEl = e.target.closest?.('[data-token]');
    const markEl = e.target.closest?.('[data-mark]');
    svgRef.current.setPointerCapture?.(e.pointerId);
    if (tokenEl) {
      const t = tokens.find(x => x.id === tokenEl.dataset.token);
      if (tool === 'move' && t && canMove(t)) {
        // Só um clique (sem arrastar) abre as informações do token; arrastar apenas move.
        const pt = toMap(e.clientX, e.clientY);
        local.beginDrag(t.id);
        gesture.current = { type: 'token', pointerId: e.pointerId, id: t.id, start: { x: t.x, y: t.y }, dx: t.x - pt.x, dy: t.y - pt.y, half: tokenHalf(t), moved: false, sx: e.clientX, sy: e.clientY };
        return;
      }
      if (tool === 'move' && t) { gesture.current = { type: 'tap', pointerId: e.pointerId, id: t.id }; return; }
      if (t) onSelect(t.id);
    }
    if (markEl && tool === 'marker') {
      const m = marks.find(x => x.id === markEl.dataset.mark);
      if (m && (m.created_by === me || isGm)) removeMark(m.id).then(() => local.setMarks(prev => prev.filter(x => x.id !== m.id))).catch(err => setError(err.message));
      return;
    }
    if (tool === 'marker' && !closed) {
      const pt = toMap(e.clientX, e.clientY);
      addMark(board, { kind: 'marker', x: clamp(pt.x, 0, W), y: clamp(pt.y, 0, H), color: isGm ? '#d9a21b' : '#2e9e5b' })
        .then(m => local.setMarks(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]))).catch(err => setError(err.message));
      return;
    }
    if (!tokenEl) onSelect(null);
    gesture.current = { type: 'pan', pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
  }
  function onPointerMove(e) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (g.type === 'tap') return;
    if (g.type === 'pan') {
      const scale = view.w / svgRef.current.getBoundingClientRect().width;
      setView(v => ({ ...v, x: g.vx - (e.clientX - g.sx) * scale, y: g.vy - (e.clientY - g.sy) * scale }));
      return;
    }
    // Pequenos tremores do mouse ou do dedo não contam como arrasto (continua sendo um clique).
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < DRAG_START_PX) return;
    const pt = toMap(e.clientX, e.clientY);
    const x = keepIn(pt.x + g.dx, g.half, W), y = keepIn(pt.y + g.dy, g.half, H);
    g.moved = true;
    g.x = x; g.y = y;
    local.setTokens(prev => prev.map(t => (t.id === g.id ? { ...t, x, y } : t)));
    const now = Date.now();
    if (now - lastSend.current > DRAG_BROADCAST_MS) {
      lastSend.current = now;
      sendBroadcast('drag', { id: g.id, x, y });
    }
  }
  async function onPointerUp(e) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    const cancelled = e.type !== 'pointerup';
    if (g.type === 'tap') { if (!cancelled) onSelect(g.id); return; }
    if (g.type !== 'token') return;
    local.endDrag(g.id);
    if (!g.moved) { if (!cancelled) onSelect(g.id); return; }
    if (cancelled) {
      local.setTokens(prev => prev.map(t => t.id === g.id ? { ...t, ...g.start } : t));
      sendBroadcast('drag', { id: g.id, done: true });
      return;
    }
    const final = grid.snap ? { x: snapInsideGrid(g.x, gsize, grid.x, g.half, W), y: snapInsideGrid(g.y, gsize, grid.y, g.half, H) } : { x: g.x, y: g.y };
    local.setTokens(prev => prev.map(t => (t.id === g.id ? { ...t, ...final } : t)));
    sendBroadcast('drag', { id: g.id, ...final, done: true });
    try { await updateToken(g.id, final); } catch (err) { setError(err.message); local.reloadItems(); }
  }

  return {
    svgRef,
    viewBox: view ? `${view.x} ${view.y} ${view.w} ${view.w * ratioRef.current}` : `0 0 ${W} ${H}`,
    frameMap, zoomBy, centerOn,
    pointerHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onLostPointerCapture: onPointerUp },
  };
}
