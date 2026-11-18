import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import { claimMoney } from '../../lib/money.js';
import { editSheet } from '../../sheets.js';
import { addMoney, formatMoney } from '../../money.js';

// Soma na ficha do jogador o dinheiro que o mestre adicionou. Recolhe ao abrir, quando chega uma concessao nova
// (tempo real), quando a aba volta ao foco e a cada 15 s por garantia. O valor so e marcado como recebido
// quando o app o soma; o rascunho local guarda o resultado mesmo se a aba fechar antes do salvamento automatico.
export function useMoneyClaims(session, setSession, user, notify) {
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const busy = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    if (!supabase || !user) return undefined;
    let alive = true;
    let disabled = false;
    const claimAll = async () => {
      if (disabled) return;
      if (busy.current) { again.current = true; return; }
      busy.current = true;
      try {
        for (const sheet of sessionRef.current.sheets) {
          const id = sheet.cloud?.id;
          if (!id || !alive) continue;
          try {
            const gained = await claimMoney(id);
            if (gained !== 0 && alive) {
              setSession(prev => editSheet(prev, sheet.id, ch => ({ ...ch, money: addMoney(ch.money, gained) })));
              const who = sheet.character.name ? ` de ${sheet.character.name}` : '';
              notifyRef.current?.(gained > 0
                ? `💰 Você recebeu $${formatMoney(gained)} do mestre${sheet.character.name ? ` para ${sheet.character.name}` : ''}.`
                : `💸 O mestre removeu $${formatMoney(-gained)}${who}. Saldo: $${formatMoney(addMoney(sheet.character.money, gained))}.`);
            }
          } catch (error) {
            if (/migration 0012/i.test(error.message)) { disabled = true; return; }  // recurso ainda nao instalado: nao insiste
          }
        }
      } finally {
        busy.current = false;
        if (again.current && alive && !disabled) { again.current = false; claimAll(); }
      }
    };
    const first = setTimeout(claimAll, 2500);
    const timer = setInterval(claimAll, 15000);
    const channel = supabase.channel(`money:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'money_awards' }, () => claimAll())
      .subscribe();
    const onVisible = () => { if (document.visibilityState === 'visible') claimAll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [user?.id, setSession]);
}
