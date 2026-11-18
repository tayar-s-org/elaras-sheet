import { supabase } from './supabase.js';
import { MUSIC_EXT, musicFileError } from '../music.js';

const fail = error => { if (error) throw new Error(error.message || 'Erro ao acessar a nuvem.'); };

// Link temporário do arquivo (só membros da mesa conseguem).
export async function musicUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('music').createSignedUrl(path, 6 * 3600);
  fail(error);
  return data.signedUrl;
}

// Envia o arquivo para a pasta da mesa e devolve o caminho. Apaga o anterior (se houver).
export async function uploadMusic(tableId, file, previousPath = '') {
  const err = musicFileError(file);
  if (err) throw new Error(err);
  const path = `${tableId}/${crypto.randomUUID()}.${MUSIC_EXT[file.type]}`;
  const { error } = await supabase.storage.from('music').upload(path, file, { contentType: file.type, upsert: false });
  if (error && /bucket/i.test(error.message || '')) throw new Error('Música indisponível: falta rodar a migração 0015 no Supabase.');
  fail(error);
  if (previousPath) await supabase.storage.from('music').remove([previousPath]);
  return path;
}

export async function removeMusicFile(path) {
  if (path) await supabase.storage.from('music').remove([path]);
}
