import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { loadClock } from '../../lib/clock.js';

const POLL_MS = 15000;

// Relógio compartilhado da mesa: todos veem a mesma data e hora. Atualiza na hora pelo Realtime
// (table_clock está na publicação) e confere de 15 em 15 s por garantia.
// Devolve { tick, available, refresh }; tick é null enquanto carrega e available é false sem a migration 0023.
export function useClock(tableId, enabled = true) {
  const [clock, setClock] = useState({ tick: null, available: true });
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    const c = await loadClock(tableId).catch(() => null);
    if (!alive.current) return;
    setClock(prev => (c ? (prev.tick === c.tick && prev.available ? prev : { tick: c.tick, available: true }) : { tick: prev.tick, available: false }));
  }, [tableId]);

  useEffect(() => {
    alive.current = true;
    if (!supabase || !enabled) return undefined;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    // Canal próprio: se a tabela ainda não estiver no Realtime só ele falha e a conferência periódica segue valendo.
    const channel = supabase.channel(`clock:${tableId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_clock', filter: `table_id=eq.${tableId}` }, p => {
        if (Number.isInteger(p.new?.tick)) setClock({ tick: p.new.tick, available: true }); else refresh();
      })
      .subscribe();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [tableId, enabled, refresh]);

  return { ...clock, refresh };
}
