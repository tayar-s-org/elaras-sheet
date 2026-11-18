import React, { useState } from 'react';
import { setRoutineStatus } from '../../lib/training.js';
import TrainingModal from './TrainingModal.jsx';

// Aba Aprovações: rotinas de treino enviadas pelos jogadores. part="pending" lista as que aguardam o mestre;
// part="decided" lista as já aprovadas, onde o mestre pode revogar a aprovação (volta a rascunho com um motivo).
export default function TrainingApprovals({ part, tableId, me, members, characters, closed, pending, approved, available, refresh }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [returning, setReturning] = useState(null); // user_id que está sendo devolvido ou revogado
  const [text, setText] = useState('');
  const [open, setOpen] = useState(null);

  if (!available) return null;
  const who = uid => {
    const m = members.find(x => x.user_id === uid);
    const ch = m?.character_id ? characters[m.character_id] : null;
    return `${m?.profiles?.display_name || 'Jogador'}${ch?.name ? ` · ${ch.name}` : ''}${uid === me ? ' (você)' : ''}`;
  };
  const decide = async (uid, status, note) => {
    setBusy(uid);
    setError('');
    try { await setRoutineStatus(tableId, uid, status, note); setReturning(null); setText(''); await refresh(); }
    catch (e) { setError(e.message); } finally { setBusy(''); }
  };
  const modal = open && <TrainingModal tableId={tableId} me={me} isGm initial={open} members={members} characters={characters} closed={closed} onClose={() => { setOpen(null); refresh(); }} />;

  if (part === 'decided') {
    if (!approved.length) return null;
    return <div className="approvals">
      {error && <p role="alert" className="muted">{error}</p>}
      <h3>Decididos: rotinas de treino ({approved.length})</h3>
      <div className="mk-list">
        {approved.map(uid => <article key={uid} className="mk-item">
          <div className="mk-main">
            <h4>Rotina de treino<span className="ci-status approved">Aprovada</span></h4>
            <p className="mk-meta">{who(uid)}</p>
            {returning === uid ? <div className="approval-actions">
              <input aria-label="Motivo da revogação" maxLength={500} autoFocus placeholder="Motivo (opcional, o jogador vai ler)" value={text} onChange={e => setText(e.target.value)} />
              <button type="button" className="primary" disabled={busy === uid} onClick={() => decide(uid, 'draft', text)}>Revogar aprovação</button>
              <button type="button" className="outline" disabled={busy === uid} onClick={() => { setReturning(null); setText(''); }}>Cancelar</button>
            </div> : <div className="approval-actions">
              <button type="button" className="outline" onClick={() => setOpen(uid)}>Abrir rotina</button>
              <button type="button" className="outline" disabled={busy === uid} onClick={() => { setReturning(uid); setText(''); }}>Revogar aprovação</button>
            </div>}
          </div>
        </article>)}
      </div>
      {modal}
    </div>;
  }

  return <div className="approvals">
    {error && <p role="alert" className="muted">{error}</p>}
    <h3>Rotinas de treino ({pending.length})</h3>
    {!pending.length ? <p className="muted">Nenhuma rotina esperando. Quando um jogador enviar a rotina de treino para aprovação, ela aparece aqui.</p> : <div className="mk-list">
      {pending.map(uid => <article key={uid} className="mk-item">
        <div className="mk-main">
          <h4>Rotina de treino<span className="ci-status pending">Pendente</span></h4>
          <p className="mk-meta">{who(uid)}</p>
          {returning === uid ? <div className="approval-actions">
            <input aria-label="Motivo da devolução" maxLength={500} autoFocus placeholder="Por que está devolvendo? (o jogador vai ler)" value={text} onChange={e => setText(e.target.value)} />
            <button type="button" className="primary" disabled={busy === uid || !text.trim()} onClick={() => decide(uid, 'draft', text)}>Devolver com este texto</button>
            <button type="button" className="outline" disabled={busy === uid} onClick={() => { setReturning(null); setText(''); }}>Cancelar</button>
          </div> : <div className="approval-actions">
            <button type="button" className="outline" onClick={() => setOpen(uid)}>Abrir rotina</button>
            <button type="button" className="primary" disabled={busy === uid} onClick={() => decide(uid, 'approved')}>Aprovar</button>
            <button type="button" className="outline" disabled={busy === uid} onClick={() => { setReturning(uid); setText(''); }}>Devolver</button>
          </div>}
        </div>
      </article>)}
    </div>}
    {modal}
  </div>;
}
