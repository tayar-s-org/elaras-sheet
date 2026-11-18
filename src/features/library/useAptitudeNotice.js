import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';

// Avisa o jogador na hora em que o mestre concede uma rolagem de Aptidão (a RLS só entrega as concessões das fichas
// dele). Quem estava offline vê os pontos pendentes na aba Aptidão ("Aptidão (N)"). Não grava nada: é só um aviso.
export function useAptitudeNotice(user, notify) {
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  useEffect(() => {
    if (!supabase || !user) return undefined;
    const seen = new Set();
    const channel = supabase.channel(`aptitude:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'aptitude_grants' }, payload => {
        const row = payload.new;
        if (!row || seen.has(row.id) || row.granted_by === user.id) return; // o mestre já vê o resultado na tela dele
        seen.add(row.id);
        notifyRef.current?.(`🎲 O mestre concedeu Aptidão: 1d100 = ${row.roll}. Você recebeu ${row.roll} ponto(s) para distribuir (Rotina de Treino → Aptidão).`);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);
}
