import { supabase } from './supabase.js';

const COLS = 'id,table_id,user_id,character_id,name,weight,effects,description,status,gm_note,created_at,decided_at';
export const ITEM_STATUS = { pending: 'Aguardando aprovação', approved: 'Aprovado', rejected: 'Recusado' };

// Devolvem null quando a tabela ainda nao existe (migration 0018 pendente).
export async function listMyCustomItems() {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase.from('table_custom_items').select(`${COLS},tables(name)`).eq('user_id', uid).order('created_at', { ascending: false }).limit(50);
  return error ? null : data;
}
// Mestre: pedidos da mesa (pendentes primeiro).
export async function listTableCustomItems(tableId) {
  const { data, error } = await supabase.from('table_custom_items').select(COLS).eq('table_id', tableId).order('created_at', { ascending: false }).limit(100);
  return error ? null : data;
}
export async function submitCustomItem(tableId, characterId, item) {
  const { error } = await supabase.from('table_custom_items')
    .insert({ table_id: tableId, character_id: characterId, name: item.name, weight: item.weight, effects: item.effects, description: item.description });
  if (error) throw new Error(error.message || 'Não foi possível enviar o item.');
}
export async function decideCustomItem(id, status, note = '') {
  const { data, error } = await supabase.from('table_custom_items').update({ status, gm_note: note.slice(0, 300) }).eq('id', id).select('id');
  if (error) throw new Error(error.message || 'Não foi possível salvar a decisão.');
  if (!data?.length) throw new Error('Sem permissão para decidir este item.');
}
export async function deleteCustomItem(id) {
  const { error } = await supabase.from('table_custom_items').delete().eq('id', id);
  if (error) throw new Error(error.message || 'Não foi possível apagar o pedido.');
}
// Dono da ficha: recolhe os itens aprovados ainda nao entregues (cada um so e entregue uma vez).
export async function claimCustomItems(characterId) {
  const { data, error } = await supabase.rpc('claim_custom_items', { p_character: characterId });
  if (error) throw new Error(error.message);
  return data || [];
}
