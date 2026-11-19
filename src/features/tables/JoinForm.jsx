import React, { useEffect, useState } from 'react';
import { listMine } from '../../lib/cloud.js';

// Campos comuns de pedido de entrada: ficha opcional + mensagem ao mestre.
export default function JoinForm({ onSubmit, submitLabel = 'Pedir para entrar', children }) {
  const [characters, setCharacters] = useState([]);
  const [characterId, setCharacterId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A ficha vale numa mesa só: ao pedir para entrar, só as fichas que ainda não têm mesa (a escolhida passa a ser dessa mesa).
  useEffect(() => { listMine().then(list => setCharacters(list.filter(c => !c.table_id))).catch(() => {}); }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await onSubmit({ message: message.trim(), characterId: characterId || null }); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <form className="join-form" onSubmit={submit}>
    {children}
    <label className="field"><span>Ficha (opcional)</span>
      <select value={characterId} onChange={e => setCharacterId(e.target.value)}>
        <option value="">Escolher depois</option>
        {characters.map(c => <option key={c.id} value={c.id}>{c.name || 'Sem nome'}</option>)}
      </select>
      <small>Você pode enviar o pedido sem ficha. Depois que a entrada for aprovada, crie ou vincule uma ficha a esta mesa.</small>
    </label>
    <label className="field"><span>Mensagem ao mestre (opcional)</span>
      <input maxLength={300} value={message} onChange={e => setMessage(e.target.value)} />
    </label>
    <button className="primary" disabled={busy}>{busy ? 'Enviando…' : submitLabel}</button>
    {error && <p role="alert" className="muted">{error}</p>}
  </form>;
}
