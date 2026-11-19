import React, { useState } from 'react';
import { decideCustomSkill, SKILL_STATUS } from '../../lib/customSkills.js';
import { skillPoints } from '../../skills/custom.js';
import '../sheet/market.css';

// Aba do mestre: perícias personalizadas que os jogadores pediram.
export default function SkillApprovals({ items, available, refresh, members, characters }) {
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  if (!available) return null; // migration 0027 pendente: a aba só mostra o resto
  const who = row => {
    const m = members.find(x => x.user_id === row.user_id);
    const ch = row.character_id ? characters[row.character_id] : null;
    return `${m?.profiles?.display_name || 'Jogador'}${ch?.name ? ` · ${ch.name}` : ''}`;
  };
  const decide = async (row, status) => {
    setBusy(row.id);
    setError('');
    try { await decideCustomSkill(row.id, status, notes[row.id] || ''); await refresh(); }
    catch (e) { setError(e.message); } finally { setBusy(''); }
  };
  const pending = items.filter(i => i.status === 'pending');
  const decided = items.filter(i => i.status !== 'pending').slice(0, 20);
  const card = (row, actions) => <article key={row.id} className="mk-item">
    <div className="mk-main">
      <h4>Perícia: {row.name}<span className={`ci-status ${row.status}`}>{SKILL_STATUS[row.status]}</span></h4>
      <p className="mk-meta">{who(row)} · atributo {row.attribute || 'não informado'} · começa em d{row.die} ({skillPoints(row.die)} {skillPoints(row.die) === 1 ? 'ponto' : 'pontos'})</p>
      {row.gm_note && <p className="mk-notes"><b>Sua nota:</b> {row.gm_note}</p>}
      {actions}
    </div>
  </article>;
  return <div className="approvals">
    {error && <p role="alert" className="muted">{error}</p>}
    <h3>Perícias personalizadas ({pending.length})</h3>
    {!pending.length ? <p className="muted">Nenhuma perícia esperando. Quando um jogador pedir uma perícia nova, ela aparece aqui.</p> : <div className="mk-list">
      {pending.map(row => card(row, <div className="approval-actions">
        <input aria-label={`Nota para ${row.name}`} maxLength={300} placeholder="Nota para o jogador (opcional)" value={notes[row.id] || ''} onChange={e => setNotes(n => ({ ...n, [row.id]: e.target.value }))} />
        <button type="button" className="primary" disabled={busy === row.id} onClick={() => decide(row, 'approved')}>Aprovar</button>
        <button type="button" className="outline" disabled={busy === row.id} onClick={() => decide(row, 'rejected')}>Recusar</button>
      </div>))}
    </div>}
    {decided.length > 0 && <>
      <h3>Decididas: perícias</h3>
      <div className="mk-list">{decided.map(row => card(row, null))}</div>
    </>}
  </div>;
}
