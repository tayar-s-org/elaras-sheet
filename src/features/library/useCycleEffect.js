import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import { createCycleRunner } from './cycleRunner.js';

// Mantém vivo, para a conta logada, um ciclo assíncrono (`run({ isCurrent })`): roda logo depois de abrir, a cada
// `intervalMs` (só com a aba visível), ao voltar o foco da aba, quando chega um evento em tempo real e quando um evento da
// janela dispara. Cada canal em tempo real é separado: tabela fora da publicação Realtime derruba só o próprio canal
// (supabase/migrations/README.md) e a verificação periódica continua valendo.
// channels: [{ name, tables, delayMs }]; windowEvents: [{ name, delayMs }]; delayMs agrupa eventos em sequência.
export function useCycleEffect({ userId, run, firstDelayMs, intervalMs, channels = [], windowEvents = [] }) {
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!supabase || !userId) return undefined;
    const runner = createCycleRunner(context => runRef.current(context));
    let scheduled = null;
    const schedule = (delayMs = 0) => { clearTimeout(scheduled); scheduled = setTimeout(runner.request, delayMs); };
    const openChannel = ({ name, tables, delayMs }) => {
      const channel = supabase.channel(`${name}:${userId}:${Math.random().toString(36).slice(2)}`);
      for (const table of tables) channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table }, () => schedule(delayMs));
      return channel.subscribe();
    };

    const firstRun = setTimeout(runner.request, firstDelayMs);
    const timer = setInterval(() => { if (!document.hidden) runner.request(); }, intervalMs);
    const opened = channels.map(openChannel);
    const onVisible = () => { if (document.visibilityState === 'visible') schedule(0); };
    document.addEventListener('visibilitychange', onVisible);
    const windowListeners = windowEvents.map(({ name, delayMs }) => [name, () => schedule(delayMs)]);
    windowListeners.forEach(([name, listener]) => window.addEventListener(name, listener));

    return () => {
      runner.cancel();
      clearTimeout(firstRun);
      clearTimeout(scheduled);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      windowListeners.forEach(([name, listener]) => window.removeEventListener(name, listener));
      opened.forEach(channel => supabase.removeChannel(channel));
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps -- timers e canais dependem só da conta; a tarefa mais recente vem de runRef
}
