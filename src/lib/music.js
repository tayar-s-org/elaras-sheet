import { supabase } from './supabase.js';
import { MUSIC_EXT, musicFileError } from '../music.js';
import { createSignedUrlCache } from './signedUrlCache.js';
import { replaceStoredFile } from './replaceStoredFile.js';

const fail = error => { if (error) throw new Error(error.message || 'Erro ao acessar a nuvem.'); };

const URL_TTL_SECONDS = 6 * 3600;
const urlCache = createSignedUrlCache({
  ttlMs: URL_TTL_SECONDS * 1000,
  sign: async path => {
    const { data, error } = await supabase.storage.from('music').createSignedUrl(path, URL_TTL_SECONDS);
    fail(error);
    return data.signedUrl;
  },
});

// Link temporário do arquivo (só membros da mesa conseguem). Fica em cache até perto de expirar.
export async function musicUrl(path) {
  return path ? urlCache.get(path) : null;
}
// Esquece o link guardado (arquivo apagado ou link que o navegador recusou).
export const forgetMusicUrl = path => urlCache.forget(path);

// Envia o arquivo para a pasta da mesa e devolve o caminho.
async function uploadMusic(tableId, file) {
  const err = musicFileError(file);
  if (err) throw new Error(err);
  const path = `${tableId}/${crypto.randomUUID()}.${MUSIC_EXT[file.type]}`;
  const { error } = await supabase.storage.from('music').upload(path, file, { contentType: file.type, upsert: false });
  if (error && /bucket/i.test(error.message || '')) throw new Error('Música indisponível: falta rodar a migração 0015 no Supabase.');
  fail(error);
  return path;
}

export async function removeMusicFile(path) {
  if (!path) return;
  forgetMusicUrl(path);
  await supabase.storage.from('music').remove([path]);
}

// Troca a música: `persist(path)` grava a referência nova; o arquivo antigo só é apagado depois disso.
export const replaceMusic = (tableId, file, previousPath, persist) =>
  replaceStoredFile({ upload: () => uploadMusic(tableId, file), persist, remove: removeMusicFile, previousPath });
