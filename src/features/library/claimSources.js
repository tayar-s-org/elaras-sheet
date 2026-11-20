import { peekPendingBenefits, confirmBenefits } from '../../lib/benefits.js';
import { listMyCustomItems } from '../../lib/customItems.js';
import { claimXpForSheet, claimMoneyForSheet } from './currencyClaims.js';
import { claimCustomItemsForSheet } from './customItemClaims.js';
import { deliverBenefits } from './deliverBenefits.js';

// As chamadas ao servidor de um ciclo de recolhimento. Ficam separadas de runClaimCycle para o ciclo ser testado com dublês.
export const CLAIM_SOURCES = {
  peekBenefits: peekPendingBenefits,
  listMyItems: listMyCustomItems,
  claimXp: claimXpForSheet,
  claimMoney: claimMoneyForSheet,
  claimItems: claimCustomItemsForSheet,
  deliverBenefits: (ctx, sheetId, pending) => deliverBenefits({ ...ctx, confirm: confirmBenefits }, sheetId, pending),
};
