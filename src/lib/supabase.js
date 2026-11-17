import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cloudConfigured = Boolean(url && key);
// Apenas a chave publica (anon/publishable) vive no frontend; a seguranca vem do RLS.
export const supabase = cloudConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
