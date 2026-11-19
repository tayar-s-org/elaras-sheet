import { supabase } from './supabase.js';

// Funções do servidor para a mochila (migração 0039). Elas escrevem em characters.data.inventory, a mesma fonte da ficha:
// a ficha aberta reconcilia a diferença (sheetRebase.js) e o token relê a ficha (useLiveCharacters).
export const INVENTORY_EVENT = 'elara:inventory-changed';
// Avisa as telas abertas (ficha e sala) para relerem a nuvem agora, sem esperar o ciclo de 5/10 s.
export const notifyInventoryChanged = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(INVENTORY_EVENT)); };

const fail = error => {
  if (!error) return;
  if (/schema cache|could not find the function|does not exist/i.test(error.message || '')) throw new Error('Falta aplicar a migração 0039 (itens e inventário) no Supabase.');
  throw new Error(error.message || 'Erro ao acessar a nuvem.');
};

// Gasta unidades (só diminui). index: qual unidade do cantil sai; sem index sai a última.
export async function consumeRemote(characterId, id, qty = 1, index = null) {
  const { error } = await supabase.rpc('inventory_consume', { p_character: characterId, p_id: id, p_qty: qty, p_index: index });
  fail(error);
  notifyInventoryChanged();
}
export async function setFillRemote(characterId, id, index, litres) {
  const { error } = await supabase.rpc('inventory_set_fill', { p_character: characterId, p_id: id, p_index: index, p_fill: litres });
  fail(error);
  notifyInventoryChanged();
}
// Transferência atômica: sai de um personagem e entra no outro na mesma operação do servidor.
export async function transferItem({ tableId, from, to, id, qty, index = null }) {
  const { error } = await supabase.rpc('inventory_transfer', { p_table: tableId, p_from: from, p_to: to, p_id: id, p_qty: qty, p_index: index });
  fail(error);
  notifyInventoryChanged();
}
// Mestre: entrega item do catálogo ({ id }) ou customizado novo ({ custom }).
export async function giveItem(tableId, characterId, { id = null, custom = null, qty }) {
  const { error } = await supabase.rpc('gm_give_item', { p_table: tableId, p_character: characterId, p_id: id, p_custom: custom, p_qty: qty });
  fail(error);
  notifyInventoryChanged();
}

// Outros personagens aprovados na mesa que podem receber itens: [{ characterId, name, player }].
export async function listRecipients(tableId, exceptCharacterId) {
  const { data: members, error } = await supabase.from('table_members')
    .select('user_id,character_id,profiles(display_name)').eq('table_id', tableId).eq('status', 'approved').not('character_id', 'is', null);
  fail(error);
  const rows = members.filter(m => m.character_id !== exceptCharacterId);
  if (!rows.length) return [];
  const { data: chars, error: charError } = await supabase.from('characters').select('id,name').in('id', rows.map(m => m.character_id));
  fail(charError);
  const names = new Map(chars.map(c => [c.id, c.name]));
  return rows.map(m => ({ characterId: m.character_id, name: names.get(m.character_id) || 'Sem nome', player: m.profiles?.display_name || '' }));
}
