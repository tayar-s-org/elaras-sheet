import { supabase } from './supabase.js';
import { FAILURE, failureKind, toBackendError, dataOrNullIfNotInstalled, sessionExpiredError } from './backendError.js';

const BASE_COLS = 'id,table_id,user_id,character_id,name,weight,effects,description,status,gm_note,created_at,decided_at';
const COLS = `${BASE_COLS},price,discarded_at`; // price/discarded_at vêm da migration 0021; sem ela cai para BASE_COLS
export const ITEM_STATUS = { pending: 'Aguardando aprovação', approved: 'Aprovado', rejected: 'Recusado' };

// Colunas novas (migration 0021) ausentes: repete só com as colunas básicas. Devolve null quando a tabela nem existe (migration 0018);
// rede, sessão vencida e permissão negada viram erro tipado.
async function selectWithOptionalColumns(query) {
  let result = await query(COLS);
  if (result.error && failureKind(result.error) === FAILURE.notInstalled) result = await query(BASE_COLS);
  return dataOrNullIfNotInstalled(result, 'Não foi possível carregar os itens.');
}
export async function listMyCustomItems() {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user?.id;
  if (!uid) throw sessionExpiredError();
  return selectWithOptionalColumns(cols => supabase.from('table_custom_items').select(`${cols},tables(name)`).eq('user_id', uid).order('created_at', { ascending: false }).limit(50));
}
// Mestre: pedidos da mesa (pendentes primeiro).
export function listTableCustomItems(tableId) {
  return selectWithOptionalColumns(cols => supabase.from('table_custom_items').select(cols).eq('table_id', tableId).order('created_at', { ascending: false }).limit(100));
}
export async function submitCustomItem(tableId, characterId, item) {
  const { error } = await supabase.from('table_custom_items')
    .insert({ table_id: tableId, character_id: characterId, name: item.name, weight: item.weight, effects: item.effects, description: item.description });
  if (error) throw toBackendError(error, 'Não foi possível enviar o item.');
}
export async function decideCustomItem(id, status, note = '') {
  const { data, error } = await supabase.from('table_custom_items').update({ status, gm_note: note.slice(0, 300) }).eq('id', id).select('id');
  if (error) throw toBackendError(error, 'Não foi possível salvar a decisão.');
  if (!data?.length) throw new Error('Sem permissão para decidir este item.');
}
const noRpc = error => failureKind(error) === FAILURE.notInstalled;
// Mestre: aprova e cobra o preço do jogador (desconto pela fila de dinheiro). Sem a migration 0021 só aprova de graça.
export async function approveCustomItem(id, price, note = '') {
  const { error } = await supabase.rpc('approve_custom_item', { p_id: id, p_price: price, p_note: note.slice(0, 300) });
  if (!error) return;
  if (noRpc(error)) {
    if (price > 0) throw new Error('Falta rodar a migration 0021 (preço de itens) no Supabase.');
    return decideCustomItem(id, 'approved', note);
  }
  throw toBackendError(error, 'Não foi possível aprovar o item.');
}
// Mestre: revoga a aprovação (o preço volta ao jogador).
export async function revokeCustomItem(id, note = '') {
  const { error } = await supabase.rpc('revoke_custom_item', { p_id: id, p_note: note.slice(0, 300) });
  if (!error) return;
  if (noRpc(error)) return decideCustomItem(id, 'rejected', note);
  throw toBackendError(error, 'Não foi possível revogar o item.');
}
// Jogador: avisa que descartou o item da mochila (para a conferência não repô-lo). Falha em silêncio.
export async function markCustomDiscarded(entryId) {
  const id = String(entryId || '').replace(/^custom-/, '');
  if (!id) return;
  await supabase.rpc('discard_custom_item', { p_id: id });
}
export async function deleteCustomItem(id) {
  const { error } = await supabase.from('table_custom_items').delete().eq('id', id);
  if (error) throw toBackendError(error, 'Não foi possível apagar o pedido.');
}
// Dono da ficha: recolhe os itens aprovados ainda nao entregues (cada um so e entregue uma vez).
export async function claimCustomItems(characterId) {
  const { data, error } = await supabase.rpc('claim_custom_items', { p_character: characterId });
  if (error) throw toBackendError(error, 'Não foi possível recolher os itens.');
  return data || [];
}
