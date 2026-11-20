import { useEffect, useRef, useState } from 'react';
import { SHEETS_STORAGE, readStoredSheets, keepRejectedSheets } from '../sheets.js';

const readInitialSheets = () => {
  try { return readStoredSheets(localStorage); }
  catch { return readStoredSheets({ getItem: () => null }); }
};

// Abas recusadas na restauracao seriam apagadas pela proxima gravacao da sessao: guarda-as a parte antes de gravar.
// Devolve `canPersist()`: false enquanto a copia nao foi feita, para a sessao nao ser gravada por cima dos dados originais.
function useRejectedTabsKeeper(rejected, notify) {
  const pending = useRef(rejected);
  const warnedFailure = useRef(false);
  return () => {
    if (!pending.current.length) return true;
    try {
      keepRejectedSheets(localStorage, pending.current);
    } catch {
      if (!warnedFailure.current) {
        warnedFailure.current = true;
        notify(`${pending.current.length} aba(s) salva(s) neste navegador estavam inválidas e não foram restauradas. Não foi possível guardar os dados originais (armazenamento indisponível ou cheio); suas alterações não serão gravadas neste navegador por enquanto.`);
      }
      return false;
    }
    notify(`${pending.current.length} aba(s) salva(s) neste navegador estavam inválidas e não foram restauradas. Os dados originais continuam guardados no armazenamento do navegador, mas o app ainda não tem tela para recuperá-los.`);
    pending.current = [];
    return true;
  };
}

// Sessão de fichas (abas) deste navegador: restaura do armazenamento local e grava a cada mudança.
export function useSheetSession(notify) {
  const [restored] = useState(readInitialSheets);
  const [session, setSession] = useState(restored.session);
  const [storageError, setStorageError] = useState(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const canPersist = useRejectedTabsKeeper(restored.rejected, notify);
  useEffect(() => {
    if (!canPersist()) { setStorageError(true); return; }
    try {
      localStorage.setItem(SHEETS_STORAGE, JSON.stringify(session));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [session]);
  return { session, setSession, sessionRef, storageError };
}
