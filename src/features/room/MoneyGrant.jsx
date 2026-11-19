import React, { useState } from 'react';
import { grantMoney } from '../../lib/money.js';
import { grantEach, grantSummary } from '../../lib/grantEach.js';
import { formatMoney } from '../../money.js';
import '../../ui/money.css';

// Mestre: adiciona ou remove dinheiro de um jogador (ou de todos). O jogador recebe na ficha e a concessão fica no registro "XP e dinheiro" da mesa.
export default function MoneyGrant({ tableId, targets, label = 'Dinheiro ($)', button = 'Dar dinheiro', removeButton = 'Remover dinheiro' }) {
  const [text, setText] = useState('100');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const amount = Math.trunc(Number(text));
  const valid = amount >= 1 && amount <= 1000000;
  const who = targets.length === 1 ? (targets[0].name || 'um personagem') : 'todos os jogadores';

  async function apply(sign) {
    if (!valid || busy || !targets.length) return;
    if (sign < 0 && !window.confirm(`Remover $${formatMoney(amount)} de ${who}?`)) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await grantEach(targets, t => grantMoney(tableId, t.id, sign * amount));
      setMsg(grantSummary(res, `$${formatMoney(amount)} ${sign > 0 ? 'enviado' : 'removido'}${targets.length > 1 ? (sign > 0 ? ' a todos' : ' de todos') : ''}.`));
    } catch (err) { setMsg(err.message); }
    finally { setBusy(false); }
  }
  return <form className="money-grant" onSubmit={e => { e.preventDefault(); apply(1); }}>
    <label><span>{label}</span>
      <input type="number" min="1" max="1000000" inputMode="numeric" value={text} aria-label={label}
        onChange={e => setText(e.target.value)} onFocus={e => e.target.select()} /></label>
    <button className="outline" disabled={busy || !valid || !targets.length}>{busy ? 'Enviando…' : button}</button>
    <button type="button" className="outline danger" disabled={busy || !valid || !targets.length} onClick={() => apply(-1)}>{removeButton}</button>
    {msg && <small role="status" className="muted">{msg}</small>}
  </form>;
}
