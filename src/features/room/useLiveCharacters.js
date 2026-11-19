import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { loadCharacters } from '../../lib/room.js';

const POLL_MS = 5000;

// Mantém atualizadas as fichas dos jogadores vinculados à mesa (dinheiro, XP, dados...). Elas pertencem aos
// jogadores e não têm tempo real próprio, então: relê a cada 10 s, ao voltar o foco da aba e logo depois que
// um dinheiro é recolhido (o jogador salva a ficha ~1 s depois de receber) ou o mestre concede XP/dinheiro (a nuvem muda na hora). Devolve as fichas da sala já mescladas.
export function useLiveCharacters(tableId, members, base, enabled) {
  const [fresh, setFresh] = useState({});
  const ids = useMemo(
    () => members.filter(m => m.status === 'approved' && m.character_id).map(m => m.character_id).sort().join(','),
    [members],
  );

  useEffect(() => {
    if (!supabase || !enabled || !ids) return undefined;
    let alive = true;
    const timers = new Set();
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const rows = await loadCharacters(ids.split(','));
        if (alive) setFresh(prev => (JSON.stringify(prev) === JSON.stringify(rows) ? prev : rows));
      } catch { /* mantém o que já está na tela */ }
    };
    const later = ms => { const t = setTimeout(() => { timers.delete(t); refresh(); }, ms); timers.add(t); };
    const first = setTimeout(refresh, 1500);
    const poll = setInterval(refresh, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    // Dinheiro recolhido pelo jogador (UPDATE em money_awards): relê depois que ele salvar a ficha.
    const channel = supabase.channel(`livechars:${tableId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'money_awards', filter: `table_id=eq.${tableId}` }, () => { later(2500); later(6000); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'money_awards', filter: `table_id=eq.${tableId}` }, () => later(400))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'xp_awards', filter: `table_id=eq.${tableId}` }, () => later(400))
      .subscribe();
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(poll);
      timers.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [tableId, ids, enabled]);

  return useMemo(() => ({ ...base, ...fresh }), [base, fresh]);
}
