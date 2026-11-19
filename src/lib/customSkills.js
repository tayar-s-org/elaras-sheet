import { supabase } from './supabase.js';

const COLS = 'id,table_id,user_id,character_id,name,die,attribute,status,gm_note,created_at,decided_at';
export const SKILL_STATUS = { pending: 'Aguardando aprovação', approved: 'Aprovada', rejected: 'Recusada' };

// Devolvem null quando a tabela ainda nao existe (migration 0027 pendente).
export async function listMyCustomSkills() {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase.from('table_custom_skills').select(`${COLS},tables(name)`).eq('user_id', uid).order('created_at', { ascending: false }).limit(50);
  return error ? null : data;
}
// Mestre: pedidos da mesa.
export async function listTableCustomSkills(tableId) {
  const { data, error } = await supabase.from('table_custom_skills').select(COLS).eq('table_id', tableId).order('created_at', { ascending: false }).limit(100);
  return error ? null : data;
}
export async function submitCustomSkill(tableId, characterId, name, die, attribute) {
  const { error } = await supabase.from('table_custom_skills').insert({ table_id: tableId, character_id: characterId, name, die, attribute });
  if (error) throw new Error(error.message || 'Não foi possível enviar a perícia.');
}
export async function decideCustomSkill(id, status, note = '') {
  const { data, error } = await supabase.from('table_custom_skills').update({ status, gm_note: note.slice(0, 300) }).eq('id', id).select('id');
  if (error) throw new Error(error.message || 'Não foi possível salvar a decisão.');
  if (!data?.length) throw new Error('Sem permissão para decidir esta perícia.');
}
export async function deleteCustomSkill(id) {
  const { error } = await supabase.from('table_custom_skills').delete().eq('id', id);
  if (error) throw new Error(error.message || 'Não foi possível cancelar o pedido.');
}
// Dono da ficha: recolhe as pericias aprovadas ainda nao entregues.
export async function claimCustomSkills(characterId) {
  const { data, error } = await supabase.rpc('claim_custom_skills', { p_character: characterId });
  if (error) throw new Error(error.message);
  return data || [];
}
