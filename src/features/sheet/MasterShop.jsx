import React, { useState } from 'react';
import { useConfirm } from '../../ui/ConfirmProvider.jsx';
import { resolveItem } from '../../market/items.js';
import { describeEffect } from '../../market/custom.js';
import { shopEntry, priceText, canAfford, visibleListings } from '../../market/shop.js';
import { buyShopItem, newRequestId } from '../../lib/masterHub.js';
import { notifyInventoryChanged } from '../../lib/items.js';
import { formatMoney } from '../../money.js';
import ExperienceIcon from '../room/masterHub/ExperienceIcon.jsx';

const fmtKg = n => `${(Math.round(n * 100) / 100).toString().replace('.', ',')} kg`;

// "Loja do Mestre": itens criados pelo mestre, vendidos por moedas da mesa. A compra é feita no servidor numa transação só
// (confere o saldo, debita a moeda e põe o item na mochila) e não repete se o clique for reenviado.
export default function MasterShop({ extras, cloudId, tableId, setToast }) {
  const askConfirm = useConfirm();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const listings = visibleListings(extras.shop, false);
  const currency = id => extras.currencies.find(c => c.id === id);
  const balance = id => extras.wallets[cloudId]?.[id] || 0;

  async function buy(l) {
    if (busy) return;
    const cur = currency(l.currency_id);
    const have = balance(l.currency_id);
    if (!(await askConfirm({
      title: 'Comprar na Loja do Mestre?',
      text: `${l.name} por ${priceText(l.price, cur)} ${cur?.name || ''}. Seu saldo: ${formatMoney(have)} → ${formatMoney(have - l.price)}. O item vai direto para a mochila.`,
      actionLabel: 'Comprar',
    }))) return;
    setBusy(l.id);
    setError('');
    try {
      await buyShopItem({ tableId, characterId: cloudId, listingId: l.id, qty: 1, requestId: newRequestId() });
      setToast?.(`${l.name} comprado por ${priceText(l.price, cur)}.`);
      notifyInventoryChanged(); // a ficha e o token relêem a mochila agora
      extras.refresh();
    } catch (e) { setError(e.message); extras.refresh(); } finally { setBusy(''); }
  }

  if (!tableId || !cloudId) return <p className="muted">A Loja do Mestre só funciona numa ficha ligada a uma mesa e já salva na sua conta.</p>;
  return <>
    <div className="mk-status">
      <div className="mk-effects" aria-label="Seus saldos">
        {extras.currencies.length ? extras.currencies.map(c => <span key={c.id} className="mk-chip"><ExperienceIcon icon={c.symbol} /> {c.name} <b>{formatMoney(balance(c.id))}</b></span>)
          : <span className="muted">O mestre ainda não criou moedas nesta mesa.</span>}
      </div>
    </div>
    {error && <p role="alert" className="muted">{error}</p>}
    {!listings.length ? <p className="muted">A loja do mestre está vazia no momento.</p> : <div className="mk-list">
      {listings.map(l => {
        const cur = currency(l.currency_id);
        const item = resolveItem(shopEntry(l));
        const effects = (item?.customEffects || []).filter(e => e.kind !== 'damage');
        const damage = (item?.customEffects || []).find(e => e.kind === 'damage');
        const afford = canAfford(balance(l.currency_id), l.price);
        return <article className="mk-item" key={l.id}>
          <div className="mk-main">
            <h4>{l.name}</h4>
            <p className="mk-meta">{l.weight ? fmtKg(Number(l.weight)) : 'sem peso'} · Item do mestre</p>
            {(damage || effects.length > 0) && <div className="mk-chips">
              {damage && <span className="mk-chip">Dano <b>{damage.target}</b></span>}
              {effects.map((e, i) => <span key={i} className="mk-chip">{describeEffect(e)}</span>)}
            </div>}
            {l.description && <p className="mk-notes">{l.description}</p>}
          </div>
          <div className="mk-buy">
            <b className="mk-price"><ExperienceIcon icon={cur?.symbol} /> {formatMoney(l.price)}</b>
            <button type="button" className="primary" disabled={!afford || Boolean(busy)} onClick={() => buy(l)}>{busy === l.id ? 'Comprando…' : afford ? 'Comprar' : 'Saldo insuficiente'}</button>
          </div>
        </article>;
      })}
    </div>}
    <p className="muted mk-foot">Itens vendidos pelo mestre, pagos com as moedas da mesa (a carteira de cada moeda é separada do seu dinheiro em $). A compra é definitiva: o item vai para a mochila e o saldo é debitado na hora.</p>
  </>;
}
