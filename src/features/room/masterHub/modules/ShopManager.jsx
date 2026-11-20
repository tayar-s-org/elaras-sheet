import React, { useState } from 'react';
import { upsertShopItem, deleteShopItem } from '../../../../lib/masterHub.js';
import { parsePrice, saleCurrencies, shopCurrency, MONEY_ID } from '../../../../market/shop.js';
import { formatMoney } from '../../../../money.js';
import ExperienceIcon from '../ExperienceIcon.jsx';
import { iconText, DEFAULT_CURRENCY_ICON } from '../experienceIcons.js';
import { BatchResults, useMasterRun, previewText } from '../ui.jsx';

// Itens à venda na Loja do Mestre: trocar moeda e preço, pausar/ativar e remover. Remover não tira o item de quem já comprou.
export default function ShopManager({ tableId, extras, closed, allowMoney = true }) {
  const [edit, setEdit] = useState(null); // { id, currencyId, price }
  const [error, setError] = useState('');
  const run = useMasterRun({ onDone: () => extras.refresh() });
  const cur = l => shopCurrency(l, extras.currencies);

  function save(l) {
    setError('');
    const p = parsePrice(edit.price, l.source_id ? 0 : 1);
    if (!p.ok) { setError(p.error); return; }
    run.start({
      title: `Alterar ${l.name}`, skipConfirm: true, opKey: `shop-edit:${l.id}:${edit.currencyId}:${p.price}`, targets: [{ id: l.id, name: l.name }],
      fn: (t, requestId) => upsertShopItem({ tableId, id: l.id, currencyId: edit.currencyId, price: p.price, active: l.active, requestId }),
    }).then(b => { if (b?.results.every(r => r.ok)) setEdit(null); });
  }
  const toggle = l => run.start({
    title: l.active ? `Pausar ${l.name}` : `Reativar ${l.name}`, skipConfirm: true, opKey: `shop-toggle:${l.id}:${l.active}`, targets: [{ id: l.id, name: l.name }],
    fn: (t, requestId) => upsertShopItem({ tableId, id: l.id, currencyId: l.currency_id, price: l.price, active: !l.active, requestId }),
  });
  const remove = l => run.start({
    title: `Tirar ${l.name} da loja`, actionLabel: 'Tirar da loja', danger: true, opKey: `shop-del:${l.id}`, targets: [{ id: l.id, name: l.name }],
    text: previewText([`Tirar "${l.name}" da ${l.source_id ? 'Loja aprovada' : 'Loja do Mestre'}?`, 'Quem já comprou continua com o item na mochila.']),
    fn: (t, requestId) => deleteShopItem({ tableId, id: l.id, requestId }),
  });

  return <section className="mh-section" aria-labelledby="mh-shop-h">
    <h3 id="mh-shop-h">Lojas do Mercado ({extras.shop.length})</h3>
    <p className="muted mh-hint">Itens criados por você, na aba “Loja do Mestre” do Mercado, e os itens dos jogadores que você aprovou, na aba “Loja aprovada” (entram sozinhos, pelo preço da aprovação, e saem se você revogar). Crie um item seu na aba “Criar item” marcando “Vender na Loja do Mestre”. Pause um item para esconder da loja sem apagar.</p>
    <ul className="mh-list">
      {extras.shop.map(l => <li key={l.id}>
        <span><b>{l.name}</b> · {Number(l.price) === 0 ? 'Grátis' : <><ExperienceIcon icon={cur(l)?.symbol} /> {formatMoney(l.price)} {cur(l)?.name || ''}</>}{l.source_id ? <small className="muted"> · Loja aprovada</small> : null}{l.active ? '' : <small className="muted"> · pausado</small>}</span>
        {edit?.id === l.id
          ? <span className="mh-form">
            <select aria-label="Moeda" value={edit.currencyId} onChange={e => setEdit({ ...edit, currencyId: e.target.value })}>{saleCurrencies(extras.currencies, allowMoney).map(c => <option key={c.id} value={c.id}>{iconText(c.symbol, DEFAULT_CURRENCY_ICON)} {c.name}</option>)}</select>
            <input type="number" aria-label="Preço" min={l.source_id ? 0 : 1} value={edit.price} onChange={e => setEdit({ ...edit, price: e.target.value })} onFocus={e => e.target.select()} style={{ width: '12ch' }} />
            <button type="button" className="primary" disabled={run.busy} onClick={() => save(l)}>Salvar</button>
            <button type="button" className="outline" onClick={() => setEdit(null)}>Cancelar</button>
          </span>
          : <span className="tabs-row">
            <button type="button" className="outline" disabled={closed || run.busy} onClick={() => setEdit({ id: l.id, currencyId: l.currency_id || MONEY_ID, price: String(l.price) })}>Moeda e preço</button>
            <button type="button" className="outline" disabled={closed || run.busy} onClick={() => toggle(l)}>{l.active ? 'Pausar' : 'Reativar'}</button>
            <button type="button" className="outline danger mh-danger" aria-label={`Tirar ${l.name} da loja`} disabled={closed || run.busy} onClick={() => remove(l)}>Tirar da loja</button>
          </span>}
      </li>)}
      {!extras.shop.length && <li className="muted">Nenhum item à venda.</li>}
    </ul>
    {error && <p role="alert" className="muted">{error}</p>}
    <BatchResults run={run} />
  </section>;
}
