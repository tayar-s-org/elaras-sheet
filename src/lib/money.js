import { supabase } from './supabase.js';

const fail = error => {
  if (!error) return;
  // A migration 0012 ainda nao foi aplicada no Supabase.
  if (/schema cache|could not find/i.test(error.message || '')) throw new Error('Falta aplicar a migration 0012 (dinheiro) no Supabase.');
  throw new Error(error.message || 'Erro ao acessar a nuvem.');
};

// Mestre: adiciona (valor positivo) ou remove (negativo) dinheiro de uma ficha vinculada a um jogador da mesa.
export async function grantMoney(tableId, characterId, amount, note = '') {
  const { error } = await supabase.rpc('grant_money', { p_table: tableId, p_character: characterId, p_amount: amount, p_note: note });
  // A 0012 so aceita valores de 1 a 1.000.000; remover precisa da migration 0013.
  if (error && amount < 0 && /entre 1 e 1\.000\.000/.test(error.message || '')) throw new Error('Falta aplicar a migration 0013 (remover dinheiro) no Supabase.');
  fail(error);
}
// Dono da ficha: recolhe o dinheiro pendente (devolve o total, 0 se nao ha nada).
export async function claimMoney(characterId) {
  const { data, error } = await supabase.rpc('claim_money', { p_character: characterId });
  fail(error);
  return Number(data) || 0;
}
