import React, { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import TokenMaker from '../token/TokenMaker.jsx';
import MasterModule from './MasterModule.jsx';
import MapWorkspace from './MapWorkspace.jsx';
import { gridLines } from '../../boardGrid.js';
import MusicPlayer from './MusicPlayer.jsx';
import { SfxVolume } from './SoundBar.jsx';
import AudioModal from './AudioModal.jsx';
import useSoundpad from './useSoundpad.js';
import CreaturePeek from './CreaturePeek.jsx';
import CreatureSheetPeek from './CreatureSheetPeek.jsx';
import { creatureOf, hpVisible, hpTone } from '../../creature.js';
import { displayName, imageVisible, isNameHidden, effectBadges, tokenEffects } from '../../tokenState.js';
import MasterHub from './masterHub/MasterHub.jsx';
import { useExtras } from './masterHub/extras.jsx';
import SheetPeek from './SheetPeek.jsx';
import BoardSheetPanel from './boardSheet/BoardSheetPanel.jsx';
import { useAptitudeFor } from '../routine/AptitudeSummary.jsx';
import { safeMaxima, currentValue } from './vitals.js';
import { boardGeometry, keepIn } from './boardViewport.js';
import { useBoardGestures } from './useBoardGestures.js';
import { useStepMove } from './useStepMove.js';
import { useTokenOperations } from './useTokenOperations.js';
import { nextRollToAnimate } from './rollAnimation.js';

const DiceStage = lazy(() => import('./DiceStage.jsx'));

// Anima no tabuleiro, para todos, cada rolagem nova que chega pelo servidor.
function DiceLayer({ rolls, caughtUpTo, ready, names, settings, markAnimating }) {
  const [event, setEvent] = useState(null);
  const last = useRef(null);
  const seq = useRef(0);
  useEffect(() => { if (settings.anim) import('./DiceStage.jsx'); }, [settings.anim]);
  useLayoutEffect(() => {
    if (!ready) return;
    if (last.current === null) { last.current = rolls.reduce((m, r) => Math.max(m, r.id), 0); return; }
    const next = nextRollToAnimate(rolls, last.current, caughtUpTo);
    last.current = next.lastSeenId;
    const roll = next.roll;
    if (!roll || !settings.anim) return;
    markAnimating(roll.id, true);
    setEvent({ seq: ++seq.current, roll, who: names[roll.user_id] || 'Jogador' });
  }, [rolls, caughtUpTo, ready, settings.anim]);
  useEffect(() => { if (!settings.anim) markAnimating(null, false); }, [settings.anim]);
  if (!settings.anim) return null;
  return <Suspense fallback={null}><DiceStage event={event} settings={settings} onFinish={id => markAnimating(id, false)} /></Suspense>;
}

const initials = name => (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export default function BoardView({ tableId, me, members, characters, isGm, closed, room, boardState, diceSettings, markAnimating, logSlot, immersive = false, sheets = null, auth = null, fullscreenAction = null, campaign = null }) {
  const { board, tokens, marks, mapSrc, drags, error, setError, local } = boardState;
  const [tool, setTool] = useState('move');
  const [selected, setSelected] = useState(null);
  const extras = useExtras();
  const [maker, setMaker] = useState(null); // { token } para um token existente, { token: null } para o meu token ainda sem lugar
  const [masterOpen, setMasterOpen] = useState(false);
  const [mapTools,setMapTools] = useState(null);
  const [presetNotice, setPresetNotice] = useState("");
  const [audioOpen, setAudioOpen] = useState(null);
  const [immersiveAudio,setImmersiveAudio] = useState(false);
  const gesture = useRef(null);

  const myCharacter = members.find(m => m.user_id === me)?.character_id;
  const names = Object.fromEntries(members.map(m => [m.user_id, m.profiles?.display_name || 'Jogador']));
  const geometry = boardGeometry(board);
  const { W, H, grid, gsize, tokenUnit, tokenHalf } = geometry;
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

  const canMove = t => !closed && (isGm || (t.character_id && t.character_id === myCharacter));
  const tokenPos = t => drags[t.id] || t;
  const tokenLabel = t => (t.character_id && characters[t.character_id]?.name) || displayName(t, isGm);

  const stepMove = useStepMove({ geometry, canMove, gesture, local, setError, tokenLabel });
  const gestures = useBoardGestures({ geometry, board, tokens, marks, tool, closed, isGm, me, canMove, movingToken: stepMove.movingToken, gesture, local, sendBroadcast: room.sendBroadcast, onSelect: setSelected, setError });
  const tokenOps = useTokenOperations({ board, tokens, characters, me, myCharacter, names, geometry, local, setError, maker, setMaker, setMasterOpen, onSelect: setSelected });
  const { sheetImage, newerArtwork, imageOf, busy, creatureRevision, placeMine, editCreature, adjustHp, duplicateCreature, removeCreature,
    toggleName, addTokenEffect, removeTokenEffect, setTokenEffects, saveTokenImage, saveCreaturePreset } = tokenOps;
  const { movingToken, moveNotice, clearMoveNotice, moveSelected } = stepMove;
  const { svgRef, viewBox, zoomBy, frameMap, centerOn, pointerHandlers } = gestures;

  const pad = useSoundpad(room, tableId, isGm);
  const myToken = myCharacter ? tokens.find(t => t.character_id === myCharacter) : null;
  const visibleTokens = useMemo(() => tokens.filter(t => isGm || !t.hidden), [tokens, isGm]);
  const sel = visibleTokens.find(t => t.id === selected);
  const selectedAptitude = useAptitudeFor({ characterId: sel?.character_id, tableId, enabled: Boolean(sel?.character_id) && (isGm || sel?.character_id === myCharacter) });

  if (board === undefined) return <p className="muted">Carregando o tabuleiro…</p>;
  if (!board) return <p className="muted">{error || 'Tabuleiro indisponível.'}</p>;

  const lines = [];
  if (grid.visible) {
    for (const x of gridLines(W,gsize,grid.x)) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={H} />);
    for (const y of gridLines(H,gsize,grid.y)) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={W} y2={y} />);
  }

  return <div className="board">
    {isGm && <MasterHub tableId={tableId} closed={closed} members={members} characters={characters} states={room.states} board={board} tokens={tokens} pad={pad} sheets={sheets} auth={auth} extras={extras} campaign={campaign || { name: '', gmName: '', clock: '' }}
      tools={{ openCreature: () => setMaker({ creature: true }), openPresets: () => { setPresetNotice(''); setMasterOpen('presets'); }, openTokens: () => setMasterOpen('map'), openMapTools: view => setMapTools(view), openMusic: () => setAudioOpen('music'), openSound: () => setAudioOpen('sound'), setTokenEffects }} />}
    {/* O mestre consulta as fichas pelo módulo Jogadores da Central; o painel da ficha é dos jogadores. */}
    {!isGm && <BoardSheetPanel sel={sel} myCharacter={myCharacter} isGm={isGm} characters={characters} tableId={tableId} sheets={sheets} auth={auth} closed={closed} states={room.states} />}
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
      {!closed && myCharacter && <div className="toolbar-end">
        {myCharacter && <div role="group" aria-label="Meu token" className="tabs-row">
          {!myToken && <button className="primary" disabled={busy} onClick={placeMine}>Colocar meu token</button>}
          <button className="outline" onClick={() => setMaker({ token: myToken || null })}>{myToken || sheetImage(myCharacter) ? 'Editar token' : 'Criar token'}</button>
        </div>}
      </div>}
    </div>
    {immersive && <button type="button" className="text-button immersive-audio-toggle" aria-expanded={immersiveAudio}
      aria-controls="board-audio-controls" onClick={()=>setImmersiveAudio(v=>!v)}>{immersiveAudio ? 'Recolher áudio' : 'Mostrar áudio'}</button>}
    <div id="board-audio-controls" hidden={immersive && !immersiveAudio}>
      {board.settings?.music && <MusicPlayer board={board} isGm={isGm} local={local} setError={setError} />}
    </div>
    <div className="board-wrap">
    {visibleTokens.length > 0 && <div className="board-token-controls">
      <label className="field">
        <span>Selecionar token no mapa</span>
        <select value={sel?.id || ''} onChange={e => { setSelected(e.target.value || null); clearMoveNotice(); }}>
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
    <svg ref={svgRef} className={`board-svg tool-${tool}`} viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="Tabuleiro compartilhado" {...pointerHandlers}>
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
        const r = tokenUnit(t) / 2 - 3;
        const mine = t.character_id && t.character_id === myCharacter;
        const src = imageVisible(t, isGm) ? imageOf(t) : null; // nome oculto: sem foto para os jogadores
        const badges = effectBadges(tokenEffects(t, room.states)); // criatura: efeitos do token · personagem: condições da mesa
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
    <DiceLayer rolls={room.rolls} caughtUpTo={room.rollsCaughtUpTo} ready={room.ready} names={names} settings={diceSettings} markAnimating={markAnimating} />
    </div>
    {logSlot}
    {error && <p role="alert" className="muted">{error}</p>}
    {isGm && audioOpen && <AudioModal kind={audioOpen} board={board} pad={pad} local={local} setError={setError} onClose={() => setAudioOpen(null)} />}
    {isGm && masterOpen && <MasterModule board={board} tokens={tokens} marks={marks} members={members} characters={characters}
      selected={sel} onSelect={setSelected} room={room} local={local} mode={masterOpen} onMapTools={view => { setMasterOpen(false); setMapTools(view); }} initialNotice={masterOpen === "presets" ? presetNotice : ""}
      onGoToToken={token => {
        setSelected(token.id);
        centerOn(token);
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
