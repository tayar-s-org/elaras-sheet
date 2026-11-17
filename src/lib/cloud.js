import { supabase } from './supabase.js';
import { validateCharacter } from '../rules.js';

export class ConflictError extends Error {
  constructor() {
    super('A ficha mudou na nuvem. Abra a versão mais recente em "Minhas fichas" para comparar.');
    this.name = 'ConflictError';
  }
}
const fail = error => { if (error) throw new Error(error.message || 'Erro ao acessar a nuvem.'); };

export async function listMine() {
  const { data, error } = await supabase.from('characters').select('id,name,revision,updated_at').order('updated_at', { ascending: false });
  fail(error);
  return data;
}
export async function getCharacter(id) {
  const { data, error } = await supabase.from('characters').select('id,revision,data').eq('id', id).single();
  fail(error);
  return { id: data.id, revision: data.revision, character: validateCharacter(data.data) };
}
export async function createCharacter(character) {
  const c = validateCharacter(character);
  const { data, error } = await supabase.from('characters')
    .insert({ name: c.name || 'Sem nome', data: c, schema_version: c.schemaVersion }).select('id,revision').single();
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
