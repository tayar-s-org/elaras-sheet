import React, { useState } from 'react';
import { useConfirm } from '../../ui/ConfirmProvider.jsx';
import { decideCustomItem, approveCustomItem, revokeCustomItem, ITEM_STATUS } from '../../lib/customItems.js';
import { normalizeMoney, formatMoney } from '../../money.js';
import { describeEffect } from '../../market/custom.js';
import '../sheet/market.css';

const fmtKg = n => `${(Math.round(n * 100) / 100).toString().replace('.', ',')} kg`;

// Aba do mestre: itens customizados que os jogadores enviaram para aprovação.
export default function ItemApprovals({ items, available, refresh, members, characters }) {
  const askConfirm = useConfirm();
  const [notes, setNotes] = useState({});
  const [prices, setPrices] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const who = row => {
    const m = members.find(x => x.user_id === row.user_id);
    const ch = row.character_id ? characters[row.character_id] : null;
    return `${m?.profiles?.display_name || 'Jogador'}${ch?.name ? ` · ${ch.name}` : ''}`;
  };
  const balanceOf = row => {
    const data = row.character_id ? characters[row.character_id]?.data : null;
    return data ? normalizeMoney(data.money) : null;
  };
  const priceOf = row => Math.max(0, Math.min(1000000, Math.trunc(Number(prices[row.id])) || 0));
  const act = async (row, fn) => {
    setBusy(row.id);
    setError('');
    try { await fn(); await refresh(); }
    catch (e) { setError(e.message); } finally { setBusy(''); }
  };
  const approve = row => act(row, () => approveCustomItem(row.id, priceOf(row), notes[row.id] || ''));
  const reject = row => act(row, () => decideCustomItem(row.id, 'rejected', notes[row.id] || ''));
  const revoke = row => act(row, () => revokeCustomItem(row.id, notes[row.id] || ''));
  if (!available) return <p className="callout">Os itens customizados ainda não estão disponíveis neste servidor. Falta rodar a migration <code>0018_custom_items.sql</code> no Supabase.</p>;
  const pending = items.filter(i => i.status === 'pending');
  const decided = items.filter(i => i.status !== 'pending').slice(0, 20);
  const card = (row, actions) => <article key={row.id} className="mk-item">
    <div className="mk-main">
      <h4>{row.name}<span className={`ci-status ${row.status}`}>{ITEM_STATUS[row.status]}</span></h4>
      <p className="mk-meta">{who(row)} · {row.weight ? fmtKg(Number(row.weight)) : 'sem peso'}{row.status === 'approved' && row.price > 0 ? ` · Preço: $ ${formatMoney(row.price)}` : ''}</p>
      {row.effects?.length > 0 ? <div className="mk-chips">{row.effects.map((e, i) => <span key={i} className="mk-chip">{describeEffect(e)}</span>)}</div> : <p className="mk-notes">Sem efeito nas regras.</p>}
      {row.description && <p className="mk-notes">{row.description}</p>}
      {row.gm_note && <p className="mk-notes"><b>Sua nota:</b> {row.gm_note}</p>}
      {actions}
    </div>
  </article>;
  return <div className="approvals">
    {error && <p role="alert" className="muted">{error}</p>}
    <h3>Aguardando aprovação ({pending.length})</h3>
    {!pending.length ? <p className="muted">Nenhum item esperando. Quando um jogador enviar um item customizado, ele aparece aqui.</p> : <>
      <p className="muted">O item aprovado entra na aba “Loja aprovada” do Mercado, onde qualquer jogador da mesa pode comprá-lo pelo preço definido aqui (preço 0 = grátis). Para esconder da loja, pause o item em Central › Itens.</p>
      <div className="mk-list">
      {pending.map(row => card(row, <div className="approval-actions">
        <label className="ap-price">Preço ($)
          <input type="number" min="0" max="1000000" step="1" inputMode="numeric" aria-label={`Preço de ${row.name}`} placeholder="0" value={prices[row.id] ?? ''} onChange={e => setPrices(p => ({ ...p, [row.id]: e.target.value }))} />
        </label>
        <input aria-label={`Nota para ${row.name}`} maxLength={300} placeholder="Nota para o jogador (opcional)" value={notes[row.id] || ''} onChange={e => setNotes(n => ({ ...n, [row.id]: e.target.value }))} />
        <button type="button" className="primary" disabled={busy === row.id || (priceOf(row) > 0 && balanceOf(row) !== null && balanceOf(row) < priceOf(row))} onClick={() => approve(row)}>{priceOf(row) > 0 ? `Aprovar e cobrar $ ${formatMoney(priceOf(row))}` : 'Aprovar (grátis na loja)'}</button>
        <button type="button" className="outline" disabled={busy === row.id} onClick={() => reject(row)}>Recusar</button>
        {balanceOf(row) !== null && <span className="muted ap-balance">Saldo do jogador: $ {formatMoney(balanceOf(row))}{priceOf(row) > balanceOf(row) ? ' — insuficiente' : ''}</span>}
      </div>))}
      </div>
    </>}
    {decided.length > 0 && <>
      <h3>Decididos</h3>
      <div className="mk-list">{decided.map(row => card(row, row.status === 'approved' ? <div className="approval-actions">
        <input aria-label={`Motivo para revogar ${row.name}`} maxLength={300} placeholder="Motivo da revogação (opcional)" value={notes[row.id] || ''} onChange={e => setNotes(n => ({ ...n, [row.id]: e.target.value }))} />
        <button type="button" className="outline" disabled={busy === row.id} onClick={async () => await askConfirm({ title: 'Revogar aprovação?', text: `Revogar a aprovação de ${row.name}? O item sai da mochila do jogador${row.price > 0 ? ` e os $ ${formatMoney(row.price)} voltam para ele` : ''}.`, actionLabel: 'Revogar aprovação', danger: true }) && revoke(row)}>Revogar aprovação</button>
      </div> : null))}</div>
    </>}
  </div>;
}
