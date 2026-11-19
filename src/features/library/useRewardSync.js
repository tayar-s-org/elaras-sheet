import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import { listMine, getCharacter } from '../../lib/cloud.js';
import { applyRewardSync } from '../../sheetRebase.js';
import { formatMoney, addMoney } from '../../money.js';

// XP e dinheiro que o mestre concede são aplicados direto na ficha, na nuvem (migração 0035), mesmo com o app do jogador
// fechado. Este gancho traz essa mudança para as fichas abertas: logo que chega a concessão (tempo real), ao voltar o foco
// da aba e a cada 10 s por garantia. Fichas com edições pendentes recebem só a diferença de XP/dinheiro (sheetRebase.js).
export function useRewardSync(session, setSession, user, notify) {
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const busy = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    if (!supabase || !user) return undefined;
    let alive = true;
    let debounce = null;
    const sync = async () => {
      if (busy.current) { again.current = true; return; }
      busy.current = true;
      try {
        const mine = await listMine();
        const rows = [];
        for (const item of mine) {
          const sheet = sessionRef.current.sheets.find(s => s.cloud?.id === item.id);
          if (sheet && item.revision > sheet.cloud.revision) rows.push(await getCharacter(item.id));
        }
        if (!rows.length || !alive) return;
        const { gains } = applyRewardSync(sessionRef.current, rows);
        setSession(prev => applyRewardSync(prev, rows).session);
        for (const g of gains) {
          const who = g.name ? ` (${g.name})` : '';
          if (g.xp > 0) {
            const before = Math.floor((Number(g.before?.xp) || 0) / 5);
            const after = Math.floor(((Number(g.before?.xp) || 0) + g.xp) / 5);
            const up = after > before ? ` Subiu para o nível ${after}: +${(after - before) * 2} pontos de progressão!` : '';
            notifyRef.current?.(`${g.name || 'Sua ficha'} recebeu ${g.xp} XP do mestre.${up}`);
          }
          if (g.xp < 0) notifyRef.current?.(`${g.name || 'Sua ficha'} perdeu ${-g.xp} XP (removido pelo mestre).`);
          if (g.money > 0) notifyRef.current?.(`💰 Você recebeu $${formatMoney(g.money)} do mestre${who}.`);
          if (g.money < 0) notifyRef.current?.(`💸 O mestre removeu $${formatMoney(-g.money)}${who}. Saldo: $${formatMoney(addMoney(g.before?.money, g.money))}.`);
        }
      } catch { /* sem rede ou migração pendente: tenta de novo no próximo ciclo */ }
      finally {
        busy.current = false;
        if (again.current && alive) { again.current = false; sync(); }
      }
    };
    const soon = (ms = 200) => { clearTimeout(debounce); debounce = setTimeout(sync, ms); };
    const first = setTimeout(sync, 2000);
    const timer = setInterval(sync, 10000);
    const channel = supabase.channel(`rewardsync:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'xp_awards' }, () => soon())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'money_awards' }, () => soon())
      .subscribe();
    const onVisible = () => { if (document.visibilityState === 'visible') soon(0); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearTimeout(first);
      clearTimeout(debounce);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [user?.id, setSession]);
}
