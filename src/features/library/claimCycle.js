import { peekPendingBenefits, confirmBenefits } from '../../lib/benefits.js';
import { listMyCustomItems } from '../../lib/customItems.js';
import { FAILURE, failureKind, failsWholeCycle } from '../../lib/backendError.js';
import { claimXpForSheet, claimMoneyForSheet } from './currencyClaims.js';
import { claimCustomItemsForSheet } from './customItemClaims.js';
import { deliverBenefits } from './deliverBenefits.js';

// Roda uma etapa do ciclo. Recurso ainda não instalado no servidor desliga a etapa até a conta mudar (não insiste);
// falha que atinge o ciclo inteiro (sem rede, sessão vencida) interrompe o ciclo; as demais só pulam a etapa.
async function runStep(step, disabledSteps, action) {
  if (disabledSteps.has(step)) return undefined;
  try {
    return await action();
  } catch (error) {
    if (failsWholeCycle(error)) throw error;
    if (failureKind(error) === FAILURE.notInstalled) disabledSteps.add(step);
    return undefined;
  }
}

// Um ciclo de recolhimento para todas as fichas da conta. As listas compartilhadas (benefícios pendentes e itens do jogador)
// são lidas uma vez por ciclo, e não uma vez por ficha. ctx: { readSession, editCharacter, notify, isCurrent }.
export async function runClaimCycle(ctx, disabledSteps) {
  const sheetIds = ctx.readSession().sheets.filter(s => s.cloud).map(s => s.id);
  if (!sheetIds.length) return;
  const deliveryCtx = { ...ctx, confirm: confirmBenefits };
  try {
    const pendingBenefits = await runStep('benefits', disabledSteps, peekPendingBenefits);
    const myItems = await runStep('customItems', disabledSteps, listMyCustomItems);
    for (const sheetId of sheetIds) {
      const sheet = ctx.readSession().sheets.find(s => s.id === sheetId);
      if (!ctx.isCurrent()) return;
      if (!sheet?.cloud) continue;
      await runStep('xp', disabledSteps, () => claimXpForSheet(ctx, sheet));
      await runStep('money', disabledSteps, () => claimMoneyForSheet(ctx, sheet));
      await runStep('customItems', disabledSteps, () => claimCustomItemsForSheet(ctx, sheet, myItems));
      if (pendingBenefits) await runStep('benefits', disabledSteps, () => deliverBenefits(deliveryCtx, sheetId, pendingBenefits));
    }
  } catch (error) {
    if (!failsWholeCycle(error)) throw error;
  }
}
