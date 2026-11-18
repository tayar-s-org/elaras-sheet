import { supabase } from './supabase.js';

const fail = (error, fallback) => { if (error) throw new Error(error.message || fallback); };

// Concessões, distribuições e histórico de Aptidão da mesa (o mestre vê todos; o jogador, os da própria ficha).
// Devolve null se a migration 0026 ainda não foi rodada.
export async function loadAptitude(tableId) {
  const [g, a, l] = await Promise.all([
    supabase.from('aptitude_grants').select('id,character_id,roll,granted_by,created_at').eq('table_id', tableId).order('created_at', { ascending: false }).limit(1000),
    supabase.from('character_aptitude').select('character_id,allocation,revision,updated_at').eq('table_id', tableId),
    supabase.from('aptitude_log').select('id,character_id,user_id,before_alloc,after_alloc,points_received,created_at').eq('table_id', tableId).order('id', { ascending: false }).limit(300),
  ]);
  if (g.error || a.error || l.error) return null;
  const out = { grants: {}, allocation: {}, log: {} };
  for (const r of g.data) (out.grants[r.character_id] ||= []).push(r);
  for (const r of a.data) out.allocation[r.character_id] = r.allocation || {};
  for (const r of l.data) (out.log[r.character_id] ||= []).push(r);
  return out;
}

// Mestre: concede uma rolagem de 1d100. `requestId` identifica este pedido: repetir o mesmo (clique duplo, falha de
// conexão) devolve a rolagem que já existe em vez de sortear outra.
export async function grantAptitude(tableId, characterId, requestId) {
  const { data, error } = await supabase.rpc('grant_aptitude', { p_table: tableId, p_character: characterId, p_request: requestId });
  fail(error, 'Não foi possível conceder Aptidão.');
  return data;
}

// Jogador: confirma a distribuição ({ "attribute:Força": 5, "skill:Conjurar": 3 }).
export async function saveAptitude(tableId, characterId, allocation) {
  const { data, error } = await supabase.rpc('set_aptitude', { p_table: tableId, p_character: characterId, p_allocation: allocation });
  fail(error, 'Não foi possível confirmar a distribuição.');
  return data;
}

// Aptidão de UM personagem (ficha, token e telas do mestre). Sem tableId junta o que a RLS libera (o dono vê as próprias
// concessões de qualquer mesa). Devolve { allocation, received, distributed, available } ou null.
export async function loadCharacterAptitude(characterId, tableId = null) {
  let g = supabase.from('aptitude_grants').select('roll,table_id').eq('character_id', characterId);
  let a = supabase.from('character_aptitude').select('allocation,table_id,updated_at').eq('character_id', characterId).order('updated_at', { ascending: false });
  if (tableId) { g = g.eq('table_id', tableId); a = a.eq('table_id', tableId); }
  const [gr, al] = await Promise.all([g, a]);
  if (gr.error || al.error) return null;
  const allocation = al.data[0]?.allocation || {};
  const received = gr.data.reduce((s, r) => s + r.roll, 0);
  const distributed = Object.values(allocation).reduce((s, v) => s + v, 0);
  return { allocation, received, distributed, available: received - distributed };
}
