import React, { useCallback, useEffect, useState } from 'react';
import { navigate } from '../../lib/router.js';
import { STATUS_LABEL } from '../../lib/tables.js';
import { useRoom } from './useRoom.js';
import ChatPanel from './ChatPanel.jsx';
import PartyPanel from './PartyPanel.jsx';
import DicePanel, { RollHistory } from './DicePanel.jsx';
import BoardView from './BoardView.jsx';
import TableControls from '../tables/TableControls.jsx';
import TableLog from './TableLog.jsx';
import TrainingButton from './TrainingButton.jsx';
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
import { useClock } from '../routine/useClock.js';
import { formatClock } from '../../rpg/clock.js';
import '../routine/routine.css';

const SETTINGS_KEY = 'elara-dice3d';
const loadSettings = () => {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  try { return { anim: !reduced, sound: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { anim: !reduced, sound: true }; }
};

export default function RoomPage({ auth, id }) {
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
  const requests = useRequests(id, Boolean(room.ready) && table?.owner_id === auth.user?.id);
  const trainingRequests = useTrainingApprovals(id, Boolean(room.ready) && table?.owner_id === auth.user?.id);
  // Guarda esta sala como a sessao atual (o menu do topo oferece "Voltar a mesa"); esquece se a pessoa perdeu o acesso.
  const userId = auth.user?.id;
  const approved = members.find(m => m.user_id === userId)?.status === 'approved';
  useEffect(() => {
    if (!userId) return;
    if (room.ready && table && approved) setLastRoom(userId, id, table.name);
    else if (table === null || (members.length && !approved)) clearLastRoom(id);
  }, [userId, id, room.ready, table, approved, members.length]);

  if (auth.loading) return <main className="page"><p className="muted">Verificando sessão…</p></main>;
  if (!auth.user) return <main className="page"><p className="muted">Entre para acessar a sala.</p><button className="primary" onClick={() => navigate('/entrar')}>Entrar</button></main>;
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
  return <main className="room">
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
    <section className="room-board" aria-label="Tabuleiro">
      <BoardView tableId={id} me={auth.user.id} members={members} characters={characters} isGm={isGm} closed={closed} room={room} boardState={boardState} diceSettings={diceSettings} markAnimating={markAnimating}
        logSlot={<TableLog messages={messages} rolls={rolls} stateLog={room.stateLog} rewards={room.rewards} hidden={hidden} members={members} characters={characters} me={auth.user.id} isGm={isGm} />} />
    </section>
    <aside className="room-panel">
      <div className="tabs-row" role="tablist">
        <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'primary' : 'outline'} onClick={() => setTab('chat')}>Chat</button>
        <button role="tab" aria-selected={tab === 'dice'} className={tab === 'dice' ? 'primary' : 'outline'} onClick={() => setTab('dice')}>Dados</button>
        <button role="tab" aria-selected={tab === 'party'} className={tab === 'party' ? 'primary' : 'outline'} onClick={() => setTab('party')}>{isGm ? 'Grupo' : 'Fichas'}</button>
        {isGm && <button role="tab" aria-selected={tab === 'items'} className={tab === 'items' ? 'primary' : 'outline'} onClick={() => setTab('items')}>Aprovações{itemRequests.pending + trainingRequests.pending.length + requests.pending.length + skillRequests.pending > 0 ? ` (${itemRequests.pending + trainingRequests.pending.length + requests.pending.length + skillRequests.pending})` : ''}</button>}
        <button role="tab" aria-selected={tab === 'table'} className={tab === 'table' ? 'primary' : 'outline'} onClick={() => setTab('table')}>Mesa</button>
      </div>
      {closed && <p className="callout">Esta mesa foi encerrada. O histórico continua visível, mas ninguém pode escrever.</p>}
      {tab === 'items' && isGm ? <>
          <TrainingApprovals part="pending" tableId={id} me={auth.user.id} members={members} characters={characters} closed={closed} pending={trainingRequests.pending} approved={trainingRequests.approved} available={trainingRequests.available} refresh={trainingRequests.refresh} />
          <RequestApprovals requests={requests} members={members} characters={characters} closed={closed} />
          <SkillApprovals items={skillRequests.items} available={skillRequests.available} refresh={skillRequests.refresh} members={members} characters={characters} />
          <ItemApprovals items={itemRequests.items} available={itemRequests.available} refresh={itemRequests.refresh} members={members} characters={characters} />
          <TrainingApprovals part="decided" tableId={id} me={auth.user.id} members={members} characters={characters} closed={closed} pending={trainingRequests.pending} approved={trainingRequests.approved} available={trainingRequests.available} refresh={trainingRequests.refresh} />
        </>
        : tab === 'table' ? <>
        {ctrlError && <p role="alert" className="muted">{ctrlError}</p>}
        <TableControls table={table} me={me} members={members} reload={room.reload} isGm={isGm}
          run={async fn => { setCtrlError(''); try { await fn(); } catch (e) { setCtrlError(e.message); } }} />
      </>
        : tab === 'dice' ? <>
        <DicePanel tableId={id} me={auth.user.id} members={members} characters={characters} onRolled={room.addRoll} disabled={closed} settings={diceSettings} onSettings={setDiceSettings} />
        <h3>Histórico</h3>
        <RollHistory rolls={rolls} hidden={hidden} members={members} me={auth.user.id} />
      </>
        : tab === 'chat'
        ? <ChatPanel tableId={id} me={auth.user.id} members={members} messages={messages} addMessage={room.addMessage} disabled={closed} />
        : <PartyPanel tableId={id} me={auth.user.id} isGm={isGm} members={members} characters={characters} states={states} patchState={room.patchState} closed={closed} />}
    </aside>
  </main>;
}
