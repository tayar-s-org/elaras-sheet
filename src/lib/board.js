import { supabase } from './supabase.js';
import { boardGrid } from '../boardGrid.js';
import { mergeSecrets } from '../tokenState.js';

const fail = error => { if (error) throw new Error(error.message || 'Erro ao acessar a nuvem.'); };
const BOARD_COLS = 'id,table_id,name,map_path,width,height,grid,settings';
const TOKEN_COLS = 'id,board_id,table_id,kind,name,character_id,x,y,size,color,hidden,image_path,meta,name_hidden,effects';
const SECRET_COLS = 'token_id,name,image_path';
const MARK_COLS = 'id,board_id,kind,x,y,text,color,created_by';

export const MAP_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAP_MAX_BYTES = 5 * 1024 * 1024;

export async function loadBoard(tableId) {
  const { data, error } = await supabase.from('boards').select(BOARD_COLS).eq('table_id', tableId)
    .order('created_at').limit(1).maybeSingle();
  fail(error);
  return data;
}
// Tokens com nome oculto chegam em branco; o mestre (e só ele, pela RLS) recebe os valores reais em board_token_secrets.
// Se a leitura dos segredos falhar, o tabuleiro continua carregando (o nome oculto fica em branco).
export async function loadBoardItems(boardId) {
  const [tokens, marks, secrets] = await Promise.all([
    supabase.from('board_tokens').select(TOKEN_COLS).eq('board_id', boardId),
    supabase.from('board_marks').select(MARK_COLS).eq('board_id', boardId),
    supabase.from('board_token_secrets').select(SECRET_COLS).eq('board_id', boardId),
  ]);
  fail(tokens.error);
  fail(marks.error);
  return { tokens: mergeSecrets(tokens.data, secrets.error ? [] : secrets.data), marks: marks.data };
}
export async function updateBoard(id, patch) {
  const { error } = await supabase.from('boards').update(patch).eq('id', id);
  fail(error);
}
export async function addToken(board, token) {
  const { data, error } = await supabase.from('board_tokens')
    .insert({ board_id: board.id, table_id: board.table_id, ...token }).select(TOKEN_COLS).single();
  fail(error);
  // Criado com nome oculto, o servidor devolve a linha em branco; quem criou (o mestre) continua com o nome e a imagem reais.
  return data.name_hidden && !data.name ? { ...data, name: token.name || '', image_path: token.image_path || null } : data;
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

export function validateMapFile(file) {
  if (!MAP_TYPES.includes(file?.type)) throw new Error('Use uma imagem PNG, JPEG ou WebP.');
  if (file.size > MAP_MAX_BYTES) throw new Error('A imagem passa de 5 MB.');
}

export async function putMapFile(bucket, tableId, file) {
  validateMapFile(file);
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${tableId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
  fail(error);
  return path;
}

export async function saveBoardGrid(board, grid) {
  const query = supabase.from('boards').update({ grid:boardGrid(grid) }).eq('id',board.id);
  const match = board.map_path ? query.eq('map_path',board.map_path) : query.is('map_path',null);
  const { data, error } = await match.select(BOARD_COLS).maybeSingle();
  fail(error);
  if (!data) throw new Error('O mapa mudou durante a calibração. Abra o mapa atualizado e tente novamente.');
  return data;
}

export async function switchBoardMap(board, path, size, grid, clearMarks) {
  const { data, error } = await supabase.rpc('switch_board_map', {
    p_board: board.id, p_previous: board.map_path || null, p_path: path,
    p_width: size.width, p_height: size.height, p_grid: boardGrid(grid), p_clear_marks: clearMarks,
  }).single();
  fail(error);
  if (board.map_path && board.map_path !== data.map_path) {
    await supabase.storage.from('maps').remove([board.map_path]).catch(() => {});
  }
  return data;
}

// O tabuleiro tem sempre ~2000 unidades no lado maior, qualquer que seja o tamanho da imagem: assim a grade de 70
// e os tokens mantem a mesma escala e o mapa novo nunca aparece minusculo ou gigante.
export const BOARD_BASE = 2000;
export const DEFAULT_SIZE = { width: 2000, height: 1400 };
const clampNum = (v, a, b) => Math.min(b, Math.max(a, v));
export function fitMapSize(width, height) {
  const scale = BOARD_BASE / Math.max(1, width, height);
  return { width: clampNum(Math.round(width * scale), 200, 12000), height: clampNum(Math.round(height * scale), 200, 12000) };
}

// Aplica uma lista de movimentos {id,x,y} a uma lista de tokens (estado local).
export const applyMoves = (tokens, moves) => tokens.map(t => { const m = moves.find(x => x.id === t.id); return m ? { ...t, x: m.x, y: m.y } : t; });

// Recuperacao: traz todos os tokens para o centro do tabuleiro, lado a lado, alinhados a grade.
export async function gatherTokens(board, tokens) {
  const cell = Math.min(400, Math.max(20, Number(board.grid?.size) || 70));
  const perRow = 6;
  const moves = tokens.map((t, i) => ({
    id: t.id,
    x: clampNum(Math.round(board.width / 2 + ((i % perRow) - (perRow - 1) / 2) * cell * 1.5), 0, board.width),
    y: clampNum(Math.round(board.height / 2 + (Math.floor(i / perRow) - 0.5) * cell * 1.5), 0, board.height),
  }));
  await Promise.all(moves.map(m => updateToken(m.id, { x: m.x, y: m.y })));
  return moves;
}

export async function loadCreatureDetails(id) {
  const { data, error } = await supabase.from('creature_token_details').select('details').eq('token_id', id).maybeSingle();
  fail(error);
  return data?.details || {};
}

export async function saveCreatureToken(board, targetId, token, details) {
  const { data, error } = await supabase.rpc('save_creature_token', {
    p_board: board.id, p_token: targetId, p_data: token, p_details: details,
  }).single();
  fail(error);
  return data.name_hidden ? { ...data, name: token.name, image_path: token.image_path } : data;
}
