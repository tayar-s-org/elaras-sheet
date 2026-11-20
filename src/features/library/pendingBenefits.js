import { appliedBenefitIds, recordAppliedBenefits } from '../../rpg/benefitLedger.js';

// Benefícios que o servidor ainda lista como pendentes e que a ficha ainda não aplicou.
export function unappliedBenefits(character, benefits) {
  const applied = appliedBenefitIds(character);
  return benefits.filter(benefit => !applied.has(benefit.id));
}

// Aplica na ficha só o que o registro dela ainda não tem e anota os IDs no mesmo passo: repetir a chamada não muda nada.
export function applyBenefits(character, rule, benefits) {
  const fresh = unappliedBenefits(character, benefits);
  return fresh.length ? recordAppliedBenefits(rule.apply(character, fresh), fresh.map(benefit => benefit.id)) : character;
}

// `cloudBase` é o JSON da última versão salva na nuvem: o benefício só pode ser confirmado se o registro dele já está lá.
export function confirmableBenefits(benefits, cloudBase) {
  let saved;
  try { saved = appliedBenefitIds(JSON.parse(cloudBase)); } catch { return []; }
  return benefits.filter(benefit => saved.has(benefit.id));
}

// Divide o que o servidor devolveu (de todas as fichas da conta) por ficha.
export function benefitsOfCharacter(pending, characterId) {
  return Object.fromEntries(Object.entries(pending).map(([kind, list]) => [kind, list.filter(b => b.character_id === characterId)]));
}
