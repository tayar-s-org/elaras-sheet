import { supabase } from './supabase.js';

// Todas as rotinas da mesa; devolve null se a tabela ainda não existe (migration pendente).
export async function loadRoutines(tableId) {
  const { data, error } = await supabase.from('table_training').select('user_id,data').eq('table_id', tableId);
  if (error) return null;
  return Object.fromEntries(data.map(r => [r.user_id, r.data]));
}
export async function saveRoutine(tableId, userId, data) {
  const { error } = await supabase.from('table_training')
    .upsert({ table_id: tableId, user_id: userId, data }, { onConflict: 'table_id,user_id' });
  if (error) throw new Error(error.message || 'Não foi possível salvar a rotina.');
}
