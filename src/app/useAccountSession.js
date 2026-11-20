import { useEffect, useRef, useState } from 'react';
import { LEGACY_STORAGE, SHEETS_STORAGE, newSession, closeSheet } from '../sheets.js';
import { navigate } from '../lib/router.js';
import { supabase } from '../lib/supabase.js';
import { mergeDraftSheets, stashAccountDrafts, takeAccountDrafts } from './accountDrafts.js';

const OWNER_KEY = 'manrakora-sheets-owner';
const LAST_ROOM_KEY = 'elara-last-room';

function readOwner() {
  try { return localStorage.getItem(OWNER_KEY); } catch { return null; }
}
function writeOwner(userId) {
  try { localStorage.setItem(OWNER_KEY, userId); } catch { /* sem storage */ }
}
function stashDrafts(userId, session) {
  try { stashAccountDrafts(localStorage, userId, session); } catch { /* sem storage */ }
}
function takeDrafts(userId) {
  try { return takeAccountDrafts(localStorage, userId); } catch { return []; }
}
// Abas ligadas a fichas de outra pessoa (abertas por um erro antigo da lista) saem; so as da propria conta ficam.
function closeForeignCloudTabs(session, userId, setSession) {
  const linked = [...new Set(session.sheets.filter(s => s.cloud).map(s => s.cloud.id))];
  if (!supabase || !linked.length) return;
  supabase.from('characters').select('id,owner_id').in('id', linked).then(({ data }) => {
    const foreign = new Set((data || []).filter(r => r.owner_id !== userId).map(r => r.id));
    if (foreign.size) setSession(prev => prev.sheets.filter(s => s.cloud && foreign.has(s.cloud.id)).reduce((acc, s) => closeSheet(acc, s.id), prev));
  });
}

// Os rascunhos locais pertencem a quem os criou. Entrar com outra conta comeca em branco em vez de enviar fichas alheias,
// mas o que ainda nao tinha sido salvo fica guardado para o dono (ao sair ou trocar de conta) e volta quando ele entra de novo.
// Modelos de arquetipo (outra chave do armazenamento) nao entram aqui: so a pessoa os apaga.
export function useAccountSession({ auth, sessionRef, setSession, autosave }) {
  const userId = auth.user?.id;
  useEffect(() => {
    if (!userId) return;
    const owner = readOwner();
    let next = sessionRef.current;
    if (owner && owner !== userId) {
      stashDrafts(owner, next);
      next = newSession();
    }
    next = mergeDraftSheets(next, takeDrafts(userId));
    if (next !== sessionRef.current) setSession(next);
    writeOwner(userId);
    closeForeignCloudTabs(next, userId, setSession);
  }, [userId]);

  const [signingOut, setSigningOut] = useState(false);
  const signOutRunning = useRef(false);
  async function signOut() {
    if (signOutRunning.current) return;
    signOutRunning.current = true;
    setSigningOut(true);
    try {
      const leaving = userId;
      await autosave.flush(); // edicao recente ainda esta no tempo de espera do salvamento automatico
      await auth.signOut();
      // Limitacao: se o limite do flush estourou com uma ficha nova ainda sendo criada na nuvem, ela ainda nao tem id da nuvem e
      // vai para o cofre como rascunho local; ao voltar, pode ser criada de novo (ficha duplicada, que e melhor do que perder a ficha).
      if (leaving) stashDrafts(leaving, sessionRef.current);
      try { [SHEETS_STORAGE, LEGACY_STORAGE, OWNER_KEY, LAST_ROOM_KEY].forEach(key => localStorage.removeItem(key)); } catch { /* sem storage */ }
      setSession(newSession());
      navigate('/');
    } finally {
      signOutRunning.current = false;
      setSigningOut(false);
    }
  }
  return { signOut, signingOut };
}
