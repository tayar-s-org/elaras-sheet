import { supabase } from './supabase.js';

const COLS = 'id,table_id,name,image_path,max_hp,size,created_at';
const fail = error => {
  if (!error) return;
  if (error.code === '42P01' || /creature_presets/.test(error.message || '')) {
    throw new Error('Predefinições indisponíveis: falta rodar a migração 0015 no Supabase.');
  }
  throw new Error(error.message || 'Erro ao acessar a nuvem.');
};

export async function loadPresets(tableId) {
  const { data, error } = await supabase.from('creature_presets').select(COLS).eq('table_id', tableId).order('created_at');
  fail(error);
  return data || [];
}

export async function savePreset(tableId, { name, image_path, max_hp, size }) {
  const { data, error } = await supabase.from('creature_presets')
    .insert({ table_id: tableId, name, image_path: image_path || null, max_hp, size: size || 1 }).select(COLS).single();
  fail(error);
  return data;
}

export async function deletePreset(id) {
  const { error } = await supabase.from('creature_presets').delete().eq('id', id);
  fail(error);
}
