import { failsWholeCycle } from '../../lib/backendError.js';
import { runStep } from './stepGate.js';

// Um ciclo de recolhimento para todas as fichas da conta. As listas compartilhadas (benefícios pendentes e itens do jogador)
// são lidas uma vez por ciclo, e não uma vez por ficha.
// ctx: { readSession, editCharacter, notify, isCurrent }; sources: as chamadas ao servidor (veja claimSources.js).
export async function runClaimCycle(ctx, gate, sources) {
  const sheetIds = ctx.readSession().sheets.filter(s => s.cloud).map(s => s.id);
  if (!sheetIds.length) return;
  try {
    const pendingBenefits = await runStep('benefits', gate, sources.peekBenefits);
    const myItems = await runStep('customItems', gate, sources.listMyItems);
    for (const sheetId of sheetIds) {
      const sheet = ctx.readSession().sheets.find(s => s.id === sheetId);
      if (!ctx.isCurrent()) return;
      if (!sheet?.cloud) continue;
      await runStep('xp', gate, () => sources.claimXp(ctx, sheet));
      await runStep('money', gate, () => sources.claimMoney(ctx, sheet));
      await runStep('customItems', gate, () => sources.claimItems(ctx, sheet, myItems));
      if (pendingBenefits) await runStep('benefits', gate, () => sources.deliverBenefits(ctx, sheetId, pendingBenefits));
    }
  } catch (error) {
    if (!failsWholeCycle(error)) throw error;
  }
}
