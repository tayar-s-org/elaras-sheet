import { useEffect, useRef, useState } from 'react';
import { SHEETS_STORAGE, readStoredSheets, keepRejectedSheets } from '../sheets.js';

const readInitialSheets = () => {
  try { return readStoredSheets(localStorage); }
  catch { return readStoredSheets({ getItem: () => null }); }
};

// Abas recusadas na restauracao seriam apagadas pela proxima gravacao da sessao: guarda-as a parte e avisa.
function keepAndReportRejected(rejected, notify) {
  let kept = true;
  try { keepRejectedSheets(localStorage, rejected); } catch { kept = false; }
  notify(`${rejected.length} aba(s) salva(s) neste navegador estavam inválidas e não foram restauradas.${kept ? ' Os dados originais ficaram guardados para recuperação.' : ''}`);
}

// Sessão de fichas (abas) deste navegador: restaura do armazenamento local e grava a cada mudança.
export function useSheetSession(notify) {
  const [restored] = useState(readInitialSheets);
  const [session, setSession] = useState(restored.session);
  const [storageError, setStorageError] = useState(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    if (restored.rejected.length) keepAndReportRejected(restored.rejected, notify);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SHEETS_STORAGE, JSON.stringify(session));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [session]);
  return { session, setSession, sessionRef, storageError };
}
