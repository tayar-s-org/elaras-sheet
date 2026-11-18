import { supabase } from './supabase.js';

const fail = error => { if (error) throw new Error(error.message || 'Erro ao acessar a nuvem.'); };
const BOARD_COLS = 'id,table_id,name,map_path,width,height,grid,settings';
const TOKEN_COLS = 'id,board_id,table_id,kind,name,character_id,x,y,size,color,hidden,image_path,meta';
const MARK_COLS = 'id,board_id,kind,x,y,text,color,created_by';

export const MAP_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAP_MAX_BYTES = 5 * 1024 * 1024;

export async function loadBoard(tableId) {
  const { data, error } = await supabase.from('boards').select(BOARD_COLS).eq('table_id', tableId)
    .order('created_at').limit(1).maybeSingle();
  fail(error);
  return data;
}
export async function loadBoardItems(boardId) {
  const [tokens, marks] = await Promise.all([
    supabase.from('board_tokens').select(TOKEN_COLS).eq('board_id', boardId),
    supabase.from('board_marks').select(MARK_COLS).eq('board_id', boardId),
  ]);
  fail(tokens.error);
  fail(marks.error);
  return { tokens: tokens.data, marks: marks.data };
}
export async function updateBoard(id, patch) {
  const { error } = await supabase.from('boards').update(patch).eq('id', id);
  fail(error);
}
export async function addToken(board, token) {
  const { data, error } = await supabase.from('board_tokens')
    .insert({ board_id: board.id, table_id: board.table_id, ...token }).select(TOKEN_COLS).single();
  fail(error);
  return data;
}
export async function updateToken(id, patch) {
  const { error } = await supabase.from('board_tokens').update(patch).eq('id', id);
  fail(error);
}
export async function removeToken(id) {
  const { error } = await supabase.from('board_tokens').delete().eq('id', id);
  fail(error);
}
export async function addMark(board, mark) {
  const { data, error } = await supabase.from('board_marks')
    .insert({ board_id: board.id, table_id: board.table_id, ...mark }).select(MARK_COLS).single();
  fail(error);
  return data;
}
export async function removeMark(id) {
  const { error } = await supabase.from('board_marks').delete().eq('id', id);
  fail(error);
}
export async function clearMarks(boardId) {
  const { error } = await supabase.from('board_marks').delete().eq('board_id', boardId);
  fail(error);
}

export async function mapUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('maps').createSignedUrl(path, 3600);
  fail(error);
  return data.signedUrl;
}

const readSize = file => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
  img.src = url;
});

// Envia o mapa para maps/{mesa}/{uuid}.ext e atualiza o tabuleiro; remove o arquivo anterior.
export async function uploadMap(board, file) {
  if (!MAP_TYPES.includes(file.type)) throw new Error('Use uma imagem PNG, JPEG ou WebP.');
  if (file.size > MAP_MAX_BYTES) throw new Error('A imagem passa de 5 MB.');
  const { width, height } = await readSize(file);
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${board.table_id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('maps').upload(path, file, { contentType: file.type, upsert: false });
  fail(error);
  const w = Math.min(12000, Math.max(200, width));
  const h = Math.min(12000, Math.max(200, height));
  await updateBoard(board.id, { map_path: path, width: w, height: h });
  if (board.map_path) await supabase.storage.from('maps').remove([board.map_path]);
  return { path, width: w, height: h };
}
export async function removeMap(board) {
  await updateBoard(board.id, { map_path: null });
  if (board.map_path) await supabase.storage.from('maps').remove([board.map_path]);
}

// Posicao ajustada a grade (centro da celula) quando a grade esta visivel.
export function snapToGrid(value, size) {
  return Math.round(value / size - 0.5) * size + size / 2;
}
