import { useRef } from 'react';
import { listMine, getCharacter } from '../../lib/cloud.js';
import { applyRewardSync } from '../../sheetRebase.js';
import { formatMoney, addMoney } from '../../money.js';
import { resolveItem } from '../../market/items.js';
import { INVENTORY_EVENT } from '../../lib/items.js';
import { useCycleEffect } from './useCycleEffect.js';

function announceGain(gain, notify) {
  const who = gain.name ? ` (${gain.name})` : '';
  if (gain.xp > 0) {
    const before = Math.floor((Number(gain.before?.xp) || 0) / 5);
    const after = Math.floor(((Number(gain.before?.xp) || 0) + gain.xp) / 5);
    const levelUp = after > before ? ` Subiu para o nível ${after}: +${(after - before) * 2} pontos de progressão!` : '';
    notify(`${gain.name || 'Sua ficha'} recebeu ${gain.xp} XP do mestre.${levelUp}`);
  }
  if (gain.xp < 0) notify(`${gain.name || 'Sua ficha'} perdeu ${-gain.xp} XP (removido pelo mestre).`);
  if (gain.money > 0) notify(`💰 Você recebeu $${formatMoney(gain.money)} do mestre${who}.`);
  if (gain.money < 0) notify(`💸 O mestre removeu $${formatMoney(-gain.money)}${who}. Saldo: $${formatMoney(addMoney(gain.before?.money, gain.money))}.`);
  // Itens que chegaram na mochila (mestre entregou ou outro jogador enviou).
  const received = (gain.items || []).filter(i => i.delta > 0).map(i => `${i.delta > 1 ? `${i.delta}× ` : ''}${resolveItem(i.entry)?.name || 'item'}`);
  if (received.length) notify(`🎒 Você recebeu ${received.join(', ')}${who}.`);
}

// Baixa as fichas abertas que mudaram na nuvem (revisão mais nova) e aplica a diferença.
async function syncRewards({ readSession, setSession, notify, isCurrent }) {
  const rows = [];
  for (const item of await listMine()) {
    const sheet = readSession().sheets.find(s => s.cloud?.id === item.id);
    if (sheet && item.revision > sheet.cloud.revision) rows.push(await getCharacter(item.id));
  }
  if (!rows.length || !isCurrent()) return;
  const { gains } = applyRewardSync(readSession(), rows);
  setSession(prev => applyRewardSync(prev, rows).session);
  gains.forEach(gain => announceGain(gain, notify));
}

// XP e dinheiro que o mestre concede são aplicados direto na ficha, na nuvem (migração 0035), mesmo com o app do jogador
// fechado. Este gancho traz essa mudança para as fichas abertas: logo que chega a concessão (tempo real), ao voltar o foco
// da aba e a cada 10 s por garantia (não com a aba oculta). Fichas com edições pendentes recebem só a diferença de
// XP/dinheiro (sheetRebase.js).
export function useRewardSync(session, setSession, user, notify) {
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useCycleEffect({
    userId: user?.id,
    firstDelayMs: 2000,
    intervalMs: 10000,
    channels: [{ name: 'rewardsync', tables: ['xp_awards', 'money_awards', 'inventory_log'], delayMs: 300 }], // inventory_log: item entregue ou transferido
    windowEvents: [{ name: INVENTORY_EVENT, delayMs: 150 }], // mexeu na mochila pelo token (nesta mesma janela)
    run: ({ isCurrent }) => syncRewards({
      readSession: () => sessionRef.current,
      setSession,
      notify: message => notifyRef.current?.(message),
      isCurrent,
    }),
  });
}
