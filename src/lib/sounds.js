import { supabase } from './supabase.js';
import { MUSIC_EXT } from '../music.js';
import { soundFileError, soundName } from '../soundpad.js';

const COLS = 'id,table_id,name,path,loop,created_at';
const fail = error => {
  if (!error) return;
  if (error.code === '42P01' || /table_sounds/.test(error.message || '')) throw new Error('Soundpad indisponível: falta rodar a migração 0016 no Supabase.');
  throw new Error(error.message || 'Erro ao acessar a nuvem.');
};

export async function loadSounds(tableId) {
  const { data, error } = await supabase.from('table_sounds').select(COLS).eq('table_id', tableId).order('created_at');
  fail(error);
  return data || [];
}

export async function addSound(tableId, file) {
  const bad = soundFileError(file);
  if (bad) throw new Error(bad);
  const path = `${tableId}/${crypto.randomUUID()}.${MUSIC_EXT[file.type]}`;
  const up = await supabase.storage.from('music').upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw new Error(up.error.message);
  const { data, error } = await supabase.from('table_sounds').insert({ table_id: tableId, name: soundName(file.name), path }).select(COLS).single();
  if (error) { await supabase.storage.from('music').remove([path]); fail(error); }
  return data;
}

export async function updateSound(id, patch) {
  const { error } = await supabase.from('table_sounds').update(patch).eq('id', id);
  fail(error);
}

export async function deleteSound(sound) {
  const { error } = await supabase.from('table_sounds').delete().eq('id', sound.id);
  fail(error);
  await supabase.storage.from('music').remove([sound.path]);
}
