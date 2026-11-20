import { supabase } from './supabase.js';

const COLS = 'id,character_id,amount,note,granted_by,created_at,claimed_at';
// Concessoes recentes de XP e dinheiro da mesa (o mestre ve todas; o jogador so as da propria ficha, por RLS).
// Cada lista vem null se a tabela ainda nao existe (migrations 0009/0012 pendentes).
export async function recentRewards(tableId, limit = 80) {
  const get = async table => {
    const { data, error } = await supabase.from(table).select(COLS).eq('table_id', tableId).order('created_at', { ascending: false }).limit(limit);
    return error ? null : data;
  };
  // Moedas e experiências personalizadas (migração 0045): vêm do histórico administrativo; o mestre lê todas, o jogador as do próprio personagem.
  const custom = async () => {
    const { data, error } = await supabase.from('master_audit_log').select('id,character_id,category,kind,before,after,note,actor_id,created_at')
      .eq('table_id', tableId).in('category', ['wallet', 'experience']).order('created_at', { ascending: false }).limit(limit);
    return error ? null : data;
  };
  const [xp, money, audit] = await Promise.all([get('xp_awards'), get('money_awards'), custom()]);
  return { xp, money, custom: audit };
}
