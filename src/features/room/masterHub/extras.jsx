import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase.js';
import { loadExtras } from '../../../lib/masterHub.js';
import { loadCharacterState } from '../../../lib/room.js';
import { conditionsOf } from '../../../tokenState.js';
import { createQueryGate, scopedValue } from '../../../lib/queryGate.js';

// Moedas, carteiras e tipos/contadores de experiência da mesa: UMA cópia por sala (provedor em RoomPage), lida do servidor e
// mantida por Realtime — Central, painel da ficha, Grupo e ficha consomem a mesma. Sem atualização otimista: toda mudança vem do
// servidor (evento Realtime, releitura ao reconectar/voltar o foco e uma releitura de segurança a cada 30 s).
// A RLS já filtra: o dono só recebe as próprias carteiras/contadores; o mestre recebe todos.
export const EXTRAS_EMPTY = { currencies: [], types: [], shop: [], wallets: {}, experience: {} };
const NO_CONDITIONS = [];
const EXTRAS_LOADING = { ...EXTRAS_EMPTY, status: 'loading' };
export const TableExtrasContext = createContext(null);
// Cada uso do hook abre o PRÓPRIO canal Realtime: o Supabase devolve o canal existente quando o nome repete, e registrar eventos num canal já
// assinado derruba o app (ex.: o resumo da ficha e o Mercado, na mesma página). Por isso o nome leva um sufixo único por uso.
let channelSeq = 0;
const uniqueName = base => `${base}:${(channelSeq += 1).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const useExtras = () => useContext(TableExtrasContext) || { ...EXTRAS_EMPTY, status: 'off', refresh: async () => {} };

export function useTableExtras(tableId, enabled) {
  const [entry, setEntry] = useState(null);
  const [gate] = useState(createQueryGate);
  const state = scopedValue(entry, tableId, EXTRAS_LOADING); // ao trocar de mesa, nunca mostra moedas/carteiras da anterior
  const timer = useRef(null);

  const update = useCallback(change => setEntry(prev => {
    const before = scopedValue(prev, tableId, EXTRAS_LOADING);
    const next = change(before);
    return next === before ? prev : { identity: tableId, value: next };
  }), [tableId]);

  const refresh = useCallback(async () => {
    if (!supabase || !tableId) return;
    const isCurrent = gate.begin();
    try {
      const data = await loadExtras(tableId);
      if (!isCurrent()) return;
      if (!data) { update(prev => (prev.status === 'unavailable' ? prev : { ...EXTRAS_EMPTY, status: 'unavailable' })); return; }
      update(prev => (prev.status === 'ready' && JSON.stringify(prev.data) === JSON.stringify(data) ? prev : { ...data, data, status: 'ready' }));
    } catch (e) {
      if (isCurrent()) update(prev => (prev.status === 'ready' ? prev : { ...prev, status: 'error', error: e.message }));
    }
  }, [tableId, gate, update]);

  useEffect(() => {
    if (!supabase || !enabled || !tableId) return undefined;
    const soon = (ms = 250) => { clearTimeout(timer.current); timer.current = setTimeout(refresh, ms); };
    const onChange = () => { gate.invalidate(); soon(); }; // consultas em voo são anteriores ao evento: a releitura que ele agenda vale mais
    refresh();
    const channel = supabase.channel(uniqueName(`extras:${tableId}`));
    for (const table of ['table_currencies', 'character_wallets', 'table_experience_types', 'character_experience', 'table_shop_items']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `table_id=eq.${tableId}` }, onChange);
    }
    channel.subscribe(status => { if (status === 'SUBSCRIBED') soon(0); }); // (re)conectou: relê tudo
    const poll = setInterval(refresh, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') soon(0); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      gate.invalidate();
      clearTimeout(timer.current);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [tableId, enabled, refresh, gate]);

  return { currencies: state.currencies, types: state.types, shop: state.shop || [], wallets: state.wallets, experience: state.experience, status: state.status, error: state.error, refresh };
}

// Página da ficha (fora da sala): condições do personagem na mesa dele, do mesmo lugar que o token e o Grupo leem
// (table_character_state.state.conditions), com Realtime.
export function useCharacterConditions(tableId, characterId) {
  const [entry, setEntry] = useState(null);
  const [gate] = useState(createQueryGate);
  const identity = `${tableId}:${characterId}`;
  useEffect(() => {
    if (!supabase || !tableId || !characterId) return undefined;
    const pull = () => {
      const isCurrent = gate.begin(); // cada leitura invalida a anterior, inclusive as iniciadas antes de um evento Realtime
      return loadCharacterState(tableId, characterId).then(state => {
        if (!isCurrent()) return;
        const next = conditionsOf(state);
        setEntry(prev => (prev?.identity === identity && JSON.stringify(prev.value) === JSON.stringify(next) ? prev : { identity, value: next }));
      }).catch(() => {});
    };
    pull();
    const channel = supabase.channel(uniqueName(`conditions:${characterId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_character_state', filter: `character_id=eq.${characterId}` }, pull)
      .subscribe(status => { if (status === 'SUBSCRIBED') pull(); });
    const poll = setInterval(pull, 30000);
    return () => { gate.invalidate(); clearInterval(poll); supabase.removeChannel(channel); };
  }, [tableId, characterId, identity, gate]);
  return scopedValue(entry, identity, NO_CONDITIONS);
}
