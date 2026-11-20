export const IDLE_STATUS = { state: 'idle', message: '' };

// Cada ficha tem o seu estado de salvamento ({ [idDaAba]: { state, message } }): o resultado de uma não pode esconder o problema de outra.
export const statusOf = (statuses, sheetId) => statuses[sheetId] || IDLE_STATUS;

// Pendências das fichas abertas além da ativa, para a faixa de salvamento avisar sem trocar o estado da ficha em foco.
export function summarizeOtherSheets(statuses, sheets, activeId) {
  const states = sheets.filter(sheet => sheet.id !== activeId).map(sheet => statusOf(statuses, sheet.id).state);
  const count = state => states.filter(value => value === state).length;
  return { saving: count('saving'), failed: count('error') };
}

export const describeOtherSheets = ({ saving, failed }) => [
  failed && `${failed} outra(s) ficha(s) com problema para salvar`,
  saving && `${saving} outra(s) salvando`,
].filter(Boolean).join(' · ');
