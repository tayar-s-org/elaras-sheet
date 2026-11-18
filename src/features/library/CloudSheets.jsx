import React from 'react';
import { cloudConfigured } from '../../lib/supabase.js';
import { loginThen } from '../../lib/router.js';

// Faixa de estado do salvamento. As fichas da conta aparecem como abas logo abaixo (abertas ao entrar).
export default function CloudSheets({ auth, sheet, status, onSync, syncing }) {
  const cloud = sheet.cloud;
  const dirty = cloud && JSON.stringify(sheet.character) !== cloud.base;

  if (!cloudConfigured) return null;
  if (auth.loading) return <section className="server-sheets"><p className="muted">Verificando sessão…</p></section>;
  if (!auth.user) {
    return <section className="server-sheets">
      <div className="sheet-tools">
        <button className="primary" onClick={() => loginThen('/fichas')}>Entrar para salvar na nuvem</button>
        <span className="muted">Suas fichas continuam salvas neste navegador.</span>
      </div>
    </section>;
  }
  return <section className="server-sheets">
    <div className="sheet-tools">
      <span className={`save-status ${status?.state || 'idle'}`} role="status">{status?.state === 'saving' ? 'Salvando…' : status?.state === 'error' ? status.message : dirty ? 'Alterações serão salvas sozinhas…' : cloud ? `Salvo na nuvem · versão ${cloud.revision}` : sheet.tableId ? 'Ficha em branco (salva ao editar)' : 'Escolha a mesa para esta ficha ser salva'}</span>
      {onSync && <button type="button" className="outline" disabled={syncing} onClick={onSync}
        title="Traz a versão mais recente das suas fichas da nuvem e abre as que faltam">{syncing ? 'Sincronizando…' : 'Sincronizar com a nuvem'}</button>}
    </div>
  </section>;
}
