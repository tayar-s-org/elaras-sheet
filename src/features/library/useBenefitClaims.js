import { useEffect, useRef } from 'react';
import { editSheet } from '../../sheets.js';
import { runClaimCycle } from './claimCycle.js';
import { CLAIM_SOURCES } from './claimSources.js';
import { createStepGate } from './stepGate.js';
import { useCycleEffect } from './useCycleEffect.js';

// Recolhe para as fichas abertas da conta tudo o que o mestre e o servidor entregam: XP e dinheiro da fila, itens e perícias
// aprovados, evoluções e melhorias de feitiço. Um único ciclo cuida de tudo: roda ao abrir, quando chega uma concessão
// (tempo real), ao voltar o foco da aba e a cada 15 s, mas não com a aba oculta.
export function useBenefitClaims(session, setSession, user, notify) {
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const stepGate = useRef(createStepGate()); // etapas que o servidor ainda não tem (migration pendente), por conta
  useEffect(() => { stepGate.current.reset(); }, [user?.id]);

  useCycleEffect({
    userId: user?.id,
    firstDelayMs: 2500,
    intervalMs: 15000,
    channels: [
      { name: 'xp', tables: ['xp_awards'], delayMs: 0 },
      { name: 'money', tables: ['money_awards'], delayMs: 0 },
      { name: 'evolution', tables: ['evolution_awards'], delayMs: 0 },
    ],
    run: ({ isCurrent }) => runClaimCycle({
      readSession: () => sessionRef.current,
      editCharacter: (sheetId, edit) => setSession(prev => editSheet(prev, sheetId, edit)),
      notify: message => { if (isCurrent()) notifyRef.current?.(message); },
      isCurrent,
    }, stepGate.current, CLAIM_SOURCES),
  });
}
