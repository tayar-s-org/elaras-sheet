import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { loadClock } from '../../lib/clock.js';
import { createQueryGate, scopedValue } from '../../lib/queryGate.js';

const POLL_MS = 15000;
const LOADING = { tick: null, available: true };

// Relógio compartilhado da mesa: todos veem a mesma data e hora. Atualiza na hora pelo Realtime
// (table_clock está na publicação) e confere de 15 em 15 s por garantia.
// Devolve { tick, available, refresh }; tick é null enquanto carrega (inclusive ao trocar de mesa: o tick da mesa anterior nunca aparece)
// e available é false sem a migration 0023.
export function useClock(tableId, enabled = true) {
  const [entry, setEntry] = useState(null);
  const [gate] = useState(createQueryGate);
  const store = useCallback(value => setEntry({ identity: tableId, value }), [tableId]);
  const refresh = useCallback(async () => {
    const isCurrent = gate.begin();
    const c = await loadClock(tableId).catch(() => null);
    if (!isCurrent()) return;
    setEntry(prev => {
      const before = scopedValue(prev, tableId, LOADING);
      if (!c) return { identity: tableId, value: { tick: before.tick, available: false } };
      return before.tick === c.tick && before.available ? prev : { identity: tableId, value: { tick: c.tick, available: true } };
    });
  }, [tableId, gate]);

  useEffect(() => {
    if (!supabase || !enabled) return undefined;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    // Canal próprio: se a tabela ainda não estiver no Realtime só ele falha e a conferência periódica segue valendo.
    const channel = supabase.channel(`clock:${tableId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_clock', filter: `table_id=eq.${tableId}` }, p => {
        gate.invalidate(); // o evento é mais novo que qualquer consulta em voo
        if (Number.isInteger(p.new?.tick)) store({ tick: p.new.tick, available: true }); else refresh();
      })
      .subscribe();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      gate.invalidate();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [tableId, enabled, refresh, gate, store]);

  return { ...scopedValue(entry, tableId, LOADING), refresh };
}
