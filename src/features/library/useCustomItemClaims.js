import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import { claimCustomItems, listMyCustomItems } from '../../lib/customItems.js';
import { editSheet } from '../../sheets.js';
import { ATTRIBUTES, SKILLS } from '../../rules.js';
import { customEntry } from '../../market/custom.js';
import { addCustomEntries, discardItem } from '../../market/inventory.js';
import { customId } from '../../market/custom.js';

const LISTS = { attributes: ATTRIBUTES, skills: SKILLS.map(([name]) => name) };

// Coloca na mochila da ficha os itens customizados que o mestre aprovou. Recolhe ao abrir, quando a aba volta ao foco
// e a cada 15 s. Cada item e entregue uma vez so; o rascunho local guarda o resultado mesmo se a aba fechar antes do autosave.
export function useCustomItemClaims(session, setSession, user, notify) {
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
            const rows = await claimCustomItems(id);
            const entries = rows.map(row => customEntry(row, LISTS)).filter(Boolean);
            if (entries.length) {
              setSession(prev => editSheet(prev, sheet.id, ch => addCustomEntries(ch, entries)));
              const names = entries.map(e => e.custom.name).join(', ');
              notifyRef.current?.(`✨ O mestre aprovou ${entries.length > 1 ? 'os itens' : 'o item'} ${names}. ${entries.length > 1 ? 'Estão' : 'Está'} na mochila de ${sheet.character.name || 'sua ficha'}.`);
            }
            // Itens que o mestre revogou saem da mochila.
            const mine = await listMyCustomItems();
            const revoked = new Set((mine || []).filter(r => r.status === 'rejected').map(r => customId(r.id)));
            const gone = (sheet.character.inventory || []).filter(e => revoked.has(e.id));
            if (gone.length) {
              setSession(prev => editSheet(prev, sheet.id, ch => gone.reduce((acc, e) => discardItem(acc, e.id) || acc, ch)));
              notifyRef.current?.(`O mestre revogou ${gone.length > 1 ? 'os itens' : 'o item'} ${gone.map(e => e.custom?.name || 'customizado').join(', ')}. ${gone.length > 1 ? 'Saíram' : 'Saiu'} da mochila de ${sheet.character.name || 'sua ficha'}.`);
            }
          } catch (error) {
            if (/claim_custom_items|schema cache|does not exist/i.test(error.message)) { disabled = true; return; } // migration 0018 pendente
          }
        }
      } finally {
        busy.current = false;
      }
    };
    const first = setTimeout(claimAll, 3000);
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
