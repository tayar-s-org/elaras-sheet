import React, { useEffect, useState } from 'react';
import { cloudConfigured } from '../../lib/supabase.js';
import { loginThen } from '../../lib/router.js';
import { createCharacter, updateCharacter, listMine, getCharacter, deleteCharacter } from '../../lib/cloud.js';

export default function CloudSheets({ auth, sheet, sheets, onSaved, onOpen, status }) {
  const [list, setList] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const cloud = sheet.cloud;
  const dirty = cloud && JSON.stringify(sheet.character) !== cloud.base;
  const signedIn = Boolean(auth.user);

  async function refresh() {
    try { setList(await listMine()); } catch (e) { setMessage(e.message); }
  }
  useEffect(() => { if (expanded && signedIn) refresh(); }, [expanded, signedIn, cloud?.id, cloud?.revision]);

  if (!cloudConfigured) return null;
  if (auth.loading) return <section className="server-sheets"><p className="muted">Verificando sessão…</p></section>;
  if (!signedIn) {
    return <section className="server-sheets">
      <div className="sheet-tools">
        <button className="primary" onClick={() => loginThen('/fichas')}>Entrar para salvar na nuvem</button>
        <span className="muted">Suas fichas continuam salvas neste navegador e em PDF.</span>
      </div>
    </section>;
  }

  async function saveOne(target) {
    const row = target.cloud
      ? await updateCharacter(target.cloud.id, target.cloud.revision, target.character)
      : await createCharacter(target.character);
    onSaved(target.id, row);
    return row;
  }
  async function save() {
    setBusy(true);
    try { await saveOne(sheet); setMessage('Ficha salva na nuvem.'); if (expanded) await refresh(); }
    catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  async function saveAll() {
    setBusy(true);
    let ok = 0;
    const errors = [];
    for (const target of sheets) {
      if (target.cloud && JSON.stringify(target.character) === target.cloud.base) continue;
      try { await saveOne(target); ok++; } catch (e) { errors.push(`${target.character.name || 'Sem nome'}: ${e.message}`); }
    }
    setMessage(`${ok} ficha(s) enviada(s).${errors.length ? ' ' + errors.join(' ') : ''}`);
    if (expanded) await refresh();
    setBusy(false);
  }
  async function open(id) {
    try { onOpen(await getCharacter(id)); setMessage(''); } catch (e) { setMessage(e.message); }
  }
  async function remove(row) {
    if (!window.confirm(`Apagar "${row.name || 'Sem nome'}" da nuvem? Isso não pode ser desfeito.`)) return;
    try { await deleteCharacter(row.id); await refresh(); } catch (e) { setMessage(e.message); }
  }

  return <section className="server-sheets">
    <div className="sheet-tools">
      <button className="primary" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar agora'}</button>
      <button className="outline" disabled={busy} onClick={saveAll}>Enviar todas as abas</button>
      <button className="outline" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>Minhas fichas</button>
      <span className={`save-status ${status?.state || 'idle'}`} role="status">{status?.state === 'saving' ? 'Salvando…' : status?.state === 'error' ? status.message : dirty ? 'Alterações serão salvas sozinhas…' : cloud ? `Salvo na nuvem · versão ${cloud.revision}` : 'Ficha em branco (salva ao editar)'}</span>
    </div>
    <p role="status" className="muted">{message}</p>
    {expanded && <div className="cloud-list">
      {list.map(row => <div className="row" key={row.id}>
        <button className="outline" aria-pressed={cloud?.id === row.id} onClick={() => open(row.id)}>
          {row.name || 'Sem nome'} · v{row.revision} · {new Date(row.updated_at).toLocaleString('pt-BR')}{cloud?.id === row.id ? ' · Aberta' : ''}
        </button>
        <button className="text-button danger" onClick={() => remove(row)}>Apagar</button>
      </div>)}
      {!list.length && <p className="muted">Nenhuma ficha na nuvem ainda.</p>}
    </div>}
  </section>;
}
