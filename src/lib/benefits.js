import { supabase } from './supabase.js';
import { toBackendError } from './backendError.js';

const listOf = value => (Array.isArray(value) ? value : []);

// Dono das fichas: benefícios que o servidor ainda não considera entregues (evolução, melhoria de feitiço, perícia aprovada),
// de TODAS as fichas da conta, numa chamada só. Não marca nada como entregue (a entrega é confirmada depois, veja confirmBenefits).
export async function peekPendingBenefits() {
  const { data, error } = await supabase.rpc('peek_pending_benefits');
  if (error) throw toBackendError(error, 'Não foi possível consultar os benefícios.');
  return { evolutions: listOf(data?.evolutions), spellUpgrades: listOf(data?.spell_upgrades), customSkills: listOf(data?.custom_skills) };
}

// Confirma por ID o que já está aplicado e salvo na ficha. Pode ser repetida: ID já confirmado não muda nada.
export async function confirmBenefits({ evolutions = [], spellUpgrades = [], customSkills = [] }) {
  const { error } = await supabase.rpc('confirm_benefits', { p_evolutions: evolutions, p_spell_upgrades: spellUpgrades, p_custom_skills: customSkills });
  if (error) throw toBackendError(error, 'Não foi possível confirmar os benefícios.');
}
