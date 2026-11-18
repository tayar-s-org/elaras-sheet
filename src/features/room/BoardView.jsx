import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { updateToken, addToken, addMark, removeMark, snapToGrid } from '../../lib/board.js';
import { uploadTokenImage, tokenUrl } from '../../lib/tokens.js';
import TokenMaker from '../token/TokenMaker.jsx';
import BoardTools from './BoardTools.jsx';
import SheetPeek from './SheetPeek.jsx';

const DiceStage = lazy(() => import('./DiceStage.jsx'));

// Anima no tabuleiro, para todos, cada rolagem nova que chega pelo servidor.
function DiceLayer({ rolls, ready, names, settings, markAnimating }) {
  const [event, setEvent] = useState(null);
  const last = useRef(null);
  const seq = useRef(0);
  useEffect(() => { if (settings.anim) import('./DiceStage.jsx'); }, [settings.anim]);
  useLayoutEffect(() => {
    if (!ready) return;
    if (last.current === null) { last.current = rolls.reduce((m, r) => Math.max(m, r.id), 0); return; }
    const fresh = rolls.filter(r => r.id > last.current);
    if (!fresh.length) return;
    last.current = Math.max(...fresh.map(r => r.id));
    if (!settings.anim) return;
    const roll = fresh[fresh.length - 1];
    markAnimating(roll.id, true);
    setEvent({ seq: ++seq.current, roll, who: names[roll.user_id] || 'Jogador' });
  }, [rolls, ready, settings.anim]);
  useEffect(() => { if (!settings.anim) markAnimating(null, false); }, [settings.anim]);
  if (!settings.anim) return null;
  return <Suspense fallback={null}><DiceStage event={event} settings={settings} onFinish={id => markAnimating(id, false)} /></Suspense>;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const initials = name => (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export default function BoardView({ tableId, me, members, characters, isGm, closed, room, boardState, diceSettings, markAnimating, logSlot }) {
  const { board, tokens, marks, mapSrc, drags, error, setError, local } = boardState;
  const svgRef = useRef(null);
  const [view, setViewRaw] = useState(null); // { x, y, w } em unidades do mapa
  const ratioRef = useRef(0.6); // altura/largura do SVG na tela
  const [tool, setTool] = useState('move');
  const [selected, setSelected] = useState(null);
  const [maker, setMaker] = useState(null); // { token } para um token existente, { token: null } para o meu token ainda sem lugar
  const [busy, setBusy] = useState(false);
  const gesture = useRef(null);
  const lastSend = useRef(0);

  const myCharacter = members.find(m => m.user_id === me)?.character_id;
  const W = board?.width || 2000;
  const H = board?.height || 1400;
  const grid = board?.grid || { size: 70, visible: true };
  const gsize = clamp(Number(grid.size) || 70, 20, 400);
  const tokenScale = clamp(Number(board?.settings?.tokenScale) || 1.25, 0.5, 3);

  // Limites da visao: o maximo de zoom out faz o mapa cobrir toda a area do tabuleiro (sem margens) e nao se pode arrastar para fora dele.
  const constrain = v => {
    if (!v) return v;
    const r = ratioRef.current;
    const maxW = Math.min(W, H / r);
    const w = clamp(v.w, Math.min(W / 8, maxW), maxW);
    return { w, x: clamp(v.x, 0, W - w), y: clamp(v.y, 0, H - w * r) };
  };
  const setView = next => setViewRaw(prev => constrain(typeof next === 'function' ? next(prev) : next));

  // Enquadra o mapa quando o tabuleiro (ou o mapa) muda de tamanho.
  useEffect(() => { setView({ x: 0, y: 0, w: W }); }, [W, H, board?.id]);
  // Acompanha o tamanho do SVG (janela redimensionada, painel aberto) e reajusta a visao.
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const b = el.getBoundingClientRect();
      if (b.width) { ratioRef.current = b.height / b.width; setViewRaw(prev => constrain(prev)); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [Boolean(board), W, H]);

  const svgRatio = () => ratioRef.current;
  const toMap = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const canMove = t => !closed && (isGm || (t.character_id && t.character_id === myCharacter));
  const tokenPos = t => drags[t.id] || t;

  const wheelRef = useRef(null);
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
    setView(v => {
      if (!v) return v;
      const w = clamp(v.w * factor, W / 8, W * 1.5);
      const k = w / v.w;
      return { w, x: pt.x - (pt.x - v.x) * k, y: pt.y - (pt.y - v.y) * k };
    });
  }
  wheelRef.current = onWheel;
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

  const myToken = myCharacter ? tokens.find(t => t.character_id === myCharacter) : null;
  const imageOf = t => tokenUrl(t.image_path || characters[t.character_id]?.data?.tokenImage);
  const place = () => ({ x: (board?.width || 2000) / 2 + (tokens.length % 5) * 20, y: (board?.height || 1400) / 2 + (tokens.length % 5) * 20 });
  const addMine = async imagePath => {
    const c = characters[myCharacter];
    const t = await addToken(board, { kind: 'pc', name: c?.name || names[me] || 'Personagem', character_id: myCharacter, image_path: imagePath || null, ...place() });
    local.setTokens(prev => (prev.some(x => x.id === t.id) ? prev : [...prev, t]));
    setSelected(t.id);
  };
  const placeMine = async () => {
    setBusy(true);
    setError('');
    try { await addMine(null); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  // Envia a imagem do token; atualiza o token existente ou, se ainda nao ha token do jogador, cria um.
  const saveTokenImage = async blob => {
    const target = maker?.token;
    const path = await uploadTokenImage(me, blob, target?.image_path && target.image_path.startsWith(`${me}/`) ? target.image_path : '');
    if (target) {
      await updateToken(target.id, { image_path: path });
      local.setTokens(prev => prev.map(t => (t.id === target.id ? { ...t, image_path: path } : t)));
    } else {
      await addMine(path);
    }
  };

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
      {myCharacter && !closed && <div role="group" aria-label="Meu token" className="tabs-row">
        {!myToken && <button className="primary" disabled={busy} onClick={placeMine}>Colocar meu token</button>}
        <button className="outline" onClick={() => setMaker({ token: myToken || null })}>{myToken ? 'Trocar imagem do token' : 'Criar token'}</button>
      </div>}
    </div>
    <div className="board-wrap">
    <svg ref={svgRef} className={`board-svg tool-${tool}`} viewBox={vb} preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="Tabuleiro compartilhado" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
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
        const r = (gsize * t.size * tokenScale) / 2 - 3;
        const mine = t.character_id && t.character_id === myCharacter;
        const src = imageOf(t);
        return <g key={t.id} data-token={t.id} transform={`translate(${p.x} ${p.y})`}
          className={`board-token${canMove(t) ? ' movable' : ''}${selected === t.id ? ' selected' : ''}${t.hidden ? ' hidden-token' : ''}`}>
          {src ? <>
            <circle r={r} fill="rgba(0,0,0,0.001)" />
            <image href={src} x={-r - 3} y={-r - 3} width={(r + 3) * 2} height={(r + 3) * 2} pointerEvents="none" preserveAspectRatio="xMidYMid meet" />
          </> : <>
            <circle r={r} fill={t.color} stroke={mine ? '#fff' : '#000'} strokeWidth={mine ? 5 : 3} />
            <text textAnchor="middle" dominantBaseline="central" fontSize={r * 0.8} fill="#fff" pointerEvents="none">{initials(t.name)}</text>
          </>}
          <text y={r + gsize * 0.28} textAnchor="middle" fontSize={gsize * 0.26} className="token-label" pointerEvents="none">{t.name}</text>
        </g>;
      })}</g>
    </svg>
    {sel?.character_id && characters[sel.character_id]?.data && <SheetPeek data={characters[sel.character_id].data} state={room.states[sel.character_id]} onClose={() => setSelected(null)} />}
    <DiceLayer rolls={room.rolls} ready={room.ready} names={names} settings={diceSettings} markAnimating={markAnimating} />
    </div>
    {logSlot}
    {error && <p role="alert" className="muted">{error}</p>}
    {isGm && <BoardTools board={board} tokens={tokens} marks={marks} members={members} characters={characters}
      selected={sel} onSelect={setSelected} room={room} local={local} setError={setError} onEditImage={t => setMaker({ token: t })} />}
    {maker && <TokenMaker name={maker.token?.name || characters[myCharacter]?.name || ''} saveLabel={maker.token || isGm ? 'Salvar token' : 'Salvar e colocar'}
      onSave={saveTokenImage} onClose={() => setMaker(null)} />}
  </div>;
}
