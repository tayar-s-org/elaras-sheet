import { useEffect, useRef, useState } from 'react';
import { createCharacter, updateCharacter, ConflictError } from '../../lib/cloud.js';
import { setCloud } from '../../sheets.js';
import { newCharacter } from '../../rules.js';

const BLANK = JSON.stringify(newCharacter());
const DELAY = 1000;
const RETRY = 8000;

// Salva na conta, sozinho, toda ficha alterada. Uma ficha em branco so e criada na nuvem depois da primeira edicao.
export function useAutosave(session, setSession, enabled) {
  const [status, setStatus] = useState({ state: 'idle', message: '' });
  const inflight = useRef(new Set());
  const blocked = useRef(new Set());   // conflito de versao: nao tenta de novo sozinho
  const failed = useRef(new Map());    // id -> ultimo JSON que falhou
  const [retry, setRetry] = useState(0); // muda para reavaliar as fichas que falharam

  useEffect(() => {
    if (!enabled) return undefined;
    const timers = [];
    for (const sheet of session.sheets) {
      const json = JSON.stringify(sheet.character);
      const dirty = sheet.cloud ? json !== sheet.cloud.base : json !== BLANK;
      if (!dirty || inflight.current.has(sheet.id) || blocked.current.has(sheet.id) || failed.current.get(sheet.id) === json) continue;
      timers.push(setTimeout(async () => {
        inflight.current.add(sheet.id);
        setStatus({ state: 'saving', message: 'Salvando…' });
        try {
          const row = sheet.cloud
            ? await updateCharacter(sheet.cloud.id, sheet.cloud.revision, sheet.character)
            : await createCharacter(sheet.character);
          failed.current.delete(sheet.id);
          // A base e o que foi enviado; se houve nova edicao durante o envio, a ficha continua "suja" e salva de novo.
          setSession(prev => setCloud(prev, sheet.id, { id: row.id, revision: row.revision, character: sheet.character }));
          setStatus({ state: 'saved', message: 'Salvo na nuvem' });
        } catch (error) {
          if (error instanceof ConflictError) {
            blocked.current.add(sheet.id);
            setStatus({ state: 'error', message: 'Esta ficha mudou em outro lugar. Feche a aba e abra a versão da nuvem em "Minhas fichas".' });
          } else {
            failed.current.set(sheet.id, json);
            setTimeout(() => { if (failed.current.get(sheet.id) === json) { failed.current.delete(sheet.id); setRetry(n => n + 1); } }, RETRY);
            setStatus({ state: 'error', message: `Não foi possível salvar: ${error.message}` });
          }
        } finally {
          inflight.current.delete(sheet.id);
        }
      }, DELAY));
    }
    return () => timers.forEach(clearTimeout);
  }, [session, enabled, setSession, retry]);

  // Ao trocar de conta ou sair, esquece conflitos e falhas da conta anterior.
  useEffect(() => { if (!enabled) { blocked.current.clear(); failed.current.clear(); setStatus({ state: 'idle', message: '' }); } }, [enabled]);
  return status;
}
