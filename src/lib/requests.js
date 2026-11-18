import { supabase } from './supabase.js';

const fail = (error, fallback) => { if (error) throw new Error(error.message || fallback); };
const COLS = 'id,table_id,character_id,user_id,kind,title,body,spell_id,status,gm_note,config,decided_at,created_at';

export const REQUEST_STATUS = { pending: 'Aguardando o mestre', approved: 'Aprovada', rejected: 'Rejeitada', changes: 'Alterações pedidas', done: 'Concluída' };
export const REQUEST_KIND = { work: 'Trabalho', spell_study: 'Melhoria de feitiço' };

// Todas as solicitações da mesa que o usuário pode ver (o mestre vê todas; o jogador, as das próprias fichas).
// Devolve null se a migration 0025 ainda não foi rodada.
export async function loadRequests(tableId) {
  const { data, error } = await supabase.from('routine_requests').select(COLS).eq('table_id', tableId).order('created_at', { ascending: false }).limit(500);
  return error ? null : data;
}

// Jogador: envia uma sugestão. A ficha vem do vínculo na mesa e o estado sempre começa em "aguardando".
export async function createRequest(tableId, characterId, { kind, title = '', body, spellId = null }) {
  const { data, error } = await supabase.from('routine_requests')
    .insert({ table_id: tableId, character_id: characterId, kind, title: title.trim().slice(0, 80), body: body.trim().slice(0, 2000), spell_id: spellId })
    .select(COLS).single();
  fail(error, 'Não foi possível enviar a sugestão.');
  return data;
}
// Jogador: edita o texto (volta a "aguardando" para o mestre ver de novo).
export async function editRequest(id, { title, body }) {
  const { error } = await supabase.from('routine_requests').update({ title: title.trim().slice(0, 80), body: body.trim().slice(0, 2000) }).eq('id', id);
  fail(error, 'Não foi possível salvar a sugestão.');
}
export async function deleteRequest(id) {
  const { error } = await supabase.from('routine_requests').delete().eq('id', id);
  fail(error, 'Não foi possível apagar a sugestão.');
}
// Mestre: decide ('approved' | 'rejected' | 'changes' | 'pending'), com nota e a configuração (custos, pagamento, XP…).
export async function decideRequest(id, status, { note = '', config } = {}) {
  const patch = { status, gm_note: note.trim().slice(0, 500) || null };
  if (config) patch.config = config;
  const { data, error } = await supabase.from('routine_requests').update(patch).eq('id', id).select('status');
  fail(error, 'Não foi possível salvar a decisão.');
  if (!data?.length) throw new Error('Sem permissão para decidir esta solicitação.');
}

// Trabalhos aprovados de uma ficha, no formato que o motor usa.
export function approvedJobs(requests, characterId) {
  return (requests || []).filter(r => r.kind === 'work' && r.status === 'approved' && r.character_id === characterId && r.config?.name).map(r => ({
    id: r.id, name: r.config.name, description: r.config.description || '',
    staminaTiers: (r.config.staminaTiers || [0, 0, 0]).map(Number), manaTiers: (r.config.manaTiers || [0, 0, 0]).map(Number),
    pay: Number(r.config.pay) || 0, xp: Number(r.config.xp) || 0, xpSkill: r.config.xpSkill || '',
  }));
}

// Jogador: tenta aprimorar o feitiço de uma solicitação aprovada (o servidor rola os 16 dados e decide).
export async function attemptUpgrade(requestId) {
  const { data, error } = await supabase.rpc('attempt_spell_upgrade', { p_request: requestId });
  fail(error, 'Não foi possível tentar o aprimoramento.');
  return data;
}
// Dono da ficha: recolhe as melhorias conquistadas ([{ spell_id, n, description, at }]) para aplicar na ficha.
export async function claimSpellUpgrades(characterId) {
  const { data, error } = await supabase.rpc('claim_spell_upgrades', { p_character: characterId });
  fail(error, 'Não foi possível recolher as melhorias.');
  return Array.isArray(data) ? data : [];
}

// Pity e melhorias por feitiço e tentativas (para a tela e para o mestre auditar).
export async function loadSpellProgress(tableId) {
  const { data, error } = await supabase.from('spell_progress').select('character_id,spell_id,pity,improvements').eq('table_id', tableId);
  if (error) return null;
  const out = {};
  for (const r of data) (out[r.character_id] ||= {})[r.spell_id] = { pity: r.pity, improvements: r.improvements };
  return out;
}
export async function loadAttempts(tableId, characterId) {
  const { data, error } = await supabase.from('spell_attempts')
    .select('id,request_id,spell_id,improvement_no,rolls,die,bonus,total,required_base,required_effective,pity_before,pity_after,success,xp_cost_shown,created_at')
    .eq('table_id', tableId).eq('character_id', characterId).order('id', { ascending: false }).limit(100);
  return error ? null : data;
}
