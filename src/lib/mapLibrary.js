import { supabase } from './supabase.js';
import { putMapFile } from './board.js';
import { boardGrid } from '../boardGrid.js';

const columns = 'id,name,image_path,width,height,grid';
const library = 'map-library';
const fail = error => { if (error) throw new Error(error.message); };
const maps = () => supabase.from('saved_board_maps');

export async function listSavedMaps(tableId) {
  const { data, error } = await maps().select(columns).eq('table_id', tableId).order('created_at', { ascending:false });
  fail(error);
  return data;
}

export async function readMapFile(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  fail(error);
  const ext = path.split('.').pop();
  const type = ext === 'jpg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
  return new File([data], path.split('/').pop(), { type });
}

export const readSavedMap = path => readMapFile(library, path);

export async function saveMap(tableId, name, file, size, grid) {
  const image_path = await putMapFile(library, tableId, file);
  const { data, error } = await maps().insert({ table_id:tableId, name, image_path, ...size, grid:boardGrid(grid) }).select(columns).single();
  fail(error);
  return data;
}

export async function renameSavedMap(id, name) {
  const { data, error } = await maps().update({name}).eq('id',id).select(columns).single();
  fail(error);
  return data;
}

export async function deleteSavedMap(entry) {
  const { error } = await maps().delete().eq('id',entry.id).select('id').single();
  fail(error);
  await supabase.storage.from(library).remove([entry.image_path]).catch(() => {});
}
