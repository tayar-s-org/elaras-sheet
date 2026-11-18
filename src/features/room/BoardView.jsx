import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { updateToken, addMark, removeMark, snapToGrid } from '../../lib/board.js';
import BoardTools from './BoardTools.jsx';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const initials = name => (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export default function BoardView({ tableId, me, members, characters, isGm, closed, room, boardState }) {
  const { board, tokens, marks, mapSrc, drags, error, setError, local } = boardState;
  const svgRef = useRef(null);
  const [view, setView] = useState(null); // { x, y, w } em unidades do mapa
  const [tool, setTool] = useState('move');
  const [selected, setSelected] = useState(null);
  const gesture = useRef(null);
  const lastSend = useRef(0);

  const myCharacter = members.find(m => m.user_id === me)?.character_id;
  const W = board?.width || 2000;
  const H = board?.height || 1400;
  const grid = board?.grid || { size: 70, visible: true };
  const gsize = clamp(Number(grid.size) || 70, 20, 400);

  // Enquadra o mapa inteiro quando o tabuleiro (ou o mapa) muda de tamanho.
  useEffect(() => { setView({ x: 0, y: 0, w: W }); }, [W, H, board?.id]);

  const svgRatio = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return r && r.width ? r.height / r.width : 0.7;
  };
  const toMap = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const canMove = t => !closed && (isGm || (t.character_id && t.character_id === myCharacter));
  const tokenPos = t => drags[t.id] || t;

  function onWheel(e) {
    if (!view) return;
    e.preventDefault();
    const pt = toMap(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 0.88 : 1.14;
    const w = clamp(view.w * factor, W / 8, W * 1.5);
    const k = w / view.w;
    setView({ w, x: pt.x - (pt.x - view.x) * k, y: pt.y - (pt.y - view.y) * k });
  }
  const zoomBy = factor => view && setView(v => {
    const w = clamp(v.w * factor, W / 8, W * 1.5);
    const cx = v.x + v.w / 2, cy = v.y + (v.w * svgRatio()) / 2;
    return { w, x: cx - w / 2, y: cy - (w * svgRatio()) / 2 };
  });

  function onPointerDown(e) {
    if (e.button !== 0 || !view) return;
    const tokenEl = e.target.closest?.('[data-token]');
    const markEl = e.target.closest?.('[data-mark]');
    svgRef.current.setPointerCapture?.(e.pointerId);
    if (tokenEl) {
      const t = tokens.find(x => x.id === tokenEl.dataset.token);
      setSelected(t.id);
      if (tool === 'move' && t && canMove(t)) {
        const pt = toMap(e.clientX, e.clientY);
        local.beginDrag(t.id);
        gesture.current = { type: 'token', id: t.id, dx: t.x - pt.x, dy: t.y - pt.y, moved: false };
        return;
      }
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
    if (!tokenEl) setSelected(null);
    gesture.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
  }
  function onPointerMove(e) {
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pan') {
      const scale = view.w / svgRef.current.getBoundingClientRect().width;
      setView(v => ({ ...v, x: g.vx - (e.clientX - g.sx) * scale, y: g.vy - (e.clientY - g.sy) * scale }));
      return;
    }
    const pt = toMap(e.clientX, e.clientY);
    const x = clamp(pt.x + g.dx, 0, W), y = clamp(pt.y + g.dy, 0, H);
    g.moved = true;
    g.x = x; g.y = y;
    local.setTokens(prev => prev.map(t => (t.id === g.id ? { ...t, x, y } : t)));
    const now = Date.now();
    if (now - lastSend.current > 60) {
      lastSend.current = now;
      room.sendBroadcast('drag', { id: g.id, x, y });
    }
  }
  async function onPointerUp() {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.type !== 'token') return;
    local.endDrag(g.id);
    if (!g.moved) return;
    const final = grid.visible ? { x: clamp(snapToGrid(g.x, gsize), 0, W), y: clamp(snapToGrid(g.y, gsize), 0, H) } : { x: g.x, y: g.y };
    local.setTokens(prev => prev.map(t => (t.id === g.id ? { ...t, ...final } : t)));
    room.sendBroadcast('drag', { id: g.id, ...final, done: true });
    try { await updateToken(g.id, final); } catch (err) { setError(err.message); local.reloadItems(); }
  }

  const visibleTokens = useMemo(() => tokens.filter(t => isGm || !t.hidden), [tokens, isGm]);
  const names = Object.fromEntries(members.map(m => [m.user_id, m.profiles?.display_name || 'Jogador']));

  if (board === undefined) return <p className="muted">Carregando o tabuleiro…</p>;
  if (!board) return <p className="muted">{error || 'Tabuleiro indisponível.'}</p>;

  const vb = view ? `${view.x} ${view.y} ${view.w} ${view.w * svgRatio()}` : `0 0 ${W} ${H}`;
  const lines = [];
  if (grid.visible) {
    for (let x = 0; x <= W; x += gsize) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={H} />);
    for (let y = 0; y <= H; y += gsize) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={W} y2={y} />);
  }
  const sel = tokens.find(t => t.id === selected);

  return <div className="board">
    <div className="board-toolbar">
      <div role="group" aria-label="Ferramentas" className="tabs-row">
        <button className={tool === 'move' ? 'primary' : 'outline'} aria-pressed={tool === 'move'} onClick={() => setTool('move')}>Mover</button>
        <button className={tool === 'marker' ? 'primary' : 'outline'} aria-pressed={tool === 'marker'} onClick={() => setTool('marker')} disabled={closed}>Marcador</button>
      </div>
      <div role="group" aria-label="Zoom" className="tabs-row">
        <button className="outline" aria-label="Diminuir zoom" onClick={() => zoomBy(1.25)}>−</button>
        <button className="outline" aria-label="Aumentar zoom" onClick={() => zoomBy(0.8)}>+</button>
        <button className="outline" onClick={() => setView({ x: 0, y: 0, w: W })}>Enquadrar</button>
      </div>
    </div>
    <svg ref={svgRef} className={`board-svg tool-${tool}`} viewBox={vb} preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="Tabuleiro compartilhado" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <rect x="0" y="0" width={W} height={H} className="board-bg" />
      {mapSrc && <image href={mapSrc} x="0" y="0" width={W} height={H} preserveAspectRatio="none" />}
      <g className="board-grid">{lines}</g>
      <g>{marks.map(m => <g key={m.id} data-mark={m.id} transform={`translate(${m.x} ${m.y})`} className="board-mark">
        <circle r={gsize * 0.16} fill={m.color} stroke="#000" strokeWidth="2" />
        <title>{m.kind === 'note' ? m.text : `Marcador de ${names[m.created_by] || 'jogador'}`}</title>
      </g>)}</g>
      <g>{visibleTokens.map(t => {
        const p = tokenPos(t);
        const r = (gsize * t.size) / 2 - 3;
        const mine = t.character_id && t.character_id === myCharacter;
        return <g key={t.id} data-token={t.id} transform={`translate(${p.x} ${p.y})`}
          className={`board-token${canMove(t) ? ' movable' : ''}${selected === t.id ? ' selected' : ''}${t.hidden ? ' hidden-token' : ''}`}>
          <circle r={r} fill={t.color} stroke={mine ? '#fff' : '#000'} strokeWidth={mine ? 5 : 3} />
          <text textAnchor="middle" dominantBaseline="central" fontSize={r * 0.8} fill="#fff" pointerEvents="none">{initials(t.name)}</text>
          <text y={r + gsize * 0.28} textAnchor="middle" fontSize={gsize * 0.26} className="token-label" pointerEvents="none">{t.name}</text>
        </g>;
      })}</g>
    </svg>
    {error && <p role="alert" className="muted">{error}</p>}
    {isGm && <BoardTools board={board} tokens={tokens} marks={marks} members={members} characters={characters}
      selected={sel} onSelect={setSelected} room={room} local={local} setError={setError} />}
  </div>;
}
