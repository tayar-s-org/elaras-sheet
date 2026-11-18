import { supabase } from './supabase.js';

export const TRAINING_STATUS = { draft: 'Rascunho', pending: 'Pendente de aprovação', approved: 'Aprovada' };

const COLS = 'id,user_id,character_id,name,data,status,review_note,created_at';
const fail = (error, fallback) => { if (error) throw new Error(error.message || fallback); };

// Todas as rotinas da mesa (cada ficha pode ter várias, com nome). Devolve null se a migration 0023 ainda não foi rodada.
export async function loadRoutines(tableId) {
  const { data, error } = await supabase.from('table_training').select(COLS).eq('table_id', tableId).order('created_at');
  return error ? null : data;
}
// Só id, dono, nome e estado (mais leve, para os avisos e a aba de aprovações).
export async function loadRoutineList(tableId) {
  const { data, error } = await supabase.from('table_training').select('id,user_id,character_id,name,status').eq('table_id', tableId).order('created_at');
  return error ? null : data;
}
export async function createRoutine(tableId, name, data) {
  const { data: row, error } = await supabase.from('table_training').insert({ table_id: tableId, name, data }).select(COLS).single();
  fail(error, 'Não foi possível criar a rotina.');
  return row;
}
// Dono: salva o nome e os dados (editar os dados de uma rotina enviada ou aprovada volta a rascunho no servidor).
export async function saveRoutine(id, { name, data }) {
  const { error } = await supabase.from('table_training').update({ name, data }).eq('id', id);
  fail(error, 'Não foi possível salvar a rotina.');
}
// Dono: envia a rotina (com os dados atuais) para o mestre aprovar.
export async function submitRoutine(id, data) {
  const { error } = await supabase.from('table_training').update({ data, status: 'pending' }).eq('id', id);
  fail(error, 'Não foi possível enviar a rotina.');
}
// Dono retira o envio (volta a rascunho); mestre aprova ('approved') ou devolve ('draft', com texto).
export async function setRoutineStatus(id, status, note) {
  const patch = note ? { status, review_note: note.trim().slice(0, 500) } : { status };
  const { data, error } = await supabase.from('table_training').update(patch).eq('id', id).select('status');
  fail(error, 'Não foi possível atualizar a rotina.');
  if (!data?.length) throw new Error('Sem permissão para alterar esta rotina.');
}
export async function deleteRoutine(id) {
  const { error } = await supabase.from('table_training').delete().eq('id', id);
  fail(error, 'Não foi possível apagar a rotina.');
}
