import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useConfirm } from '../../ui/ConfirmProvider.jsx';
import { updateToken, removeToken, addToken, loadCreatureDetails, saveCreatureToken, addMark, removeMark } from '../../lib/board.js';
import { uploadTokenImage, tokenUrl, saveTokenArtwork } from '../../lib/tokens.js';
import { setCharacterTokenImage } from '../../lib/cloud.js';
import { loadPresets, savePreset } from '../../lib/presets.js';
import TokenMaker from '../token/TokenMaker.jsx';
import MasterModule from './MasterModule.jsx';
import MapWorkspace from './MapWorkspace.jsx';
import { boardGrid, gridLines, snapInsideGrid } from '../../boardGrid.js';
import MusicPlayer from './MusicPlayer.jsx';
import SoundBar, { SfxVolume } from './SoundBar.jsx';
import AudioModal from './AudioModal.jsx';
import useSoundpad from './useSoundpad.js';
import CreaturePeek from './CreaturePeek.jsx';
import CreatureSheetPeek from './CreatureSheetPeek.jsx';
import { creatureOf, uniqueName, metaForCopy, metaWithHp, metaWithMaxHp, metaWithHideHp, hpVisible, newCreatureMeta, hpTone, CREATURE_COLOR } from '../../creature.js';
import { displayName, imageVisible, isNameHidden, effectsOf, addEffect, removeEffect, effectBadges } from '../../tokenState.js';
import SheetPeek from './SheetPeek.jsx';
import BoardSheetPanel from './boardSheet/BoardSheetPanel.jsx';
import { useAptitudeFor } from '../routine/AptitudeSummary.jsx';
import { safeMaxima, currentValue } from './vitals.js';

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

export default function BoardView({ tableId, me, members, characters, isGm, closed, room, boardState, diceSettings, markAnimating, logSlot, immersive = false, sheets = null, auth = null, fullscreenAction = null }) {
  const askConfirm = useConfirm();
  const { board, tokens, marks, mapSrc, drags, error, setError, local } = boardState;
  const svgRef = useRef(null);
  const [view, setViewRaw] = useState(null); // { x, y, w } em unidades do mapa
  const ratioRef = useRef(0.6); // altura/largura do SVG na tela
  const [tool, setTool] = useState('move');
  const [selected, setSelected] = useState(null);
  const [movingToken, setMovingToken] = useState(false);
  const [moveNotice, setMoveNotice] = useState('');
  const [creatureRevision, setCreatureRevision] = useState(0);
  const [maker, setMaker] = useState(null); // { token } para um token existente, { token: null } para o meu token ainda sem lugar
  const [tokenOverride, setTokenOverride] = useState({}); // ficha -> imagem recém-salva, até a leitura periódica das fichas trazer a nova
  const [busy, setBusy] = useState(false);
  const [masterOpen, setMasterOpen] = useState(false);
  const [mapTools,setMapTools] = useState(null);
  const [presetNotice, setPresetNotice] = useState("");
  const [audioOpen, setAudioOpen] = useState(null);
  const [immersiveAudio,setImmersiveAudio] = useState(false);
  const gesture = useRef(null);
  const lastSend = useRef(0);

  const myCharacter = members.find(m => m.user_id === me)?.character_id;
  const W = board?.width || 2000;
  const H = board?.height || 1400;
  const grid = boardGrid(board?.grid);
  const gsize = grid.size;
  const tokenScale = clamp(Number(board?.settings?.tokenScale) || 1.25, 0.5, 3);
  // O token inteiro (nao so o centro) fica dentro do tabuleiro.
  // Tokens de criatura têm o mesmo tamanho dos de jogador (o mestre pode ajustar o `size` de cada um no módulo do mestre).
  // Barra de vida dos tokens de jogador (vida atual da ficha, visivel a todos na mesa).
  const pcLife = t => {
    if (!t.character_id) return null;
    const data = characters[t.character_id]?.data;
    if (!data) return null;
    try {
      const max = safeMaxima(data);
      if (!(max.life > 0)) return null;
      const hp = currentValue(room.states[t.character_id], max, 'life');
      return { hp, maxHp: max.life, ratio: hp / max.life };
    } catch { return null; }
  };
  const unit = t => gsize * t.size * tokenScale;
  const tokenHalf = t => unit(t) / 2;
  const keepIn = (v, half, max) => (max <= half * 2 ? max / 2 : clamp(v, half, max - half));

  const fitWidth = (ratio = ratioRef.current) => Math.max(W, H / ratio);
  const constrain = v => {
    if (!v) return v;
    const r = ratioRef.current;
    const width = clamp(v.w, W / 8, fitWidth(r));
    const height = width * r;
    return { w:width, x:width >= W ? (W-width)/2 : clamp(v.x,0,W-width),
      y:height >= H ? (H-height)/2 : clamp(v.y,0,H-height) };
  };
  const setView = next => setViewRaw(prev => constrain(typeof next === 'function' ? next(prev) : next));
  const frameMap = () => setView({ x:0, y:0, w:fitWidth() });
  useEffect(() => { frameMap(); }, [W,H,board?.id,board?.map_path]);

  // Acompanha o tamanho do SVG (janela redimensionada, painel aberto) e reajusta a visao.
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) return;
      const previousRatio = ratioRef.current;
      const ratio = b.height / b.width;
      if (Math.abs(previousRatio-ratio) < 0.001) return;
      ratioRef.current = ratio;
      setViewRaw(prev => {
        if (!prev) return prev;
        const w = prev.w * fitWidth(ratio) / fitWidth(previousRatio);
        return constrain({ w, x:prev.x+(prev.w-w)/2, y:prev.y+(prev.w*previousRatio-w*ratio)/2 });
      });
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
      const w = clamp(v.w * factor, W / 8, fitWidth());
      const k = w / v.w;
      return { w, x: pt.x - (pt.x - v.x) * k, y: pt.y - (pt.y - v.y) * k };
    });
  }
  wheelRef.current = onWheel;
  const zoomBy = factor => view && setView(v => {
    const w = clamp(v.w * factor, W / 8, fitWidth());
    const cx = v.x + v.w / 2, cy = v.y + (v.w * svgRatio()) / 2;
    return { w, x: cx - w / 2, y: cy - (w * svgRatio()) / 2 };
  });

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
      if (t) setSelected(t.id);
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
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 5) return;
    const pt = toMap(e.clientX, e.clientY);
    const x = keepIn(pt.x + g.dx, g.half, W), y = keepIn(pt.y + g.dy, g.half, H);
    g.moved = true;
    g.x = x; g.y = y;
    local.setTokens(prev => prev.map(t => (t.id === g.id ? { ...t, x, y } : t)));
    const now = Date.now();
    if (now - lastSend.current > 60) {
      lastSend.current = now;
      room.sendBroadcast('drag', { id: g.id, x, y });
    }
  }
  async function onPointerUp(e) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    const cancelled = e.type !== 'pointerup';
    if (g.type === 'tap') { if (!cancelled) setSelected(g.id); return; }
    if (g.type !== 'token') return;
    local.endDrag(g.id);
    if (!g.moved) { if (!cancelled) setSelected(g.id); return; }
    if (cancelled) {
      local.setTokens(prev => prev.map(t => t.id === g.id ? { ...t, ...g.start } : t));
      room.sendBroadcast('drag', { id: g.id, done: true });
      return;
    }
    const final = grid.snap ? { x: snapInsideGrid(g.x,gsize,grid.x,g.half,W), y: snapInsideGrid(g.y,gsize,grid.y,g.half,H) } : { x: g.x, y: g.y };
    local.setTokens(prev => prev.map(t => (t.id === g.id ? { ...t, ...final } : t)));
    room.sendBroadcast('drag', { id: g.id, ...final, done: true });
    try { await updateToken(g.id, final); } catch (err) { setError(err.message); local.reloadItems(); }
  }

  const pad = useSoundpad(room, tableId, isGm);
  const myToken = myCharacter ? tokens.find(t => t.character_id === myCharacter) : null;
  // Token de personagem: a imagem é a da ficha (sempre sincronizada); a gravada no token só vale para tokens antigos, de ficha sem imagem.
  const newerArtwork = characterId => {
    const cached = tokenOverride[characterId];
    return cached && cached.revision > (characters[characterId]?.revision || 0) ? cached : null;
  };
  const sheetImage = characterId => (characterId ? newerArtwork(characterId)?.path ?? characters[characterId]?.data?.tokenImage : '') || '';
  const imageOf = t => tokenUrl(sheetImage(t.character_id) || t.image_path);
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
  // Coloca o token na lista local; se o Realtime ja o trouxe (em branco, quando o nome esta oculto), completa com os valores reais.
  const putToken = t => local.setTokens(prev => (prev.some(x => x.id === t.id) ? prev.map(x => (x.id === t.id ? { ...x, ...t } : x)) : [...prev, t]));
  // Mestre: nome oculto e efeitos de uma criatura ja criada. O estado local muda na hora; se o servidor recusar, recarrega.
  const patchCreature = async (token, patch) => {
    local.setTokens(prev => prev.map(t => (t.id === token.id ? { ...t, ...patch } : t)));
    try { await updateToken(token.id, patch); } catch (err) { setError(err.message); local.reloadItems(); }
  };
  const toggleName = (token, hide) => patchCreature(token, { name_hidden: hide });
  const addTokenEffect = (token, input) => {
    const effects = addEffect(token.effects, input);
    if (effects.length !== effectsOf(token).length) patchCreature(token, { effects });
  };
  const removeTokenEffect = (token, id) => patchCreature(token, { effects: removeEffect(token.effects, id) });
  const editCreature = async token => {
    const details = await loadCreatureDetails(token.id);
    setMasterOpen(false);
    setMaker({ creature: true, token, details });
  };

  const saveCreature = async (blob, extra) => {
    const editing = maker?.token;
    const target = editing && tokens.find(t => t.id === editing.id);
    if (editing && !target) throw new Error('Esta criatura não está mais no tabuleiro.');
    const artwork = await saveTokenArtwork(me, extra.artwork);
    const image_path = await uploadTokenImage(me, blob);
    const position = target || place();
    const half = tokenHalf({ size: extra.size });
    const meta = target && extra.hp !== null
      ? metaWithHideHp({ meta: metaWithMaxHp(target, extra.hp) }, extra.hideHp)
      : newCreatureMeta(extra.hp, extra.hideHp);
    const next = await saveCreatureToken(board, target?.id || null, {
      name: extra.name, image_path, size: extra.size, meta, name_hidden: extra.hideName,
      color: CREATURE_COLOR,
      ...(!target || target.size !== extra.size ? { x: keepIn(position.x, half, W), y: keepIn(position.y, half, H) } : {}),
    }, { artwork, sheet: extra.sheet });
    local.setTokens(prev => prev.some(t => t.id === next.id) ? prev.map(t => t.id === next.id ? next : t) : [...prev, next]);
    setCreatureRevision(rev => rev + 1);
    setSelected(next.id);
  };
  const adjustHp = async (token, delta) => {
    const c = creatureOf(token);
    if (!c || c.noHp) return;
    const meta = metaWithHp(token, c.hp + delta);
    local.setTokens(prev => prev.map(t => (t.id === token.id ? { ...t, meta } : t)));
    try { await updateToken(token.id, { meta }); } catch (err) { setError(err.message); local.reloadItems(); }
  };
  // Mestre: guarda a criatura so como predefinicao da mesa (nao poe no mapa). Devolve o nome salvo.
  const saveCreaturePreset = async (blob, extra) => {
    const artwork = await saveTokenArtwork(me, extra.artwork);
    const image_path = await uploadTokenImage(me, blob);
    const previous = maker?.preset;
    const taken = (await loadPresets(board.table_id)).filter(p => p.id !== previous?.id).map(p => p.name);
    const p = await savePreset(board.table_id, {
      name: uniqueName(extra.name, taken), image_path, max_hp: extra.hp, size: extra.size,
      details: { artwork, sheet: extra.sheet, hideHp: extra.hideHp, hideName: extra.hideName },
    }, previous?.id);
    return p.name;
  };
  // Duplica a criatura (so o mestre): mesmo nome (com numero), foto, vida cheia e nome oculto; efeitos nao vao junto. Fica na celula ao lado.
  const duplicateCreature = async token => {
    const spot = { x: keepIn(token.x + gsize, tokenHalf(token), W), y: keepIn(token.y, tokenHalf(token), H) };
    try {
      const details = await loadCreatureDetails(token.id);
      const t = await saveCreatureToken(board, null, { name: uniqueName(token.name, tokens.map(x => x.name)), color: token.color, size: token.size, image_path: token.image_path || null, meta: metaForCopy(token), name_hidden: isNameHidden(token), ...spot }, details);
      putToken(t);
      setSelected(t.id);
    } catch (err) { setError(err.message); }
  };
  // Apaga o token da criatura (so o mestre); pede confirmacao porque nao tem volta.
  const removeCreature = async token => {
    if (!(await askConfirm({ title: 'Apagar token?', text: `Apagar o token "${token.name || 'da criatura'}" do tabuleiro? Isso não pode ser desfeito.`, actionLabel: 'Apagar token', danger: true }))) return;
    try {
      await removeToken(token.id);
      local.setTokens(prev => prev.filter(t => t.id !== token.id));
      setSelected(null);
    } catch (err) { setError(err.message); local.reloadItems(); }
  };
  // Envia a imagem do token; atualiza o token existente ou, se ainda nao ha token do jogador, cria um.
  const saveTokenImage = async (blob, extra) => {
    if (maker?.preset) return saveCreaturePreset(blob, extra);
    if (maker?.creature) return saveCreature(blob, extra);
    const target = maker?.token;
    // Token do próprio jogador: a imagem vai para a ficha (e o token a acompanha); o token não guarda imagem própria.
    if (myCharacter && (!target || target.character_id === myCharacter)) {
      const artwork = await saveTokenArtwork(me, extra.artwork);
      const path = await uploadTokenImage(me, blob);
      const saved = await setCharacterTokenImage(myCharacter, path, artwork);
      setTokenOverride(prev => ({ ...prev, [myCharacter]: { path, artwork, revision: saved.revision } }));
      if (!target) await addMine(null);
      return;
    }
    const path = await uploadTokenImage(me, blob);
    if (target) {
      await updateToken(target.id, { image_path: path });
      local.setTokens(prev => prev.map(t => (t.id === target.id ? { ...t, image_path: path } : t)));
    } else {
      await addMine(path);
    }
  };

  const tokenLabel = t => (t.character_id && characters[t.character_id]?.name) || displayName(t, isGm);

  async function moveSelected(token, dx, dy, direction) {
    if (movingToken || gesture.current || !canMove(token)) return;
    const half = tokenHalf(token);
    const x = grid.snap ? snapInsideGrid(token.x+dx*gsize,gsize,grid.x,half,W) : token.x + dx * gsize;
    const y = grid.snap ? snapInsideGrid(token.y+dy*gsize,gsize,grid.y,half,H) : token.y + dy * gsize;
    const next = {
      x: dx ? keepIn(x, half, W) : token.x,
      y: dy ? keepIn(y, half, H) : token.y,
    };
    if (next.x === token.x && next.y === token.y) {
      setMoveNotice('O token chegou ao limite do mapa.');
      return;
    }
    setMovingToken(true);
    setError('');
    setMoveNotice('');
    try {
      await updateToken(token.id, next);
      local.setTokens(prev => prev.map(t => t.id === token.id ? { ...t, ...next } : t));
      setMoveNotice(`${tokenLabel(token)}: movido para ${direction}.`);
    } catch (err) {
      setError(err.message);
      local.reloadItems();
    } finally {
      setMovingToken(false);
    }
  }

  const visibleTokens = useMemo(() => tokens.filter(t => isGm || !t.hidden), [tokens, isGm]);
  const names = Object.fromEntries(members.map(m => [m.user_id, m.profiles?.display_name || 'Jogador']));

  if (board === undefined) return <p className="muted">Carregando o tabuleiro…</p>;
  if (!board) return <p className="muted">{error || 'Tabuleiro indisponível.'}</p>;

  const vb = view ? `${view.x} ${view.y} ${view.w} ${view.w * svgRatio()}` : `0 0 ${W} ${H}`;
  const lines = [];
  if (grid.visible) {
    for (const x of gridLines(W,gsize,grid.x)) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={H} />);
    for (const y of gridLines(H,gsize,grid.y)) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={W} y2={y} />);
  }
  const sel = visibleTokens.find(t => t.id === selected);
  const selectedAptitude = useAptitudeFor({ characterId: sel?.character_id, tableId, enabled: Boolean(sel?.character_id) && (isGm || sel?.character_id === myCharacter) });

  return <div className="board">
    <BoardSheetPanel sel={sel} myCharacter={myCharacter} isGm={isGm} characters={characters} tableId={tableId} sheets={sheets} auth={auth} closed={closed} />
    <div className="board-toolbar">
      <div role="group" aria-label="Ferramentas" className="tabs-row">
        <button className={tool === 'move' ? 'primary' : 'outline'} aria-pressed={tool === 'move'} onClick={() => setTool('move')}>Mover</button>
        <button className={tool === 'marker' ? 'primary' : 'outline'} aria-pressed={tool === 'marker'} onClick={() => setTool('marker')} disabled={closed}>Marcador</button>
      </div>
      <div role="group" aria-label="Zoom e visualização" className="tabs-row">
        <button className="outline" aria-label="Diminuir zoom" onClick={() => zoomBy(1.25)}>−</button>
        <button className="outline" aria-label="Aumentar zoom" onClick={() => zoomBy(0.8)}>+</button>
        <button className="outline" onClick={frameMap}>Enquadrar</button>
        {fullscreenAction}
        {!isGm && <SfxVolume pad={pad} />}
      </div>
      {!closed && (myCharacter || isGm) && <div className="toolbar-end">
        {myCharacter && <div role="group" aria-label="Meu token" className="tabs-row">
          {!myToken && <button className="primary" disabled={busy} onClick={placeMine}>Colocar meu token</button>}
          <button className="outline" onClick={() => setMaker({ token: myToken || null })}>{myToken || sheetImage(myCharacter) ? 'Editar token' : 'Criar token'}</button>
        </div>}
        {isGm && <div role="group" aria-label="Mestre" className="tabs-row">
          <button type="button" className="primary" onClick={() => setMaker({ creature: true })}>Nova criatura</button>
          <button type="button" className="outline" onClick={() => { setPresetNotice(""); setMasterOpen("presets"); }}>Predefinições</button>
          <button type="button" className="outline master-button" onClick={() => setMasterOpen('map')}>Mapa e tokens</button>
          <button type="button" className="outline music-button" onClick={() => setAudioOpen('music')}>Música</button>
          <button type="button" className="outline sound-button" onClick={() => setAudioOpen('sound')}>Soundpad</button>
        </div>}
      </div>}
    </div>
    {immersive && <button type="button" className="text-button immersive-audio-toggle" aria-expanded={immersiveAudio}
      aria-controls="board-audio-controls" onClick={()=>setImmersiveAudio(v=>!v)}>{immersiveAudio ? 'Recolher áudio' : 'Mostrar áudio'}</button>}
    <div id="board-audio-controls" hidden={immersive && !immersiveAudio}>
      {board.settings?.music && <MusicPlayer board={board} isGm={isGm} local={local} setError={setError} />}
      <SoundBar pad={pad} isGm={isGm} />
    </div>
    <div className="board-wrap">
    {visibleTokens.length > 0 && <div className="board-token-controls">
      <label className="field">
        <span>Selecionar token no mapa</span>
        <select value={sel?.id || ''} onChange={e => { setSelected(e.target.value || null); setMoveNotice(''); }}>
          <option value="">Nenhum token selecionado</option>
          {visibleTokens.map(t => <option key={t.id} value={t.id}>{tokenLabel(t)}</option>)}
        </select>
      </label>
      {sel && canMove(sel) && <div role="group" aria-label="Mover token uma célula" className="tabs-row">
        {[['cima', 0, -1], ['esquerda', -1, 0], ['direita', 1, 0], ['baixo', 0, 1]].map(([direction, dx, dy]) =>
          <button key={direction} type="button" className="outline" aria-disabled={movingToken}
            onClick={() => moveSelected(sel, dx, dy, direction)}>Mover para {direction}</button>)}
      </div>}
      <span className="board-move-status muted" role="status">{movingToken ? 'Movendo token…' : moveNotice}</span>
    </div>}
    <svg ref={svgRef} className={`board-svg tool-${tool}`} viewBox={vb} preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="Tabuleiro compartilhado" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onLostPointerCapture={onPointerUp}>
      <rect x="0" y="0" width={W} height={H} className="board-bg" />
      {mapSrc && <image href={mapSrc} x="0" y="0" width={W} height={H} preserveAspectRatio="xMidYMid meet" />}
      <g className="board-grid" opacity={grid.opacity}>{lines}</g>
      <g>{marks.map(m => <g key={m.id} data-mark={m.id} transform={`translate(${m.x} ${m.y})`} className="board-mark">
        <circle r={gsize * 0.16} fill={m.color} stroke="#000" strokeWidth="2" />
        <title>{m.kind === 'note' ? m.text : `Marcador de ${names[m.created_by] || 'jogador'}`}</title>
      </g>)}</g>
      <g>{visibleTokens.map(t => {
        const raw = tokenPos(t);
        const p = { x: keepIn(raw.x, tokenHalf(t), W), y: keepIn(raw.y, tokenHalf(t), H) };
        const r = unit(t) / 2 - 3;
        const mine = t.character_id && t.character_id === myCharacter;
        const src = imageVisible(t, isGm) ? imageOf(t) : null; // nome oculto: sem foto para os jogadores
        const badges = effectBadges(t.effects);
        const cr = creatureOf(t) || pcLife(t);
        // Token de personagem mostra o nome atual da ficha (o nome gravado no token é só o de quando foi colocado).
        const label = tokenLabel(t);
        return <g key={t.id} data-token={t.id} transform={`translate(${p.x} ${p.y})`}
          className={`board-token${canMove(t) ? ' movable' : ''}${selected === t.id ? ' selected' : ''}${t.hidden ? ' hidden-token' : ''}${cr && cr.hp === 0 ? ' defeated' : ''}`}>
          {src ? <>
            <circle r={r} fill="rgba(0,0,0,0.001)" />
            <image href={src} x={-r - 3} y={-r - 3} width={(r + 3) * 2} height={(r + 3) * 2} pointerEvents="none" preserveAspectRatio="xMidYMid meet" />
          </> : <>
            <circle r={r} fill={t.color} stroke={mine ? '#fff' : '#000'} strokeWidth={mine ? 5 : 3} />
            <text textAnchor="middle" dominantBaseline="central" fontSize={r * 0.8} fill="#fff" pointerEvents="none">{initials(label)}</text>
          </>}
          {hpVisible(cr, isGm) && <g pointerEvents="none">
            <rect className="hp-track" x={-r} y={r + gsize * 0.05} width={r * 2} height={gsize * 0.11} rx={gsize * 0.05} />
            <rect className={`hp-fill ${hpTone(cr.ratio)}`} x={-r} y={r + gsize * 0.05} width={Math.max(0, r * 2 * cr.ratio)} height={gsize * 0.11} rx={gsize * 0.05} />
          </g>}
          <text y={r + gsize * (hpVisible(cr, isGm) ? 0.46 : 0.28)} textAnchor="middle" fontSize={gsize * 0.26} className="token-label" pointerEvents="none">{label}</text>
          {badges.shown.length > 0 && <g className="token-effects" pointerEvents="none">
            <title>{badges.all}</title>
            {[...badges.shown, ...(badges.extra ? [{ id: '+', icon: `+${badges.extra}` }] : [])].map((e, i, all) => {
              const fs = gsize * 0.3;
              return <g key={e.id} transform={`translate(${(i - (all.length - 1) / 2) * fs * 1.7} ${-r - fs * 0.45})`}>
                <circle r={fs * 0.85} fill="rgba(0,0,0,0.78)" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
                <text textAnchor="middle" dominantBaseline="central" fontSize={e.id === '+' ? fs * 0.8 : fs} fill="#fff">{e.icon}</text>
              </g>;
            })}
          </g>}
          {isGm && isNameHidden(t) && <g transform={`translate(${r * 0.78} ${-r * 0.78})`} pointerEvents="none">
            <title>Nome e foto ocultos dos jogadores</title>
            <circle r={gsize * 0.17} fill="#d9a21b" stroke="#000" strokeWidth="2" />
            <text textAnchor="middle" dominantBaseline="central" fontSize={gsize * 0.22} fontWeight="700" fill="#000">?</text>
          </g>}
        </g>;
      })}</g>
    </svg>
    {sel?.character_id && characters[sel.character_id]?.data && <SheetPeek aptitude={selectedAptitude} data={characters[sel.character_id].data} state={room.states[sel.character_id]} limited={!isGm && sel.character_id !== myCharacter} mine={sel.character_id === myCharacter} editable={!closed && (isGm || sel.character_id === myCharacter)} characterId={sel.character_id} tableId={tableId} onClose={() => setSelected(null)} />}
    {sel && !sel.character_id && creatureOf(sel) && <CreaturePeek token={sel} isGm={isGm} onAdjust={delta => adjustHp(sel, delta)} onRemove={isGm ? () => removeCreature(sel) : undefined} onClose={() => setSelected(null)}
      onDuplicate={isGm ? () => duplicateCreature(sel) : undefined} onToggleName={isGm ? hide => toggleName(sel, hide) : undefined} onAddEffect={input => addTokenEffect(sel, input)} onRemoveEffect={id => removeTokenEffect(sel, id)}>
      {isGm && <CreatureSheetPeek key={sel.id} token={sel} tableId={tableId} room={room} closed={closed}
        revision={creatureRevision} onEdit={() => editCreature(sel)} />}
    </CreaturePeek>}
    <DiceLayer rolls={room.rolls} ready={room.ready} names={names} settings={diceSettings} markAnimating={markAnimating} />
    </div>
    {logSlot}
    {error && <p role="alert" className="muted">{error}</p>}
    {isGm && audioOpen && <AudioModal kind={audioOpen} board={board} pad={pad} local={local} setError={setError} onClose={() => setAudioOpen(null)} />}
    {isGm && masterOpen && <MasterModule board={board} tokens={tokens} marks={marks} members={members} characters={characters}
      selected={sel} onSelect={setSelected} room={room} local={local} mode={masterOpen} onMapTools={view => { setMasterOpen(false); setMapTools(view); }} initialNotice={masterOpen === "presets" ? presetNotice : ""}
      onGoToToken={token => {
        setSelected(token.id);
        setView(previous => {
          const width = previous?.w || W;
          return { w: width, x: token.x - width / 2, y: token.y - width * svgRatio() / 2 };
        });
        svgRef.current?.scrollIntoView({ block: 'nearest' });
      }}
      onClose={() => setMasterOpen(false)}
      onCreateCreature={() => { setMasterOpen(false); setMaker({ creature: true, fromPresets: masterOpen === "presets" }); }}
      onEditPreset={preset => { setMasterOpen(false); setMaker({ creature: true, preset, details: preset.details }); }}
      onEditImage={async t => {
        if (creatureOf(t)) await editCreature(t);
        else { setMasterOpen(false); setMaker({ token: t }); }
      }} />}
    {isGm && mapTools && <MapWorkspace board={board} marks={marks} local={local} room={room} initial={mapTools} onClose={()=>setMapTools(null)} />}
    {maker && <TokenMaker name={maker.preset?.name || maker.token?.name || characters[myCharacter]?.name || ''}
      saveLabel={maker.preset ? 'Salvar alterações' : maker.creature ? (maker.token ? 'Salvar alterações' : 'Colocar no mapa') : maker.token || isGm ? 'Salvar token' : 'Salvar e colocar'}
      imagePath={maker.creature ? maker.preset?.image_path || maker.token?.image_path
        : maker.token && maker.token.character_id !== myCharacter ? maker.token.image_path : sheetImage(myCharacter) || maker.token?.image_path}
      artwork={maker.creature ? maker.details?.artwork
        : !maker.token || maker.token.character_id === myCharacter ? newerArtwork(myCharacter)?.artwork || characters[myCharacter]?.data?.tokenArtwork : undefined}
      creature={maker.creature ? {
        name: maker.preset?.name || maker.token?.name || '', size: maker.preset?.size || maker.token?.size,
        hp: maker.preset?.max_hp || (creatureOf(maker.token)?.noHp ? undefined : creatureOf(maker.token)?.maxHp),
        noHp: Boolean(creatureOf(maker.token)?.noHp), sheet: maker.details?.sheet,
        hideHp: maker.preset ? maker.details?.hideHp : Boolean(creatureOf(maker.token)?.hideHp),
        hideName: maker.preset ? maker.details?.hideName : isNameHidden(maker.token),
        editing: Boolean(maker.token || maker.preset), preset: Boolean(maker.preset),
      } : undefined}
      onSave={saveTokenImage}
      onSavePreset={maker.creature && !maker.preset && !creatureOf(maker.token)?.noHp ? saveCreaturePreset : undefined}
      onClose={reason => {
        if (maker.preset || (maker.fromPresets && reason !== "placed")) {
          setPresetNotice(maker.preset && reason === "saved" ? "Predefinição atualizada." : "");
          setMasterOpen("presets");
        }
        setMaker(null);
      }} />}
  </div>;
}
