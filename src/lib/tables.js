import { supabase } from './supabase.js';

const TABLE_COLS = 'id,owner_id,name,description,system,visibility,status,auto_approve,max_players,created_at';
const fail = error => { if (error) throw new Error(error.message || 'Erro ao acessar a nuvem.'); };

export const STATUS_LABEL = { open: 'Aberta', running: 'Em andamento', closed: 'Encerrada' };
export const MEMBER_LABEL = { pending: 'Aguardando', approved: 'Aprovado', rejected: 'Recusado', kicked: 'Removido', left: 'Saiu' };

export async function createTable({ name, description, visibility, autoApprove, maxPlayers }) {
  const { data, error } = await supabase.from('tables')
    .insert({ name: name.trim(), description: description.trim(), visibility, auto_approve: autoApprove, max_players: maxPlayers })
    .select('id').single();
  fail(error);
  return data.id;
}
export async function updateTable(id, patch) {
  const { error } = await supabase.from('tables').update(patch).eq('id', id);
  fail(error);
}
export async function deleteTable(id) {
  const { error } = await supabase.from('tables').delete().eq('id', id);
  fail(error);
}
export async function getTable(id) {
  const { data, error } = await supabase.from('tables').select(`${TABLE_COLS},profiles!tables_owner_id_fkey(display_name)`).eq('id', id).maybeSingle();
  fail(error);
  return data;
}
export async function myMemberships() {
  const { data, error } = await supabase.from('table_members')
    .select(`role,status,requested_at,tables(${TABLE_COLS})`)
    .in('status', ['pending', 'approved'])
    .order('requested_at', { ascending: false });
  fail(error);
  return data.filter(row => row.tables);
}
export async function listPublic(search = '') {
  const { data, error } = await supabase.rpc('list_public_tables', { p_search: search });
  fail(error);
  return data;
}
export async function getMembers(tableId) {
  const { data, error } = await supabase.from('table_members')
    .select('user_id,role,status,message,character_id,requested_at,profiles(display_name)')
    .eq('table_id', tableId).order('requested_at');
  fail(error);
  return data;
}
export async function joinPublic(tableId, message = '', characterId = null) {
  const { data, error } = await supabase.rpc('join_public_table', { p_table: tableId, p_message: message, p_character: characterId });
  fail(error);
  return data;
}
export async function joinByCode(code, message = '', characterId = null) {
  const { data, error } = await supabase.rpc('join_by_code', { p_code: code, p_message: message, p_character: characterId });
  fail(error);
  return data;
}
export async function decideMember(tableId, userId, status) {
  const { error } = await supabase.rpc('decide_member', { p_table: tableId, p_user: userId, p_status: status });
  fail(error);
}
export async function leaveTable(tableId) {
  const { error } = await supabase.rpc('leave_table', { p_table: tableId });
  fail(error);
}
export async function setMemberCharacter(tableId, characterId) {
  const { error } = await supabase.rpc('set_member_character', { p_table: tableId, p_character: characterId });
  fail(error);
}
export async function getInviteCode(tableId) {
  const { data, error } = await supabase.rpc('get_invite_code', { p_table: tableId });
  fail(error);
  return data;
}
export async function rotateInvite(tableId) {
  const { data, error } = await supabase.rpc('rotate_invite', { p_table: tableId });
  fail(error);
  return data;
}

export const inviteLink = code => `${window.location.origin}${window.location.pathname}#/convite/${code}`;
