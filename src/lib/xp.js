import { supabase } from './supabase.js';

const fail = error => { if (error) throw new Error(error.message || 'Erro ao acessar a nuvem.'); };

// Mestre: concede XP a uma ficha vinculada a um jogador da mesa.
export async function grantXp(tableId, characterId, amount, note = '') {
  const { error } = await supabase.rpc('grant_xp', { p_table: tableId, p_character: characterId, p_amount: amount, p_note: note });
  fail(error);
}
// Dono da ficha: recolhe o XP pendente (devolve o total, 0 se nao ha nada).
export async function claimXp(characterId) {
  const { data, error } = await supabase.rpc('claim_xp', { p_character: characterId });
  fail(error);
  return Number(data) || 0;
}
