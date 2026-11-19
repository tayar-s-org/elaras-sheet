import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase.js';
import { loadExtras } from '../../../lib/masterHub.js';
import { loadCharacterState } from '../../../lib/room.js';
import { conditionsOf } from '../../../tokenState.js';

// Moedas, carteiras e tipos/contadores de experiência da mesa: UMA cópia por sala (provedor em RoomPage), lida do servidor e
// mantida por Realtime — Central, painel da ficha, Grupo e ficha consomem a mesma. Sem atualização otimista: toda mudança vem do
// servidor (evento Realtime, releitura ao reconectar/voltar o foco e uma releitura de segurança a cada 30 s).
// A RLS já filtra: o dono só recebe as próprias carteiras/contadores; o mestre recebe todos.
export const EXTRAS_EMPTY = { currencies: [], types: [], shop: [], wallets: {}, experience: {} };
export const TableExtrasContext = createContext(null);
// Cada uso do hook abre o PRÓPRIO canal Realtime: o Supabase devolve o canal existente quando o nome repete, e registrar eventos num canal já
// assinado derruba o app (ex.: o resumo da ficha e o Mercado, na mesma página). Por isso o nome leva um sufixo único por uso.
let channelSeq = 0;
const uniqueName = base => `${base}:${(channelSeq += 1).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const useExtras = () => useContext(TableExtrasContext) || { ...EXTRAS_EMPTY, status: 'off', refresh: async () => {} };

export function useTableExtras(tableId, enabled) {
  const [state, setState] = useState({ ...EXTRAS_EMPTY, status: 'loading' });
  const alive = useRef(true);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    if (!supabase || !tableId) return;
    try {
      const data = await loadExtras(tableId);
      if (!alive.current) return;
      if (!data) { setState(prev => (prev.status === 'unavailable' ? prev : { ...EXTRAS_EMPTY, status: 'unavailable' })); return; }
      setState(prev => (prev.status === 'ready' && JSON.stringify(prev.data) === JSON.stringify(data) ? prev : { ...data, data, status: 'ready' }));
    } catch (e) {
      if (alive.current) setState(prev => (prev.status === 'ready' ? prev : { ...prev, status: 'error', error: e.message }));
    }
  }, [tableId]);

  useEffect(() => {
    alive.current = true;
    if (!supabase || !enabled || !tableId) return undefined;
    const soon = (ms = 250) => { clearTimeout(timer.current); timer.current = setTimeout(refresh, ms); };
    refresh();
    const channel = supabase.channel(uniqueName(`extras:${tableId}`));
    for (const table of ['table_currencies', 'character_wallets', 'table_experience_types', 'character_experience', 'table_shop_items']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `table_id=eq.${tableId}` }, () => soon());
    }
    channel.subscribe(status => { if (status === 'SUBSCRIBED') soon(0); }); // (re)conectou: relê tudo
    const poll = setInterval(refresh, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') soon(0); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [tableId, enabled, refresh]);

  return { currencies: state.currencies, types: state.types, shop: state.shop || [], wallets: state.wallets, experience: state.experience, status: state.status, error: state.error, refresh };
}

// Página da ficha (fora da sala): condições do personagem na mesa dele, do mesmo lugar que o token e o Grupo leem
// (table_character_state.state.conditions), com Realtime.
export function useCharacterConditions(tableId, characterId) {
  const [conditions, setConditions] = useState([]);
  useEffect(() => {
    if (!supabase || !tableId || !characterId) { setConditions([]); return undefined; }
    let live = true;
    const pull = () => loadCharacterState(tableId, characterId).then(state => { if (live) setConditions(prev => (JSON.stringify(prev) === JSON.stringify(conditionsOf(state)) ? prev : conditionsOf(state))); }).catch(() => {});
    pull();
    const channel = supabase.channel(uniqueName(`conditions:${characterId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_character_state', filter: `character_id=eq.${characterId}` }, pull)
      .subscribe(status => { if (status === 'SUBSCRIBED') pull(); });
    const poll = setInterval(pull, 30000);
    return () => { live = false; clearInterval(poll); supabase.removeChannel(channel); };
  }, [tableId, characterId]);
  return conditions;
}
