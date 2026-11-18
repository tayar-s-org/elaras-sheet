import { supabase } from './supabase.js';
import { validateCharacter } from '../rules.js';

export class ConflictError extends Error {
  constructor() {
    super('A ficha mudou na nuvem. Feche esta aba e recarregue a página para abrir a versão mais recente.');
    this.name = 'ConflictError';
  }
}
const fail = error => { if (error) throw new Error(error.message || 'Erro ao acessar a nuvem.'); };

// A RLS tambem libera fichas de outros jogadores das mesas em comum (para a sala); a biblioteca so lista as do proprio usuario.
async function myId() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error('Entre na sua conta para ver suas fichas.');
  return id;
}

export async function listMine() {
  const { data, error } = await supabase.from('characters').select('id,name,revision,updated_at,table_id,tables!table_id(name)').eq('owner_id', await myId()).order('updated_at', { ascending: false });
  fail(error);
  return data;
}
export async function getCharacter(id) {
  const { data, error } = await supabase.from('characters').select('id,revision,data,table_id,tables!table_id(name)').eq('id', id).eq('owner_id', await myId()).single();
  fail(error);
  return { id: data.id, revision: data.revision, character: validateCharacter(data.data), tableId: data.table_id || null, tableName: data.tables?.name || '' };
}
// A ficha nasce para uma mesa (tableId) e so vale nela. Sem mesa so existe para fichas antigas.
export async function createCharacter(character, tableId = null) {
  const c = validateCharacter(character);
  const { data, error } = await supabase.from('characters')
    .insert({ name: c.name || 'Sem nome', data: c, schema_version: c.schemaVersion, table_id: tableId }).select('id,revision').single();
  fail(error);
  return { id: data.id, revision: data.revision, character: c };
}
export async function updateCharacter(id, revision, character) {
  const c = validateCharacter(character);
  const { data, error } = await supabase.from('characters')
    .update({ name: c.name || 'Sem nome', data: c, schema_version: c.schemaVersion })
    .eq('id', id).eq('revision', revision).select('id,revision');
  fail(error);
  if (!data.length) throw new ConflictError();
  return { id: data[0].id, revision: data[0].revision, character: c };
}
export async function deleteCharacter(id) {
  const { error } = await supabase.from('characters').delete().eq('id', id);
  fail(error);
}

// Liga uma ficha antiga (sem mesa) a uma mesa em que o jogador participa.
export async function bindCharacterTable(characterId, tableId) {
  const { error } = await supabase.rpc('bind_character_table', { p_character: characterId, p_table: tableId });
  fail(error);
}
// Ficha nova de uma mesa: se o jogador ainda nao tem ficha escolhida nessa mesa, esta passa a ser a dele.
export async function linkIfNoCharacter(tableId, characterId) {
  const uid = await myId();
  const { data } = await supabase.from('table_members').select('character_id').eq('table_id', tableId).eq('user_id', uid).maybeSingle();
  if (data && !data.character_id) await supabase.rpc('set_member_character', { p_table: tableId, p_character: characterId });
}
