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

export const TRAINING_STATUS = { draft: 'Rascunho', pending: 'Pendente de aprovação', approved: 'Aprovada' };

// Estado de aprovação de cada rotina da mesa ({ user_id: 'draft' | 'pending' | 'approved' }); null se a migration 0017 não foi rodada.
export async function loadRoutineStatuses(tableId) {
  const { data, error } = await supabase.from('table_training').select('user_id,status').eq('table_id', tableId);
  if (error) return null;
  return Object.fromEntries(data.map(r => [r.user_id, r.status]));
}
// Textos de devolução do mestre ({ user_id: texto }); vazio se a migration 0019 ainda não foi rodada.
export async function loadReturnNotes(tableId) {
  const { data, error } = await supabase.from('table_training').select('user_id,review_note').eq('table_id', tableId);
  if (error) return {};
  return Object.fromEntries(data.filter(r => r.review_note).map(r => [r.user_id, r.review_note]));
}
// Jogador: envia a rotina (com os dados atuais) para o mestre aprovar.
export async function submitRoutine(tableId, userId, data) {
  const { error } = await supabase.from('table_training')
    .upsert({ table_id: tableId, user_id: userId, data, status: 'pending' }, { onConflict: 'table_id,user_id' });
  if (error) throw new Error(error.message || 'Não foi possível enviar a rotina.');
}
// Jogador retira o envio (volta a rascunho); mestre aprova ('approved') ou devolve ('draft').
export async function setRoutineStatus(tableId, userId, status, note) {
  const patch = note ? { status, review_note: note.trim().slice(0, 500) } : { status };
  const { data, error } = await supabase.from('table_training').update(patch).eq('table_id', tableId).eq('user_id', userId).select('status');
  if (error) throw new Error(error.message || 'Não foi possível atualizar a rotina.');
  if (!data?.length) throw new Error('Sem permissão para alterar esta rotina.');
}
