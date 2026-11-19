import React, { useCallback, useEffect, useRef, useState } from 'react';
import { loginThen, navigate } from '../../lib/router.js';
import { STATUS_LABEL } from '../../lib/tables.js';
import { useRoom } from './useRoom.js';
import ChatPanel from './ChatPanel.jsx';
import PartyPanel from './PartyPanel.jsx';
import DicePanel, { RollHistory } from './DicePanel.jsx';
import BoardView from './BoardView.jsx';
import TableControls, { JoinApprovals } from '../tables/TableControls.jsx';
import TableLog from './TableLog.jsx';
import TrainingButton from './TrainingButton.jsx';
import { useGmAlert, GmAlertToggle } from './GmAlert.jsx';
import ItemApprovals from './ItemApprovals.jsx';
import SkillApprovals from './SkillApprovals.jsx';
import { useCustomSkillRequests } from './useCustomSkillRequests.js';
import TrainingApprovals from './TrainingApprovals.jsx';
import { useTrainingApprovals } from './useTrainingApprovals.js';
import RequestApprovals, { useRequests } from '../routine/RequestApprovals.jsx';
import { useCustomItemRequests } from './useCustomItemRequests.js';
import { setLastRoom, clearLastRoom } from '../../lib/lastRoom.js';
import { useBoard } from './useBoard.js';
import { useLiveCharacters } from './useLiveCharacters.js';
import { TableExtrasContext, useTableExtras } from './masterHub/extras.jsx';
import { useClock } from '../routine/useClock.js';
import { formatClock } from '../../rpg/clock.js';
import '../routine/routine.css';

const SETTINGS_KEY = 'elara-dice3d';
const loadSettings = () => {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  try { return { anim: !reduced, sound: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { anim: !reduced, sound: true }; }
};

export default function RoomPage({ auth, id, sheets }) {
  const [immersive, setImmersive] = useState(false);
  const [docks, setDocks] = useState({ party:false, dice:false });
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 980px)').matches);
  const dockButtons = useRef({});
  const dockPanels = useRef({});
  const overlayDock = immersive && narrow ? (docks.dice ? 'dice' : docks.party ? 'party' : null) : null;
  const activeOverlay = useRef(null);
  const fullscreenButton = useRef(null);
  const nativeFullscreen = useRef(false);

  const exitImmersive = useCallback(() => {
    setImmersive(false);
    if (nativeFullscreen.current && document.fullscreenElement === document.documentElement) {
      document.exitFullscreen?.().catch(()=>{});
    }
    nativeFullscreen.current = false;
    requestAnimationFrame(()=>fullscreenButton.current?.focus());
  }, []);

  async function enterImmersive() {
    setDocks({ party:false, dice:false });
    setImmersive(true);
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
        nativeFullscreen.current = true;
      } catch { /* A sala ampliada continua disponível na janela. */ }
    }
    requestAnimationFrame(()=>fullscreenButton.current?.focus());
  }

  useEffect(() => {
    const media = window.matchMedia('(max-width: 980px)');
    const onChange = event => {
      setNarrow(event.matches);
      if (event.matches) setDocks(prev=>prev.party && prev.dice ? {party:false,dice:true} : prev);
    };
    media.addEventListener('change',onChange);
    return () => media.removeEventListener('change',onChange);
  }, []);

  const closeDock = useCallback(name => {
    setDocks(prev=>({ ...prev,[name]:false }));
    requestAnimationFrame(()=>dockButtons.current[name]?.focus());
  }, []);

  useEffect(() => {
    activeOverlay.current = overlayDock;
    if (overlayDock) dockPanels.current[overlayDock]?.querySelector('button')?.focus();
  }, [overlayDock]);

  useEffect(() => {
    if (!immersive) return undefined;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const topbar = document.querySelector('.topbar');
    const inert = topbar?.inert;
    if (topbar) topbar.inert = true;
    const changed = () => {
      if (nativeFullscreen.current && !document.fullscreenElement) exitImmersive();
    };
    const key = event => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        event.preventDefault();
        if (activeOverlay.current) closeDock(activeOverlay.current);
        else exitImmersive();
      }
    };
    document.addEventListener('fullscreenchange',changed);
    document.addEventListener('keydown',key);
    return () => {
      document.body.style.overflow = overflow;
      if (topbar) topbar.inert = inert;
      document.removeEventListener('fullscreenchange',changed);
      document.removeEventListener('keydown',key);
      if (nativeFullscreen.current && document.fullscreenElement === document.documentElement) document.exitFullscreen?.().catch(()=>{});
      nativeFullscreen.current = false;
    };
  }, [immersive,exitImmersive,closeDock]);

  function toggleDock(name) {
    if (docks[name]) { closeDock(name); return; }
    setDocks(prev=>({
      party:name==='party' || (!narrow && prev.party),
      dice:name==='dice' || (!narrow && prev.dice),
    }));
  }

  function containDockFocus(event) {
    if (!overlayDock || event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])')]
      .filter(control=>control.getClientRects().length && control.tabIndex >= 0);
    const start = controls[0], end = controls.at(-1);
    if (event.shiftKey && event.target===start) { event.preventDefault(); end?.focus(); }
    if (!event.shiftKey && event.target===end) { event.preventDefault(); start?.focus(); }
  }

  const [tab, setTab] = useState('chat');
  const [ctrlError, setCtrlError] = useState('');
  const [diceSettings, setDiceSettingsState] = useState(loadSettings);
  const setDiceSettings = useCallback(patch => setDiceSettingsState(prev => {
    const next = { ...prev, ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* sem storage */ }
    return next;
  }), []);
  // Rolagens ainda em animacao ficam fora do historico para nao estragar a surpresa.
  const [hidden, setHidden] = useState(() => new Set());
  const markAnimating = useCallback((rollId, on) => {
    setHidden(prev => {
      if (rollId == null) return prev.size ? new Set() : prev;
      if (on === prev.has(rollId)) return prev;
      const next = new Set(prev);
      if (on) next.add(rollId); else next.delete(rollId);
      return next;
    });
    if (on && rollId != null) setTimeout(() => setHidden(prev => { if (!prev.has(rollId)) return prev; const next = new Set(prev); next.delete(rollId); return next; }), 10000);
  }, []);
  const room = useRoom(id, auth.user, auth.profile?.display_name || auth.user?.email);
  const boardState = useBoard(id, auth.user, room);
  const { table, members, messages, rolls, states, characters: savedCharacters, online, connected, error } = room;
  const characters = useLiveCharacters(id, members, savedCharacters, Boolean(room.ready));
  const itemRequests = useCustomItemRequests(id, Boolean(room.ready) && table?.owner_id === auth.user?.id);
  const skillRequests = useCustomSkillRequests(id, Boolean(room.ready) && table?.owner_id === auth.user?.id);
  const clock = useClock(id, Boolean(room.ready));
  const extras = useTableExtras(id, Boolean(room.ready)); // moedas, carteiras e experiências da mesa (uma cópia só, por Realtime)
  const requests = useRequests(id, Boolean(room.ready) && table?.owner_id === auth.user?.id);
  const trainingRequests = useTrainingApprovals(id, Boolean(room.ready) && table?.owner_id === auth.user?.id);
  const pendingEntries = members.filter(m => m.status === 'pending').length;
  const pendingTotal = itemRequests.pending + skillRequests.pending + requests.pending.length + trainingRequests.pending.length + pendingEntries;
  const gmAlert = useGmAlert(pendingTotal, Boolean(auth.user) && table?.owner_id === auth.user?.id);
  // Guarda esta sala como a sessao atual (o menu do topo oferece "Voltar a mesa"); esquece se a pessoa perdeu o acesso.
  const userId = auth.user?.id;
  const approved = members.find(m => m.user_id === userId)?.status === 'approved';
  useEffect(() => {
    if (!userId) return;
    if (room.ready && table && approved) setLastRoom(userId, id, table.name);
    else if (table === null || (members.length && !approved)) clearLastRoom(id);
  }, [userId, id, room.ready, table, approved, members.length]);

  if (auth.loading) return <main className="page"><p className="muted">Verificando sessão…</p></main>;
  if (!auth.user) return <main className="page"><p className="muted">Entre para acessar a sala.</p><button className="primary" onClick={() => loginThen(`/sala/${id}`)}>Entrar</button></main>;
  if (table === undefined) return <main className="page"><p className="muted">Carregando a sala…</p></main>;
  if (!table) return <main className="page"><p className="muted">{error || 'Mesa não encontrada ou sem acesso.'}</p><button className="outline" onClick={() => navigate('/mesas')}>← Mesas</button></main>;
  const me = members.find(m => m.user_id === auth.user.id);
  if (!me || me.status !== 'approved') return <main className="page">
    <p className="muted">Você ainda não foi aprovado nesta mesa.</p>
    <button className="outline" onClick={() => navigate(`/mesa/${id}`)}>Ver a mesa</button>
  </main>;

  const isGm = table.owner_id === auth.user.id;
  const closed = table.status === 'closed';
  const onlineIds = new Set(online.map(p => p.user_id));
  const roster = members.filter(m => m.status === 'approved');
  const tabs = [
    ['chat', 'Chat'], ['dice', 'Dados'], ['party', isGm ? 'Grupo' : 'Fichas'],
    ...(isGm ? [['items', pendingTotal ? `Aprovações (${pendingTotal})` : 'Aprovações']] : []),
    ['table', isGm ? 'Administração' : 'Mesa'],
  ];
  const activeTab = immersive ? 'dice' : tabs.some(([key]) => key === tab) ? tab : 'chat';
  const run = async fn => {
    setCtrlError('');
    try { await fn(); } catch (err) { setCtrlError(err.message); }
  };
  function jumpToPanel(key) {
    setTab(key);
    document.getElementById(`room-tab-${key}`)?.focus();
    document.getElementById('room-tools')?.scrollIntoView({ block: 'start' });
  }
  function handleTabKey(event, index) {
    const n = tabs.length;
    const next = {
      ArrowRight: (index + 1) % n,
      ArrowLeft: (index + n - 1) % n,
      Home: 0,
      End: n - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const [key] = tabs[next];
    setTab(key);
    document.getElementById(`room-tab-${key}`)?.focus();
  }

  return <TableExtrasContext.Provider value={extras}><main className={`room${immersive ? ' room-immersive' : ''}${docks.party ? ' dock-party-open' : ''}${docks.dice ? ' dock-dice-open' : ''}`}>
    {immersive && <nav className="immersive-toolbar" inert={Boolean(overlayDock)} aria-label="Painéis do tabuleiro">
      <button type="button" className="outline" ref={node=>{dockButtons.current.party=node;}} aria-controls="immersive-party" aria-expanded={docks.party} onClick={()=>toggleDock('party')}>{isGm?'Grupo':'Fichas'}</button>
      <button type="button" className="outline" ref={node=>{dockButtons.current.dice=node;}} aria-controls="room-tools" aria-expanded={docks.dice} onClick={()=>toggleDock('dice')}>Dados e histórico</button>
      <button ref={fullscreenButton} type="button" className="outline" onClick={exitImmersive}>Sair da tela cheia</button>
    </nav>}
    {immersive && <aside className="immersive-party" id="immersive-party" hidden={!docks.party}
      ref={node=>{dockPanels.current.party=node;}} role={overlayDock==='party'?'dialog':undefined}
      aria-modal={overlayDock==='party'||undefined} onKeyDown={containDockFocus} aria-label={isGm?'Grupo':'Fichas'}>
      <div className="row"><h2>{isGm?'Grupo':'Fichas'}</h2><button type="button" className="quiet" onClick={()=>closeDock('party')}>Recolher</button></div>
      <PartyPanel tableId={id} me={auth.user.id} isGm={isGm} members={members} characters={characters} states={states} patchState={room.patchState} closed={closed} />
    </aside>}
    <nav className="room-quick-nav" aria-label="Ações rápidas da sala">
      <button type="button" className="outline" onClick={() => jumpToPanel('chat')}>Chat</button>
      <button type="button" className="outline" onClick={() => jumpToPanel('dice')}>Dados</button>
      {isGm && <button type="button" className="outline" onClick={() => jumpToPanel('items')}>{tabs.find(([key]) => key === 'items')[1]}</button>}
    </nav>
    <aside className="room-side">
      <p className="eyebrow">{STATUS_LABEL[table.status].toUpperCase()}</p>
      <h2>{table.name}</h2>
      {clock.available && clock.tick != null && <p className="room-clock"><span className="muted">Campanha</span><strong>{formatClock(clock.tick)}</strong></p>}
      <TrainingButton tableId={id} me={auth.user.id} isGm={isGm} members={members} characters={characters} closed={closed} />
      <p className="muted">Mestre: {table.profiles?.display_name} · Savage Worlds</p>
      <p className="muted"><span className={`dot ${connected ? 'on' : 'off'}`} aria-hidden="true" /> {connected ? 'Conectado' : 'Conectando…'}</p>
      <h3>Jogadores</h3>
      <ul className="roster">
        {roster.map(m => <li key={m.user_id}>
          <span className={`dot ${onlineIds.has(m.user_id) ? 'on' : 'off'}`} aria-label={onlineIds.has(m.user_id) ? 'online' : 'offline'} />
          {m.profiles?.display_name}
          {m.role === 'gm' && <span className="badge">Mestre</span>}
        </li>)}
      </ul>
      <button className="outline" onClick={() => navigate('/mesas')}>← Mesas</button>
      {error && <p role="alert" className="muted">{error}</p>}
    </aside>
    <section className="room-board" aria-label="Tabuleiro" inert={Boolean(overlayDock)}>
      <BoardView tableId={id} me={auth.user.id} members={members} characters={characters} isGm={isGm} closed={closed} room={room} boardState={boardState} sheets={sheets} auth={auth} campaign={{ name: table.name, gmName: table.profiles?.display_name || '', clock: clock.available && clock.tick != null ? formatClock(clock.tick) : '' }} fullscreenAction={!immersive && <button ref={fullscreenButton} type="button" className="outline" onClick={enterImmersive}>Tela cheia</button>} diceSettings={diceSettings} markAnimating={markAnimating} immersive={immersive}
        logSlot={<div className="room-table-log"><TableLog messages={messages} rolls={rolls} stateLog={room.stateLog} rewards={room.rewards} hidden={hidden} members={members} characters={characters} me={auth.user.id} isGm={isGm} /></div>} />
    </section>
    <aside className="room-panel" id="room-tools" hidden={immersive && !docks.dice}
      ref={node=>{dockPanels.current.dice=node;}} role={overlayDock==='dice'?'dialog':undefined}
      aria-modal={overlayDock==='dice'||undefined} aria-labelledby={overlayDock==='dice'?'immersive-dice-title':undefined} onKeyDown={containDockFocus}>
      {immersive && <div className="row"><h2 id="immersive-dice-title">Dados</h2><button type="button" className="quiet" onClick={()=>closeDock('dice')}>Recolher</button></div>}
      {!immersive && <div className="tabs-row" role="tablist" aria-label="Ferramentas da sala">
        {tabs.map(([key, label], index) => <button key={key} type="button" role="tab"
          id={`room-tab-${key}`} aria-controls="room-tool-panel" aria-selected={activeTab === key}
          tabIndex={activeTab === key ? 0 : -1} className={activeTab === key ? 'primary' : 'outline'}
          onClick={() => setTab(key)} onKeyDown={event => handleTabKey(event, index)}>{label}</button>)}
      </div>}
      {closed && <p className="callout">Esta mesa foi encerrada. O histórico continua visível, mas ninguém pode escrever.</p>}
      {ctrlError && <p role="alert" className="muted">{ctrlError}</p>}
      <div id="room-tool-panel" className="room-tool-panel" role={immersive ? "region" : "tabpanel"} aria-labelledby={immersive ? "immersive-dice-title" : `room-tab-${activeTab}`}>
      {activeTab === 'items' && isGm ? <>
          <GmAlertToggle alert={gmAlert} total={pendingTotal} />
          <JoinApprovals table={table} members={members} reload={room.reload} run={run} />
          <TrainingApprovals part="pending" tableId={id} me={auth.user.id} members={members} characters={characters} closed={closed} pending={trainingRequests.pending} approved={trainingRequests.approved} available={trainingRequests.available} refresh={trainingRequests.refresh} />
          <RequestApprovals requests={requests} members={members} characters={characters} closed={closed} />
          <SkillApprovals items={skillRequests.items} available={skillRequests.available} refresh={skillRequests.refresh} members={members} characters={characters} />
          <ItemApprovals items={itemRequests.items} available={itemRequests.available} refresh={itemRequests.refresh} members={members} characters={characters} />
          <TrainingApprovals part="decided" tableId={id} me={auth.user.id} members={members} characters={characters} closed={closed} pending={trainingRequests.pending} approved={trainingRequests.approved} available={trainingRequests.available} refresh={trainingRequests.refresh} />
        </>
        : activeTab === 'table' ? <TableControls table={table} me={me} members={members}
          reload={room.reload} isGm={isGm} run={run} showJoinApprovals={false} />
        : activeTab === 'dice' ? <>
        <DicePanel tableId={id} me={auth.user.id} members={members} characters={characters} states={states} onRolled={room.addRoll} disabled={closed} settings={diceSettings} onSettings={setDiceSettings} />
        <h3>Histórico</h3>
        <RollHistory rolls={rolls} hidden={hidden} members={members} me={auth.user.id} />
      </>
        : activeTab === 'chat'
        ? <ChatPanel tableId={id} me={auth.user.id} members={members} messages={messages} addMessage={room.addMessage} disabled={closed} />
        : <PartyPanel tableId={id} me={auth.user.id} isGm={isGm} members={members} characters={characters} states={states} patchState={room.patchState} closed={closed} />}
      </div>
    </aside>
  </main></TableExtrasContext.Provider>;
}
