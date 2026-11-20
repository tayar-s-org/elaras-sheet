import { useEffect, useState } from 'react';
import { useConfirm } from '../ui/ConfirmProvider.jsx';
import { openSheet, openCloudSheet, syncCloudSheets, sheetsLosingChanges, applyTables } from '../sheets.js';
import { fetchCloudRows } from '../features/library/syncCloud.js';
import { listMine, getCharacter } from '../lib/cloud.js';

const MAX_OPENED_ON_LOGIN = 30;

const isOpenOrClosedByUser = (session, cloudId) => session.closedCloudIds?.includes(cloudId) || session.sheets.some(s => s.cloud?.id === cloudId);

// As fichas da conta viram abas: ao entrar, abre cada uma que ainda nao esta aberta (a aba ativa nao muda).
function useOpenAccountSheets(user, sessionRef, setSession) {
  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    (async () => {
      try {
        const mine = await listMine();
        if (alive) setSession(prev => applyTables(prev, mine)); // mesa de cada ficha segundo a nuvem
        for (const row of mine.slice(0, MAX_OPENED_ON_LOGIN)) {
          if (!alive) return;
          if (isOpenOrClosedByUser(sessionRef.current, row.id)) continue;
          const full = await getCharacter(row.id);
          if (!alive) return;
          setSession(prev => isOpenOrClosedByUser(prev, row.id) ? prev : { ...openCloudSheet(prev, full), activeId: prev.activeId });
        }
      } catch { /* a lista tenta de novo no proximo carregamento */ }
    })();
    return () => { alive = false; };
  }, [user?.id]);
}

const localCopyOf = sheet => ({ ...sheet.character, name: sheet.character.name ? `${sheet.character.name.slice(0, 85)} (cópia local)` : 'Cópia local' });

function syncSummary(result, hadConflicts) {
  if (hadConflicts) return 'Versões da nuvem carregadas. As alterações locais ficaram em abas de cópia.';
  return result.updated.length || result.added.length ? `Sincronizado: ${result.updated.length} atualizada(s), ${result.added.length} aberta(s).` : 'Tudo já está em dia com a nuvem.';
}

// Sincronizacao com a nuvem: abre as fichas da conta ao entrar e oferece "Sincronizar" sob demanda.
export function useCloudSync({ user, sessionRef, setSession, autosave }) {
  const askConfirm = useConfirm();
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState('');
  useOpenAccountSheets(user, sessionRef, setSession);

  const syncNow = async () => {
    setSyncing(true);
    setSyncNote('');
    try {
      const rows = await fetchCloudRows();
      const conflictsBeforePrompt = sheetsLosingChanges(sessionRef.current, rows);
      if (conflictsBeforePrompt.length && !(await askConfirm({ title: 'Sincronizar fichas?', text: 'A nuvem tem versões mais novas. Carregar essas versões e guardar as alterações locais em abas de cópia?', actionLabel: 'Sincronizar' }))) return;
      const current = sessionRef.current;
      const conflicts = sheetsLosingChanges(current, rows);
      const result = syncCloudSheets(current, rows);
      for (const sheet of conflicts) result.session = { ...openSheet(result.session, localCopyOf(sheet)), activeId: result.session.activeId };
      setSession(result.session);
      autosave.unblock();
      setSyncNote(syncSummary(result, conflicts.length > 0));
    } catch (e) { setSyncNote(`Não foi possível sincronizar: ${e.message}`); } finally { setSyncing(false); }
  };
  return { syncing, syncNote, syncNow };
}
