import { useCallback, useEffect, useRef, useState } from 'react';
import { createCharacter, updateCharacter, linkIfNoCharacter, getCharacter, ConflictError } from '../../lib/cloud.js';
import { rebaseSheet } from '../../sheetRebase.js';
import { setCloud, setSheetTable } from '../../sheets.js';
import { myMemberships } from '../../lib/tables.js';

const DELAY = 1000;
const RETRY = 8000;

// true se a pessoa não está mais (nem pendente) na mesa. Em caso de dúvida (erro de rede) devolve false.
async function lostTable(tableId) {
  try { return !(await myMemberships()).some(m => m.tables?.id === tableId); } catch { return false; }
}

// Salva na conta, sozinho, toda ficha alterada. A ficha so e criada na nuvem depois de escolher a mesa dela.
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
      // Ficha nova so vai para a nuvem depois de escolher a mesa para a qual ela e criada; escolhida a mesa, vai mesmo em branco
      // (senao ela nao apareceria na lista de fichas da sala ate a primeira edicao).
      if (!sheet.cloud && !sheet.tableId) continue;
      const dirty = sheet.cloud ? json !== sheet.cloud.base : true;
      if (!dirty || inflight.current.has(sheet.id) || blocked.current.has(sheet.id) || failed.current.get(sheet.id) === json) continue;
      timers.push(setTimeout(async () => {
        inflight.current.add(sheet.id);
        setStatus({ state: 'saving', message: 'Salvando…' });
        try {
          const row = sheet.cloud
            ? await updateCharacter(sheet.cloud.id, sheet.cloud.revision, sheet.character)
            : await createCharacter(sheet.character, sheet.tableId);
          if (!sheet.cloud && sheet.tableId) linkIfNoCharacter(sheet.tableId, row.id).catch(() => {}); // vira a ficha do jogador nessa mesa, se ele ainda nao tinha uma
          failed.current.delete(sheet.id);
          // A base e o que foi enviado; se houve nova edicao durante o envio, a ficha continua "suja" e salva de novo.
          setSession(prev => setCloud(prev, sheet.id, { id: row.id, revision: row.revision, character: sheet.character }));
          setStatus({ state: 'saved', message: 'Salvo na nuvem' });
        } catch (error) {
          // XP/dinheiro concedidos pelo mestre são gravados direto na ficha da nuvem: se foi só isso que mudou lá, soma e salva de novo.
          const fix = error instanceof ConflictError && sheet.cloud ? await getCharacter(sheet.cloud.id).then(row => rebaseSheet(sheet, row, { dirty: true })).catch(() => null) : null;
          if (fix) {
            setSession(prev => ({ ...prev, sheets: prev.sheets.map(s => (s.id === sheet.id && s.cloud?.revision === sheet.cloud.revision && JSON.stringify(s.character) === JSON.stringify(sheet.character) ? { ...s, character: fix.character, cloud: fix.cloud } : s)) }));
          } else if (error instanceof ConflictError) {
            blocked.current.add(sheet.id);
            setStatus({ state: 'error', message: 'Esta ficha mudou em outro lugar. Use Sincronizar com a nuvem para carregar a versão atual e guardar suas alterações em uma cópia local.' });
          } else if (!sheet.cloud && sheet.tableId && /row-level security/i.test(error.message || '') && await lostTable(sheet.tableId)) {
            // A ficha foi criada para uma mesa da qual a pessoa não participa mais (saiu, foi removida, o pedido foi recusado ou a
            // mesa foi apagada): o banco recusa criá-la. Solta a ficha da mesa para ela poder ser ligada a outra, em vez de tentar para sempre.
            const name = sheet.tableName || 'a mesa escolhida';
            setSession(prev => setSheetTable(prev, sheet.id, { tableId: '', tableName: '' }));
            setStatus({ state: 'error', message: `Esta ficha foi criada para ${name}, mas você não participa mais dela (saiu, foi removido ou a mesa foi apagada). Escolha outra mesa para a ficha ser salva.` });
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
  // Depois de sincronizar com a nuvem: libera as fichas travadas por conflito e tenta salvar de novo.
  const unblock = useCallback(() => { blocked.current.clear(); failed.current.clear(); setStatus({ state: 'idle', message: '' }); setRetry(n => n + 1); }, []);
  return { ...status, unblock };
}
