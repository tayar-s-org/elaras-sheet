import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { getTable, getMembers } from '../../lib/tables.js';
import { recentMessages, loadStates, loadCharacters } from '../../lib/room.js';

// Carrega a mesa e mantem mensagens, estados, membros e presenca sincronizados em tempo real.
export function useRoom(tableId, user, displayName) {
  const [table, setTable] = useState(undefined);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [states, setStates] = useState({});
  const [characters, setCharacters] = useState({});
  const [online, setOnline] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
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
        const [msgs, st] = await Promise.all([recentMessages(tableId), loadStates(tableId)]);
        if (!alive) return;
        setMessages(msgs);
        setStates(st);
        channel = supabase.channel(`table:${tableId}`, { config: { private: true, presence: { key: user.id } } })
          .on('presence', { event: 'sync' }, () => setOnline(Object.values(channel.presenceState()).flat()))
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'table_messages', filter: `table_id=eq.${tableId}` },
            p => setMessages(prev => prev.some(m => m.id === p.new.id) ? prev : [...prev, p.new]))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'table_character_state', filter: `table_id=eq.${tableId}` },
            p => p.new?.character_id && setStates(prev => ({ ...prev, [p.new.character_id]: p.new.state })))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'table_members', filter: `table_id=eq.${tableId}` },
            () => reloadMembers().catch(() => {}))
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tables', filter: `id=eq.${tableId}` },
            () => getTable(tableId).then(next => alive && setTable(next)).catch(() => {}))
          .subscribe(status => {
            if (!alive) return;
            setConnected(status === 'SUBSCRIBED');
            if (status === 'SUBSCRIBED') channel.track({ user_id: user.id, name: nameRef.current, at: new Date().toISOString() });
            if (status === 'CHANNEL_ERROR') setError('Conexão em tempo real indisponível. Recarregue a página.');
          });
      } catch (e) { if (alive) { setError(e.message); setTable(prev => (prev === undefined ? null : prev)); } }
    })();
    return () => { alive = false; if (channel) supabase.removeChannel(channel); };
  }, [tableId, user?.id, reloadMembers]);

  const addMessage = useCallback(m => setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]), []);
  const patchState = useCallback((characterId, state) => setStates(prev => ({ ...prev, [characterId]: state })), []);
  return { table, members, messages, states, characters, online, connected, error, addMessage, patchState };
}
