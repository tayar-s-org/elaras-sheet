import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import { claimEvolutions } from '../../lib/engine.js';
import { editSheet } from '../../sheets.js';
import { applyEvolution } from '../../rpg/progression.js';
import { describeDie, readDie } from '../../rpg/dice.js';

// Aplica na ficha as evoluções que o jogador confirmou em "Ver Meus Treinamentos" (o servidor já debitou a XP).
// Mesmo padrão do XP concedido pelo mestre: recolhe ao abrir, quando chega uma nova (tempo real), ao voltar à aba e a cada 15 s.
export function useEvolutionClaims(session, setSession, user, notify) {
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
            const list = await claimEvolutions(id);
            if (!list.length || !alive) continue;
            let result = null;
            setSession(prev => editSheet(prev, sheet.id, ch => {
              result = list.reduce((c, e) => applyEvolution(c, e.kind, e.name), ch);
              return result;
            }));
            const summary = list.map(e => `${e.name} (${describeDie(readDie(result || sheet.character, e.kind, e.name))})`).join(', ');
            notifyRef.current?.(`🎓 ${sheet.character.name || 'Sua ficha'} evoluiu: ${summary}.`);
          } catch (error) {
            if (/function|does not exist|schema cache/i.test(error.message)) { disabled = true; return; } // migration 0024 ainda não rodou
          }
        }
      } finally {
        busy.current = false;
        if (again.current && alive && !disabled) { again.current = false; claimAll(); }
      }
    };
    const first = setTimeout(claimAll, 3000);
    const timer = setInterval(claimAll, 15000);
    const channel = supabase.channel(`evolution:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'evolution_awards' }, () => claimAll())
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
