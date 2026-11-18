import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { getTable, getMembers } from '../../lib/tables.js';
import { recentMessages, recentRolls, loadStates, loadCharacters } from '../../lib/room.js';

// Carrega a mesa e mantem mensagens, estados, membros e presenca sincronizados em tempo real.
export function useRoom(tableId, user, displayName) {
  const [table, setTable] = useState(undefined);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [rolls, setRolls] = useState([]);
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

  const reloadMembers = useCallback(async () => {
    const list = await getMembers(tableId);
    setMembers(list);
    const ids = list.filter(m => m.status === 'approved' && m.character_id).map(m => m.character_id);
    setCharacters(await loadCharacters(ids));
    return list;
  }, [tableId]);

  useEffect(() => {
    if (!supabase || !user) return undefined;
    let alive = true;
    let channel;
    (async () => {
      try {
        const t = await getTable(tableId);
        if (!alive) return;
        setTable(t);
        if (!t) return;
        const list = await reloadMembers();
        const me = list.find(m => m.user_id === user.id);
        if (!me || me.status !== 'approved') return;
        const [msgs, st, rl] = await Promise.all([recentMessages(tableId), loadStates(tableId), recentRolls(tableId)]);
        if (!alive) return;
        setMessages(msgs);
        setStates(st);
        setRolls(rl);
        setReady(true);
        channel = supabase.channel(`table:${tableId}`, { config: { private: true, presence: { key: user.id } } });
        channelRef.current = channel;
        channel
          .on('presence', { event: 'sync' }, () => setOnline(Object.values(channel.presenceState()).flat()))
          .on('broadcast', { event: 'drag' }, ({ payload }) => (listeners.current.drag || []).forEach(fn => fn(payload)))
          .on('broadcast', { event: 'board_refresh' }, ({ payload }) => (listeners.current.board_refresh || []).forEach(fn => fn(payload)))
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'table_messages', filter: `table_id=eq.${tableId}` },
            p => setMessages(prev => prev.some(m => m.id === p.new.id) ? prev : [...prev, p.new]))
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'table_rolls', filter: `table_id=eq.${tableId}` },
            p => setRolls(prev => prev.some(r => r.id === p.new.id) ? prev : [...prev, p.new]))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'table_character_state', filter: `table_id=eq.${tableId}` },
            p => p.new?.character_id && setStates(prev => ({ ...prev, [p.new.character_id]: p.new.state })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'table_members', filter: `table_id=eq.${tableId}` },
            () => reloadMembers().catch(() => {}))
          .subscribe(status => {
            if (!alive) return;
            setConnected(status === 'SUBSCRIBED');
            if (status === 'SUBSCRIBED') setError('');
            if (status === 'SUBSCRIBED') channel.track({ user_id: user.id, name: nameRef.current, at: new Date().toISOString() });
            if (status === 'CHANNEL_ERROR') setError('Conexão em tempo real indisponível. Recarregue a página.');
          });
      } catch (e) { if (alive) { setError(e.message); setTable(prev => (prev === undefined ? null : prev)); } }
    })();
    return () => { alive = false; channelRef.current = null; if (channel) supabase.removeChannel(channel); };
  }, [tableId, user?.id, reloadMembers]);

  // `tables` nao esta na publicacao do Realtime (assinar derrubaria todos os eventos do canal); consulta o estado de tempos em tempos.
  useEffect(() => {
    if (!supabase || !user || !ready) return undefined;
    const timer = setInterval(() => { getTable(tableId).then(next => next && setTable(next)).catch(() => {}); }, 20000);
    return () => clearInterval(timer);
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
  const addMessage = useCallback(m => setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]), []);
  const addRoll = useCallback(r => setRolls(prev => prev.some(x => x.id === r.id) ? prev : [...prev, r]), []);
  const patchState = useCallback((characterId, state) => setStates(prev => ({ ...prev, [characterId]: state })), []);
  return { ready, reload, sendBroadcast, onBroadcast, table, members, messages, rolls, addRoll, states, characters, online, connected, error, addMessage, patchState };
}
