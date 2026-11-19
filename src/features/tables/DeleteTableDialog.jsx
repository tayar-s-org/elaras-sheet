import React, { useState } from 'react';
import Modal from '../../ui/Modal.jsx';
import './deleteTable.css';

const norm = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Confirmação para apagar uma mesa: o mestre precisa digitar o nome da mesa. Isso evita apagar por engano.
export default function DeleteTableDialog({ table, onConfirm, onCancel }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const match = norm(typed) === norm(table.name);


  async function confirm(e) {
    e.preventDefault();
    if (!match || busy) return;
    setBusy(true);
    setError('');
    try { await onConfirm(); } catch (err) { setError(err.message); setBusy(false); }
  }

  return <Modal onClose={onCancel} aria-labelledby="del-title" busy={busy} role="alertdialog" aria-describedby="del-text">
    <form className="confirmation-panel delete-table" onSubmit={confirm}>
      <h2 id="del-title">Apagar a mesa “{table.name}”?</h2>
      <div id="del-text" className="delete-table-text">
        <p><b>Isso não pode ser desfeito.</b> Ao apagar a mesa, somem para todos os participantes:</p>
        <ul>
          <li>o tabuleiro, o mapa, os tokens e os marcadores;</li>
          <li>o chat, as rolagens e o histórico de vida, mana e stamina;</li>
          <li>as rotinas de treino, o calendário, os pedidos de itens e de perícias e as aprovações;</li>
          <li>os convites e a lista de jogadores.</li>
        </ul>
        <p>As fichas dos jogadores continuam nas contas deles, mas ficam sem mesa.</p>
      </div>
      <label className="field"><span>Digite <b>{table.name}</b> para confirmar</span>
        <input value={typed} data-modal-focus autoComplete="off" onChange={e => setTyped(e.target.value)} placeholder={table.name} aria-label="Nome da mesa para confirmar" /></label>
      {error && <p role="alert" className="delete-table-error">{error}</p>}
      <div className="confirmation-actions">
        <button type="button" className="outline" disabled={busy} onClick={onCancel}>Cancelar</button>
        <button type="submit" className="danger-solid" disabled={!match || busy}>{busy ? 'Apagando…' : 'Apagar mesa para sempre'}</button>
      </div>
    </form>
  </Modal>;
}
