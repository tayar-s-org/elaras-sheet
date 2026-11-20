// Registro, dentro da própria ficha, dos benefícios do servidor (evolução, melhoria de feitiço, perícia aprovada) que já foram
// aplicados nela. É o que impede aplicar o mesmo benefício duas vezes quando a confirmação ao servidor falha ou chega depois
// (outro aparelho, aba recarregada): o ID do benefício vale por uma aplicação só.
export const MAX_APPLIED_BENEFITS = 100;
const BENEFIT_ID = /^[0-9a-f-]{36}$/;

export function sanitizeAppliedBenefits(raw) {
  const ids = (Array.isArray(raw) ? raw : []).filter(id => typeof id === 'string' && BENEFIT_ID.test(id));
  return [...new Set(ids)].slice(-MAX_APPLIED_BENEFITS);
}

export const appliedBenefitIds = character => new Set(character?.appliedBenefits || []);

export function recordAppliedBenefits(character, ids) {
  return { ...character, appliedBenefits: sanitizeAppliedBenefits([...(character.appliedBenefits || []), ...ids]) };
}
