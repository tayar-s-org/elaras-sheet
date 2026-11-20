import React, { useState } from 'react';
import { useConfirm } from '../../ui/ConfirmProvider.jsx';
import { resolveItem } from '../../market/items.js';
import { describeEffect } from '../../market/custom.js';
import { shopEntry, priceText, canAfford, masterListings, approvedListings, shopCurrency, MONEY_CURRENCY } from '../../market/shop.js';
import { buyShopItem, newRequestId } from '../../lib/masterHub.js';
import { notifyInventoryChanged } from '../../lib/items.js';
import { formatMoney } from '../../money.js';
import ExperienceIcon from '../room/masterHub/ExperienceIcon.jsx';

const fmtKg = n => `${(Math.round(n * 100) / 100).toString().replace('.', ',')} kg`;

// "Loja do Mestre" (itens criados pelo mestre, em $ ou moedas da mesa) e "Loja aprovada" (approved: itens customizados dos jogadores que o
// mestre aprovou, sempre em $). A compra é feita no servidor numa transação só (confere o saldo, debita e põe o item na mochila)
// e não repete se o clique for reenviado.
export default function MasterShop({ extras, cloudId, tableId, money = 0, setToast, approved = false }) {
  const askConfirm = useConfirm();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const listings = (approved ? approvedListings : masterListings)(extras.shop, false);
  const shopName = approved ? 'Loja aprovada' : 'Loja do Mestre';
  const currency = l => shopCurrency(l, extras.currencies);
  const balance = l => (l.currency_id ? extras.wallets[cloudId]?.[l.currency_id] || 0 : money); // anúncio em $: o dinheiro da ficha

  async function buy(l) {
    if (busy) return;
    const cur = currency(l);
    const have = balance(l);
    if (!(await askConfirm({
      title: `Comprar na ${shopName}?`,
      text: `${l.name} ${Number(l.price) === 0 ? 'de graça' : `por ${priceText(l.price, cur)} ${cur?.name || ''}`}. Seu saldo: ${formatMoney(have)} → ${formatMoney(have - l.price)}. O item vai direto para a mochila.`,
      actionLabel: 'Comprar',
    }))) return;
    setBusy(l.id);
    setError('');
    try {
      await buyShopItem({ tableId, characterId: cloudId, listingId: l.id, qty: 1, requestId: newRequestId() });
      setToast?.(Number(l.price) === 0 ? `${l.name} adicionado à mochila.` : `${l.name} comprado por ${priceText(l.price, cur)}.`);
      notifyInventoryChanged(); // a ficha e o token relêem a mochila agora
      extras.refresh();
    } catch (e) { setError(e.message); extras.refresh(); } finally { setBusy(''); }
  }

  if (!tableId || !cloudId) return <p className="muted">A {shopName} só funciona numa ficha ligada a uma mesa e já salva na sua conta.</p>;
  return <>
    <div className="mk-status">
      <div className="mk-effects" aria-label="Seus saldos">
        {(approved ? [MONEY_CURRENCY] : [MONEY_CURRENCY, ...extras.currencies]).map(c => <span key={c.id} className="mk-chip"><ExperienceIcon icon={c.symbol} /> {c.name} <b>{formatMoney(c.id === MONEY_CURRENCY.id ? money : extras.wallets[cloudId]?.[c.id] || 0)}</b></span>)}
      </div>
    </div>
    {error && <p role="alert" className="muted">{error}</p>}
    {!listings.length ? <p className="muted">{approved ? 'Ainda não há itens aprovados. Itens customizados que o mestre aprovar aparecem aqui para todos comprarem.' : 'A loja do mestre está vazia no momento.'}</p> : <div className="mk-list">
      {listings.map(l => {
        const cur = currency(l);
        const item = resolveItem(shopEntry(l));
        const effects = (item?.customEffects || []).filter(e => e.kind !== 'damage');
        const damage = (item?.customEffects || []).find(e => e.kind === 'damage');
        const afford = canAfford(balance(l), l.price);
        return <article className="mk-item" key={l.id}>
          <div className="mk-main">
            <h4>{l.name}</h4>
            <p className="mk-meta">{l.weight ? fmtKg(Number(l.weight)) : 'sem peso'} · {approved ? 'Item aprovado pelo mestre' : 'Item do mestre'}</p>
            {(damage || effects.length > 0) && <div className="mk-chips">
              {damage && <span className="mk-chip">Dano <b>{damage.target}</b></span>}
              {effects.map((e, i) => <span key={i} className="mk-chip">{describeEffect(e)}</span>)}
            </div>}
            {l.description && <p className="mk-notes">{l.description}</p>}
          </div>
          <div className="mk-buy">
            <b className="mk-price">{Number(l.price) === 0 ? 'Grátis' : <><ExperienceIcon icon={cur?.symbol} /> {formatMoney(l.price)}</>}</b>
            <button type="button" className="primary" disabled={!afford || Boolean(busy)} onClick={() => buy(l)}>{busy === l.id ? 'Comprando…' : afford ? 'Comprar' : 'Saldo insuficiente'}</button>
          </div>
        </article>;
      })}
    </div>}
    <p className="muted mk-foot">{approved
      ? 'Itens customizados que o mestre aprovou, à venda para a mesa toda pelo preço definido na aprovação, em dinheiro ($). Quem enviou o item já o recebeu. A compra é definitiva: o item vai para a mochila e o saldo é debitado na hora.'
      : 'Itens vendidos pelo mestre, pagos com dinheiro ($) ou com as moedas da mesa (a carteira de cada moeda é separada do seu dinheiro em $). A compra é definitiva: o item vai para a mochila e o saldo é debitado na hora.'}</p>
  </>;
}
