import { supabase } from './supabase.js';
import { masterHubReady, adjustXp, newRequestId } from './masterHub.js';

const fail = error => { if (error) throw new Error(error.message || 'Erro ao acessar a nuvem.'); };

// Mestre: concede (valor positivo) ou remove (negativo) XP de uma ficha vinculada a um jogador da mesa.
export async function grantXp(tableId, characterId, amount, note = '') {
  // Com a migração 0040, passa pelo RPC da Central (idempotente e registrado no histórico administrativo).
  if (await masterHubReady() === true) { await adjustXp({ tableId, characterId, mode: 'add', amount, note, requestId: newRequestId() }); return; }
  const { error } = await supabase.rpc('grant_xp', { p_table: tableId, p_character: characterId, p_amount: amount, p_note: note });
  // Remover (valor negativo) precisa da migration 0036.
  if (error && amount < 0 && /entre 1 e 10000/.test(error.message || '')) throw new Error('Falta aplicar a migration 0036 (remover XP) no Supabase.');
  fail(error);
}
// Dono da ficha: recolhe o XP pendente (devolve o total, 0 se nao ha nada).
export async function claimXp(characterId) {
  const { data, error } = await supabase.rpc('claim_xp', { p_character: characterId });
  fail(error);
  return Number(data) || 0;
}
