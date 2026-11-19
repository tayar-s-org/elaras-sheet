import { supabase } from './supabase.js';

const COLS = 'id,table_id,name,image_path,max_hp,size,details,created_at';
const fail = error => {
  if (!error) return;
  if (error.code === '42P01' || /creature_presets/.test(error.message || '')) {
    throw new Error('PredefiniÃ§Ãµes indisponÃ­veis: falta rodar a migraÃ§Ã£o 0015 no Supabase.');
  }
  throw new Error(error.message || 'Erro ao acessar a nuvem.');
};

export async function loadPresets(tableId) {
  const { data, error } = await supabase.from('creature_presets').select(COLS).eq('table_id', tableId).order('created_at');
  fail(error);
  return data || [];
}

export async function savePreset(tableId, { name, image_path, max_hp, size, details = {} }, id = null) {
  const row = { name, image_path: image_path || null, max_hp, size: size || 1, details };
  const table = supabase.from('creature_presets');
  const query = id ? table.update(row).eq('id', id).eq('table_id', tableId) : table.insert({ table_id: tableId, ...row });
  const { data, error } = await query.select(COLS).single();
  fail(error);
  return data;
}

export async function deletePreset(id) {
  const { error } = await supabase.from('creature_presets').delete().eq('id', id);
  fail(error);
}
