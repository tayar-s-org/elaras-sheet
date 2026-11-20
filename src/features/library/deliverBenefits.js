import { BENEFIT_RULES } from './benefitRules.js';
import { applyBenefits, benefitsOfCharacter, confirmableBenefits, unappliedBenefits } from './pendingBenefits.js';

const ids = benefits => benefits.map(benefit => benefit.id);

// Entrega em duas fases, para nenhum benefício se perder se o app fechar no meio:
//  1) aplica na ficha o que ainda não foi aplicado (o autosave grava, junto, o registro dos IDs);
//  2) só confirma ao servidor o que já está gravado na nuvem. Sem confirmação o benefício volta na próxima consulta
//     e o registro da ficha impede de aplicá-lo de novo.
export async function deliverBenefits({ readSession, editCharacter, notify, confirm }, sheetId, pending) {
  const sheet = readSession().sheets.find(s => s.id === sheetId);
  if (!sheet?.cloud) return;
  const mine = benefitsOfCharacter(pending, sheet.cloud.id);
  for (const [kind, rule] of Object.entries(BENEFIT_RULES)) {
    const fresh = unappliedBenefits(sheet.character, mine[kind]);
    if (!fresh.length) continue;
    editCharacter(sheetId, character => applyBenefits(character, rule, mine[kind]));
    notify(rule.notice(sheet.character.name, fresh, rule.apply(sheet.character, fresh)));
  }
  const confirmed = Object.fromEntries(Object.keys(BENEFIT_RULES).map(kind => [kind, ids(confirmableBenefits(mine[kind], sheet.cloud.base))]));
  if (Object.values(confirmed).some(list => list.length)) await confirm(confirmed);
}
