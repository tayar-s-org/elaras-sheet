import React, { useState } from 'react';
import { grantMoney } from '../../lib/money.js';
import { sendMessage } from '../../lib/room.js';
import { formatMoney } from '../../money.js';
import '../../ui/money.css';

// Mestre: adiciona dinheiro a um jogador (ou a todos). O jogador recebe na ficha; a mesa vê um aviso no chat.
export default function MoneyGrant({ tableId, targets, label = 'Dinheiro ($)', button = 'Dar dinheiro' }) {
  const [text, setText] = useState('100');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const amount = Math.trunc(Number(text));
  const valid = amount >= 1 && amount <= 1000000;
  async function give(e) {
    e.preventDefault();
    if (!valid || busy || !targets.length) return;
    setBusy(true);
    setMsg('');
    try {
      for (const t of targets) await grantMoney(tableId, t.id, amount);
      const who = targets.length === 1 ? (targets[0].name || 'um personagem') : 'todos os jogadores';
      sendMessage(tableId, `💰 O mestre deu $${formatMoney(amount)} a ${who}.`).catch(() => {});
      setMsg(`$${formatMoney(amount)} enviado${targets.length > 1 ? ' a todos' : ''}.`);
    } catch (err) { setMsg(err.message); }
    finally { setBusy(false); }
  }
  return <form className="money-grant" onSubmit={give}>
    <label><span>{label}</span>
      <input type="number" min="1" max="1000000" inputMode="numeric" value={text} aria-label={label}
        onChange={e => setText(e.target.value)} onFocus={e => e.target.select()} /></label>
    <button className="outline" disabled={busy || !valid || !targets.length}>{busy ? 'Enviando…' : button}</button>
    {msg && <small role="status" className="muted">{msg}</small>}
  </form>;
}
