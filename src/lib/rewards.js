import { supabase } from './supabase.js';

const COLS = 'id,character_id,amount,note,granted_by,created_at,claimed_at';
// Concessoes recentes de XP e dinheiro da mesa (o mestre ve todas; o jogador so as da propria ficha, por RLS).
// Cada lista vem null se a tabela ainda nao existe (migrations 0009/0012 pendentes).
export async function recentRewards(tableId, limit = 80) {
  const get = async table => {
    const { data, error } = await supabase.from(table).select(COLS).eq('table_id', tableId).order('created_at', { ascending: false }).limit(limit);
    return error ? null : data;
  };
  const [xp, money] = await Promise.all([get('xp_awards'), get('money_awards')]);
  return { xp, money };
}
