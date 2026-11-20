import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { refreshCharacters } from '../../lib/room.js';
import { INVENTORY_EVENT } from '../../lib/items.js';
import { createCoalescedRunner, isTabHidden, pollWhileVisible } from './polling.js';

const POLL_MS = 5000;

// Única fonte de atualização das fichas dos jogadores vinculados à mesa (dinheiro, XP, dados...). Elas pertencem aos
// jogadores e não têm tempo real próprio, então: relê a cada 5 s com a aba visível, ao voltar o foco da aba e logo depois que
// um dinheiro é recolhido (o jogador salva a ficha ~1 s depois de receber) ou o mestre concede XP/dinheiro (a nuvem muda na hora).
// Pedidos que chegam durante uma leitura viram uma única releitura ao terminar. Devolve as fichas da sala já mescladas.
export function useLiveCharacters(tableId, members, base, enabled) {
  const [fresh, setFresh] = useState({});
  const freshRef = useRef(fresh);
  const ids = useMemo(
    () => members.filter(m => m.status === 'approved' && m.character_id).map(m => m.character_id).sort().join(','),
    [members],
  );

  useEffect(() => {
    if (!supabase || !enabled || !ids) return undefined;
    let alive = true;
    const timers = new Set();
    const characterIds = ids.split(',');
    const reload = createCoalescedRunner(async () => {
      try {
        const rows = await refreshCharacters(characterIds, freshRef.current); // baixa só as fichas cuja revisão mudou
        if (alive && rows !== freshRef.current) { freshRef.current = rows; setFresh(rows); }
      } catch { /* mantém o que já está na tela */ }
    });
    const reloadIfVisible = () => { if (!isTabHidden()) reload(); };
    const later = ms => { const t = setTimeout(() => { timers.delete(t); reloadIfVisible(); }, ms); timers.add(t); };
    const first = setTimeout(reloadIfVisible, 1500);
    const stopPolling = pollWhileVisible(reload, POLL_MS);
    // Dinheiro recolhido pelo jogador (UPDATE em money_awards): relê depois que ele salvar a ficha.
    const channel = supabase.channel(`livechars:${tableId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'money_awards', filter: `table_id=eq.${tableId}` }, () => { later(2500); later(6000); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'money_awards', filter: `table_id=eq.${tableId}` }, () => later(400))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'xp_awards', filter: `table_id=eq.${tableId}` }, () => later(400))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_log', filter: `table_id=eq.${tableId}` }, () => later(400)) // item entregue ou transferido
      .subscribe();
    const onInventory = () => later(150); // alguém mexeu na mochila pelo token nesta janela
    window.addEventListener(INVENTORY_EVENT, onInventory);
    return () => {
      alive = false;
      clearTimeout(first);
      stopPolling();
      timers.forEach(clearTimeout);
      window.removeEventListener(INVENTORY_EVENT, onInventory);
      supabase.removeChannel(channel);
    };
  }, [tableId, ids, enabled]);

  return useMemo(() => ({ ...base, ...fresh }), [base, fresh]);
}
