import React, { useState } from 'react';
import { decideCustomItem, ITEM_STATUS } from '../../lib/customItems.js';
import { describeEffect } from '../../market/custom.js';
import '../sheet/market.css';

const fmtKg = n => `${(Math.round(n * 100) / 100).toString().replace('.', ',')} kg`;

// Aba do mestre: itens customizados que os jogadores enviaram para aprovação.
export default function ItemApprovals({ items, available, refresh, members, characters }) {
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const who = row => {
    const m = members.find(x => x.user_id === row.user_id);
    const ch = row.character_id ? characters[row.character_id] : null;
    return `${m?.profiles?.display_name || 'Jogador'}${ch?.name ? ` · ${ch.name}` : ''}`;
  };
  const decide = async (row, status) => {
    setBusy(row.id);
    setError('');
    try { await decideCustomItem(row.id, status, notes[row.id] || ''); await refresh(); }
    catch (e) { setError(e.message); } finally { setBusy(''); }
  };
  if (!available) return <p className="callout">Os itens customizados ainda não estão disponíveis neste servidor. Falta rodar a migration <code>0018_custom_items.sql</code> no Supabase.</p>;
  const pending = items.filter(i => i.status === 'pending');
  const decided = items.filter(i => i.status !== 'pending').slice(0, 20);
  const card = (row, actions) => <article key={row.id} className="mk-item">
    <div className="mk-main">
      <h4>{row.name}<span className={`ci-status ${row.status}`}>{ITEM_STATUS[row.status]}</span></h4>
      <p className="mk-meta">{who(row)} · {row.weight ? fmtKg(Number(row.weight)) : 'sem peso'}</p>
      {row.effects?.length > 0 ? <div className="mk-chips">{row.effects.map((e, i) => <span key={i} className="mk-chip">{describeEffect(e)}</span>)}</div> : <p className="mk-notes">Sem efeito nas regras.</p>}
      {row.description && <p className="mk-notes">{row.description}</p>}
      {row.gm_note && <p className="mk-notes"><b>Sua nota:</b> {row.gm_note}</p>}
      {actions}
    </div>
  </article>;
  return <div className="approvals">
    {error && <p role="alert" className="muted">{error}</p>}
    <h3>Aguardando aprovação ({pending.length})</h3>
    {!pending.length ? <p className="muted">Nenhum item esperando. Quando um jogador enviar um item customizado, ele aparece aqui.</p> : <div className="mk-list">
      {pending.map(row => card(row, <div className="approval-actions">
        <input aria-label={`Nota para ${row.name}`} maxLength={300} placeholder="Nota para o jogador (opcional)" value={notes[row.id] || ''} onChange={e => setNotes(n => ({ ...n, [row.id]: e.target.value }))} />
        <button type="button" className="primary" disabled={busy === row.id} onClick={() => decide(row, 'approved')}>Aprovar</button>
        <button type="button" className="outline" disabled={busy === row.id} onClick={() => decide(row, 'rejected')}>Recusar</button>
      </div>))}
    </div>}
    {decided.length > 0 && <>
      <h3>Decididos</h3>
      <div className="mk-list">{decided.map(row => card(row, row.status === 'approved' ? <div className="approval-actions">
        <input aria-label={`Motivo para revogar ${row.name}`} maxLength={300} placeholder="Motivo da revogação (opcional)" value={notes[row.id] || ''} onChange={e => setNotes(n => ({ ...n, [row.id]: e.target.value }))} />
        <button type="button" className="outline" disabled={busy === row.id} onClick={() => window.confirm(`Revogar a aprovação de ${row.name}? Se o jogador já recebeu o item, ele será tirado da mochila dele.`) && decide(row, 'rejected')}>Revogar aprovação</button>
      </div> : null))}</div>
    </>}
  </div>;
}
