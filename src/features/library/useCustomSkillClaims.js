import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import { claimCustomSkills } from '../../lib/customSkills.js';
import { editSheet } from '../../sheets.js';
import { SKILLS } from '../../rules.js';
import { addCustomSkill } from '../../skills/custom.js';

const FIXED = SKILLS.map(([name]) => name);

// Coloca na ficha as perícias personalizadas que o mestre aprovou. Recolhe ao abrir, quando a aba volta ao foco e a cada
// 15 s. Cada pedido é entregue uma vez só; o rascunho local guarda o resultado mesmo se a aba fechar antes do autosave.
export function useCustomSkillClaims(session, setSession, user, notify) {
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const busy = useRef(false);

  useEffect(() => {
    if (!supabase || !user) return undefined;
    let alive = true;
    let disabled = false;
    const claimAll = async () => {
      if (disabled || busy.current) return;
      busy.current = true;
      try {
        for (const sheet of sessionRef.current.sheets) {
          const id = sheet.cloud?.id;
          if (!id || !alive) continue;
          try {
            const rows = await claimCustomSkills(id);
            if (rows.length) {
              setSession(prev => editSheet(prev, sheet.id, ch => rows.reduce((acc, row) => addCustomSkill(acc, row, FIXED), ch)));
              const names = rows.map(r => `${r.name} (d${r.die})`).join(', ');
              notifyRef.current?.(`🎓 O mestre aprovou ${rows.length > 1 ? 'as perícias' : 'a perícia'} ${names}. Já ${rows.length > 1 ? 'estão' : 'está'} na ficha de ${sheet.character.name || 'sua ficha'}.`);
            }
          } catch (error) {
            if (/claim_custom_skills|schema cache|does not exist/i.test(error.message)) { disabled = true; return; } // migration 0027 pendente
          }
        }
      } finally {
        busy.current = false;
      }
    };
    const first = setTimeout(claimAll, 3500);
    const timer = setInterval(claimAll, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') claimAll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.id, setSession]);
}
