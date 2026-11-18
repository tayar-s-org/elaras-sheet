import { supabase } from './supabase.js';

export const TOKEN_SIZE = 512;

// Envia o PNG do token para tokens/{usuario}/{uuid}.png e devolve o caminho; remove o arquivo anterior, se houver.
export async function uploadTokenImage(userId, blob, previousPath = '') {
  if (!supabase) throw new Error('A nuvem não está configurada.');
  const path = `${userId}/${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage.from('tokens').upload(path, blob, { contentType: 'image/png', upsert: false });
  if (error) throw new Error(error.message || 'Não foi possível enviar o token.');
  if (previousPath && previousPath.startsWith(`${userId}/`)) await supabase.storage.from('tokens').remove([previousPath]).catch(() => {});
  return path;
}

export function tokenUrl(path) {
  if (!path || !supabase) return null;
  return supabase.storage.from('tokens').getPublicUrl(path).data.publicUrl;
}
