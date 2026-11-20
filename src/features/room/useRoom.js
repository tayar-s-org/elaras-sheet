import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { getTable, getMembers } from '../../lib/tables.js';
import { recentMessages, recentRolls, recentStateLog, loadStates, loadCharacters } from '../../lib/room.js';
import { recentRewards } from '../../lib/rewards.js';
import { appendById, mergeById } from './liveBuffer.js';
import { createSnapshotGuard, reconcileByKey } from './snapshotGuard.js';
import { pollWhileVisible } from './polling.js';

const fetchHistory = async tableId => {
  const [messages, states, rolls, stateLog] = await Promise.all([recentMessages(tableId), loadStates(tableId), recentRolls(tableId), recentStateLog(tableId)]);
  return { messages, states, rolls, stateLog };
};

// Carrega a mesa e mantem mensagens, estados, membros e presenca sincronizados em tempo real.
export function useRoom(tableId, user, displayName) {
  const [table, setTable] = useState(undefined);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [rolls, setRolls] = useState([]);
  const [rollsCaughtUpTo, setRollsCaughtUpTo] = useState(0); // maior rolagem recuperada pela reconciliacao (historico, nao rolagem nova)
  const [stateLog, setStateLog] = useState([]);
  const [rewards, setRewards] = useState({ xp: [], money: [], custom: [] });
  const [ready, setReady] = useState(false);
  const [states, setStates] = useState({});
  const [characters, setCharacters] = useState({});
  const [online, setOnline] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const channelRef = useRef(null);
  const listeners = useRef({});
  const nameRef = useRef(displayName);
  nameRef.current = displayName;
  const [historyGuard] = useState(createSnapshotGuard); // chave = id da ficha cujo estado o tempo real (ou o jogador) alterou
  const [membersGuard] = useState(createSnapshotGuard);

  // As fichas lidas aqui sao so a primeira leitura; useLiveCharacters as mantem atualizadas.
  const reloadMembers = useCallback(async () => {
    const ticket = membersGuard.begin();
    const list = await getMembers(tableId);
    if (!membersGuard.isLatest(ticket)) return list;
    setMembers(list);
    const ids = list.filter(m => m.status === 'approved' && m.character_id).map(m => m.character_id);
    const loaded = await loadCharacters(ids);
    if (membersGuard.isLatest(ticket)) setCharacters(loaded);
    return list;
  }, [tableId, membersGuard]);

  useEffect(() => {
    if (!supabase || !user) return undefined;
    let alive = true;
    let channel;
    setReady(false);
    setMessages([]);
    setRolls([]);
    setStateLog([]);
    setStates({});
    const applyRealtimeState = row => {
      historyGuard.touch(row.character_id);
      setStates(prev => ({ ...prev, [row.character_id]: row.state }));
    };
    // Leitura inicial e reconciliacao apos reconexao sao a mesma operacao: o historico lido se junta ao que o tempo real ja trouxe.
    // Devolve false se a resposta foi descartada (sala fechada ou leitura mais nova em andamento).
    const reconcileHistory = async () => {
      const ticket = historyGuard.begin();
      const history = await fetchHistory(tableId);
      if (!alive || !historyGuard.isLatest(ticket)) return false;
      setMessages(prev => mergeById(prev, history.messages));
      setRolls(prev => mergeById(prev, history.rolls));
      setRollsCaughtUpTo(prev => history.rolls.reduce((max, r) => Math.max(max, r.id), prev));
      if (history.stateLog) setStateLog(prev => mergeById(prev, history.stateLog));
      setStates(prev => reconcileByKey(history.states, prev, characterId => historyGuard.touchedAfter(ticket, characterId)));
      return true;
    };
    // A leitura inicial acontece depois de o canal estar assinado, para nenhum evento se perder entre a leitura e a assinatura.
    let historyLoaded = false;
    const syncHistory = () => reconcileHistory().then(applied => {
      if (!applied) return;
      historyLoaded = true;
      setReady(true);
    }).catch(e => { if (alive && !historyLoaded) setError(e.message); });
    const resync = () => {
      syncHistory();
      reloadMembers().catch(() => {});
    };
    (async () => {
      try {
        const t = await getTable(tableId);
        if (!alive) return;
        setTable(t);
        if (!t) return;
        const list = await reloadMembers();
        const me = list.find(m => m.user_id === user.id);
        if (!me || me.status !== 'approved') return;
        const stateLogAvailable = (await recentStateLog(tableId, 1)) !== null;
        if (!alive) return;
        channel = supabase.channel(`table:${tableId}`, { config: { private: true, presence: { key: user.id } } });
        channelRef.current = channel;
        // So assina o historico se a tabela existe (um binding para tabela inexistente derruba o canal inteiro).
        if (stateLogAvailable) channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'table_state_log', filter: `table_id=eq.${tableId}` },
          p => setStateLog(prev => appendById(prev, p.new)));
        channel
          .on('presence', { event: 'sync' }, () => setOnline(Object.values(channel.presenceState()).flat()))
          .on('broadcast', { event: 'drag' }, ({ payload }) => (listeners.current.drag || []).forEach(fn => fn(payload)))
          .on('broadcast', { event: 'board_refresh' }, ({ payload }) => (listeners.current.board_refresh || []).forEach(fn => fn(payload)))
          .on('broadcast', { event: 'sound' }, ({ payload }) => (listeners.current.sound || []).forEach(fn => fn(payload)))
          .on('broadcast', { event: 'sounds_refresh' }, ({ payload }) => (listeners.current.sounds_refresh || []).forEach(fn => fn(payload)))
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'table_messages', filter: `table_id=eq.${tableId}` },
            p => setMessages(prev => appendById(prev, p.new)))
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'table_rolls', filter: `table_id=eq.${tableId}` },
            p => setRolls(prev => appendById(prev, p.new)))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'table_character_state', filter: `table_id=eq.${tableId}` },
            p => p.new?.character_id && applyRealtimeState(p.new))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'table_members', filter: `table_id=eq.${tableId}` },
            () => reloadMembers().catch(() => {}))
          .subscribe(status => {
            if (!alive) return;
            setConnected(status === 'SUBSCRIBED');
            if (status === 'SUBSCRIBED') {
              setError('');
              channel.track({ user_id: user.id, name: nameRef.current, at: new Date().toISOString() });
              resync(); // leitura inicial e, nas reconexoes, eventos perdidos durante a queda
            }
            if (status === 'CHANNEL_ERROR') {
              setError('Conexão em tempo real indisponível. Recarregue a página.');
              if (!historyLoaded) syncHistory(); // sem tempo real a sala ainda mostra o historico
            }
          });
      } catch (e) { if (alive) { setError(e.message); setTable(prev => (prev === undefined ? null : prev)); } }
    })();
    return () => { alive = false; channelRef.current = null; if (channel) supabase.removeChannel(channel); };
  }, [tableId, user?.id, reloadMembers, historyGuard]);

  // `tables` nao esta na publicacao do Realtime (assinar derrubaria todos os eventos do canal); consulta o estado de tempos em tempos.
  useEffect(() => {
    if (!supabase || !user || !ready) return undefined;
    return pollWhileVisible(() => { getTable(tableId).then(next => next && setTable(next)).catch(() => {}); }, 20000);
  }, [tableId, user?.id, ready]);

  // Historico de XP e dinheiro: consulta de tempos em tempos (as concessoes chegam pelo mestre, pelo mercado e pelo trabalho).
  useEffect(() => {
    if (!supabase || !user || !ready) return undefined;
    let alive = true;
    const load = () => recentRewards(tableId).then(next => alive && setRewards(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))).catch(() => {});
    load();
    const stopPolling = pollWhileVisible(load, 8000);
    return () => { alive = false; stopPolling(); };
  }, [tableId, user?.id, ready]);

  // Recarrega mesa e membros (usado pelos controles da mesa dentro da sala).
  const reload = useCallback(async () => {
    const t = await getTable(tableId);
    if (t) setTable(t);
    await reloadMembers();
  }, [tableId, reloadMembers]);

  const sendBroadcast = useCallback((event, payload) => { channelRef.current?.send({ type: 'broadcast', event, payload }); }, []);
  const onBroadcast = useCallback((event, fn) => {
    (listeners.current[event] ||= []).push(fn);
    return () => { listeners.current[event] = listeners.current[event].filter(f => f !== fn); };
  }, []);
  const addMessage = useCallback(m => setMessages(prev => appendById(prev, m)), []);
  const addRoll = useCallback(r => setRolls(prev => appendById(prev, r)), []);
  // Atualização local de vida/stamina/mana/desmaio. As condições (state.conditions) só mudam por RPC do mestre: nunca são sobrescritas aqui.
  const patchState = useCallback((characterId, state) => {
    historyGuard.touch(characterId);
    setStates(prev => ({ ...prev, [characterId]: { ...state, ...(prev[characterId]?.conditions ? { conditions: prev[characterId].conditions } : {}) } }));
  }, [historyGuard]);
  return { stateLog, rewards, ready, reload, sendBroadcast, onBroadcast, table, members, messages, rolls, rollsCaughtUpTo, addRoll, states, characters, online, connected, error, addMessage, patchState };
}
