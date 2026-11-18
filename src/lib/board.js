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
export async function uploadMap(board, file, tokens = []) {
  if (!MAP_TYPES.includes(file.type)) throw new Error('Use uma imagem PNG, JPEG ou WebP.');
  if (file.size > MAP_MAX_BYTES) throw new Error('A imagem passa de 5 MB.');
  const { width, height } = await readSize(file);
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${board.table_id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('maps').upload(path, file, { contentType: file.type, upsert: false });
  fail(error);
  const size = fitMapSize(width, height);
  await updateBoard(board.id, { map_path: path, width: size.width, height: size.height });
  if (board.map_path) await supabase.storage.from('maps').remove([board.map_path]);
  const moved = await relayoutBoard(board, tokens, size);
  return { path, width: size.width, height: size.height, moved };
}
// Tirar o mapa volta o tabuleiro ao tamanho padrao (senao ele ficaria com o tamanho enorme do mapa antigo).
export async function removeMap(board, tokens = []) {
  await updateBoard(board.id, { map_path: null, width: DEFAULT_SIZE.width, height: DEFAULT_SIZE.height });
  if (board.map_path) await supabase.storage.from('maps').remove([board.map_path]);
  const moved = await relayoutBoard(board, tokens, DEFAULT_SIZE);
  return { ...DEFAULT_SIZE, moved };
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

// Mudou o tamanho do tabuleiro: leva os tokens junto (mesma posicao relativa) e apaga os marcadores, que eram do mapa antigo.
export async function relayoutBoard(board, tokens, size) {
  const sx = size.width / (board.width || size.width), sy = size.height / (board.height || size.height);
  const cell = Math.min(400, Math.max(20, Number(board.grid?.size) || 70));
  // Tokens que ja estavam fora do tabuleiro antigo vao para o centro do novo, lado a lado (escalar nao os traria de volta).
  const outside = tokens.filter(t => t.x < 0 || t.y < 0 || t.x > board.width || t.y > board.height);
  const moves = tokens.map(t => {
    const i = outside.indexOf(t);
    if (i >= 0) {
      return { id: t.id, x: Math.round(clampNum(size.width / 2 + ((i % 6) - 2.5) * cell * 1.5, 0, size.width)), y: Math.round(clampNum(size.height / 2 + (Math.floor(i / 6) - 0.5) * cell * 1.5, 0, size.height)) };
    }
    return { id: t.id, x: Math.round(clampNum(t.x * sx, 0, size.width)), y: Math.round(clampNum(t.y * sy, 0, size.height)) };
  }).filter(m => { const t = tokens.find(x => x.id === m.id); return Math.abs(m.x - t.x) > 0.5 || Math.abs(m.y - t.y) > 0.5; });
  await Promise.all(moves.map(m => updateToken(m.id, { x: m.x, y: m.y })));
  await clearMarks(board.id);
  return moves;
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

// Posicao ajustada a grade (centro da celula) quando a grade esta visivel.
export function snapToGrid(value, size) {
  return Math.round(value / size - 0.5) * size + size / 2;
}
