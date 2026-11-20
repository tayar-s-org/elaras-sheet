import { newCharacter } from '../rules.js';
import { SHEETS_STORAGE, readStoredSheets } from '../sheets.js';

export const DRAFTS_STORAGE = 'manrakora-account-drafts';

const isUntouchedLocalBlank = sheet => !sheet.cloud && !sheet.tableId && JSON.stringify(sheet.character) === JSON.stringify(newCharacter());

// Ficha cujo conteúdo ainda não chegou à conta: alterada depois da última versão salva, ou rascunho local com conteúdo.
export const hasUnsavedChanges = sheet => (sheet.cloud ? JSON.stringify(sheet.character) !== sheet.cloud.base : !isUntouchedLocalBlank(sheet));

function readAllDrafts(storage) {
  try {
    const all = JSON.parse(storage.getItem(DRAFTS_STORAGE));
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch { return {}; }
}

// Guarda, por conta, as fichas que ainda não foram salvas ao sair ou trocar de conta, para a pessoa recuperá-las ao voltar.
export function stashAccountDrafts(storage, userId, session) {
  const all = readAllDrafts(storage);
  const sheets = session.sheets.filter(hasUnsavedChanges);
  if (sheets.length) all[userId] = { sheets, activeId: sheets[0].id };
  else delete all[userId];
  storage.setItem(DRAFTS_STORAGE, JSON.stringify(all));
}

// Devolve (e esquece) as fichas guardadas para a conta; passam pela mesma validação do rascunho local.
export function takeAccountDrafts(storage, userId) {
  const all = readAllDrafts(storage);
  if (!all[userId]) return [];
  const { session } = readStoredSheets({ getItem: key => (key === SHEETS_STORAGE ? JSON.stringify(all[userId]) : null) });
  delete all[userId];
  storage.setItem(DRAFTS_STORAGE, JSON.stringify(all));
  return session.sheets.filter(hasUnsavedChanges);
}

// Junta as fichas recuperadas à sessão atual sem duplicar abas (mesmo id ou mesma ficha da nuvem); uma única aba em branco dá lugar a elas.
export function mergeDraftSheets(session, drafts) {
  const alreadyOpen = draft => session.sheets.some(sheet => sheet.id === draft.id || (draft.cloud && sheet.cloud?.id === draft.cloud.id));
  const recovered = drafts.filter(draft => !alreadyOpen(draft));
  if (!recovered.length) return session;
  const kept = session.sheets.length === 1 && isUntouchedLocalBlank(session.sheets[0]) ? [] : session.sheets;
  const sheets = [...kept, ...recovered];
  return { ...session, sheets, activeId: sheets.some(sheet => sheet.id === session.activeId) ? session.activeId : sheets[0].id };
}
