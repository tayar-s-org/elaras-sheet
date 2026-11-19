import React, { useMemo, useState } from 'react';
import { CATEGORIES, MARKET_ITEMS } from '../../../../market/items.js';
import CustomItemFields, { emptyItemForm, itemFromForm } from '../../../sheet/CustomItemFields.jsx';
import { giveItems, upsertShopItem } from '../../../../lib/masterHub.js';
import { saleOptions, priceText } from '../../../../market/shop.js';
import ShopSaleOptions, { emptySale } from '../ShopSaleOptions.jsx';
import ShopManager from './ShopManager.jsx';
import { sendMessage } from '../../../../lib/room.js';
import { PlayerPicker, BatchResults, useMasterRun, targetsFor, defaultTarget, previewText } from '../ui.jsx';
import '../../../sheet/market.css';
import '../../../sheet/itemControls.css';

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const fmtKg = n => `${(Math.round(n * 100) / 100).toString().replace('.', ',')} kg`;

// Itens e recompensas: entrega itens do catálogo ou criados aqui a um jogador (ou a todos), direto na mochila, com resultado por jogador.
// O item customizado usa o mesmo modelo dos itens da ficha (nome, peso, efeitos, descrição); imagem, categoria, valor e espaço de
// equipamento não existem nesse modelo e por isso não são oferecidos.
export default function ItemsModule({ ctx }) {
  const { tableId, players, closed, extras, shopReady } = ctx;
  const [sale, setSale] = useState(emptySale());
  const [tab, setTab] = useState('catalog');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [picked, setPicked] = useState(null);
  const [form, setForm] = useState(emptyItemForm());
  const [target, setTarget] = useState(null);
  const [qtyText, setQtyText] = useState('1');
  const [note, setNote] = useState('');
  const run = useMasterRun();
  const value = target === 'all' || players.some(p => p.id === target) ? target : defaultTarget(players);
  const targets = targetsFor(players, value);
  const set = patch => setForm(f => ({ ...f, ...patch }));
  const searching = query.trim().length > 0;
  const list = useMemo(() => MARKET_ITEMS.filter(i => (searching ? norm(`${i.name} ${i.group}`).includes(norm(query)) : i.category === category)), [query, category, searching]);
  const custom = tab === 'create' ? itemFromForm(form) : null;
  const subject = tab === 'catalog' ? picked : custom;
  const qty = Math.trunc(Number(qtyText));
  const valid = Boolean(subject) && targets.length > 0 && qty >= 1 && qty <= 99 && !closed;

  async function give() {
    if (!valid || run.busy) return;
    const what = tab === 'catalog' ? picked.name : custom.name;
    const batch = await run.start({
      title: `Entregar ${qty > 1 ? `${qty}× ` : ''}${what}`, actionLabel: 'Entregar',
      text: previewText([`Entregar ${qty > 1 ? `${qty}× ` : ''}${what} a ${targets.length === 1 ? targets[0].name : `${targets.length} jogadores`}?`, 'O item entra na mochila agora, sem passar pelo Mercado.', ...(note ? [`Observação: ${note}`] : [])]),
      opKey: `item:${tab === 'catalog' ? picked.id : `${custom.name}|${JSON.stringify(custom.effects)}`}:${qty}:${note}`, targets,
      fn: (t, requestId) => giveItems({ tableId, characterId: t.id, ...(tab === 'catalog' ? { id: picked.id } : { custom }), qty, note, requestId }),
    });
    if (!batch) return;
    const done = batch.results.filter(r => r.ok && !r.replayed).map(r => r.name);
    if (note.trim() && done.length) sendMessage(tableId, `🎁 O mestre entregou ${qty > 1 ? `${qty}× ` : ''}${what} a ${done.join(', ')}: ${note.trim()}`).catch(() => {});
    if (tab === 'create' && batch.results.every(r => r.ok)) setForm(emptyItemForm());
  }

  const saleCheck = saleOptions(sale, extras.currencies);
  const canSell = tab === 'create' && sale.sell && Boolean(custom) && saleCheck.ok && saleCheck.sell && !closed;
  async function putOnSale() {
    if (!canSell || run.busy) return;
    const currency = extras.currencies.find(c => c.id === saleCheck.currencyId);
    const batch = await run.start({
      title: `Colocar ${custom.name} à venda`, actionLabel: 'Colocar à venda',
      text: previewText([`Colocar "${custom.name}" à venda na Loja do Mestre por ${priceText(saleCheck.price, currency)} ${currency?.name || ''}?`, 'Os jogadores poderão comprar na aba “Loja do Mestre” do Mercado.']),
      opKey: `shop:${custom.name}|${JSON.stringify(custom.effects)}|${saleCheck.currencyId}|${saleCheck.price}`, targets: [{ id: 'shop', name: custom.name }],
      fn: (t, requestId) => upsertShopItem({ tableId, custom, currencyId: saleCheck.currencyId, price: saleCheck.price, requestId }),
    });
    if (batch?.results.every(r => r.ok)) { setForm(emptyItemForm()); setSale(emptySale()); extras.refresh(); }
  }

  return <div className="mh-sections">
    <section className="mh-section">
      <div className="tabs-row" role="tablist" aria-label="Origem do item">
        <button type="button" role="tab" aria-selected={tab === 'catalog'} className={tab === 'catalog' ? 'primary' : 'outline'} onClick={() => setTab('catalog')}>Itens existentes</button>
        <button type="button" role="tab" aria-selected={tab === 'create'} className={tab === 'create' ? 'primary' : 'outline'} onClick={() => setTab('create')}>Criar item</button>
      </div>
      {tab === 'catalog' ? <>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar item em todo o catálogo…" aria-label="Buscar item" />
        {!searching && <select value={category} onChange={e => setCategory(e.target.value)} aria-label="Categoria">{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>}
        <div className="gm-pick mh-pick" role="radiogroup" aria-label="Item do catálogo">
          {list.map(i => <label key={i.id} className="recipient">
            <span><input type="radio" name="mh-item" checked={picked?.id === i.id} onChange={() => setPicked(i)} /> {i.name}</span>
            <small>{i.weight ? fmtKg(i.weight) : 'sem peso'}</small>
          </label>)}
          {!list.length && <p className="muted">Nenhum item encontrado.</p>}
        </div>
      </> : <form className="ci-form" onSubmit={e => e.preventDefault()}>
        <CustomItemFields form={form} set={set} />
        {shopReady
          ? <ShopSaleOptions value={sale} onChange={patch => setSale(v => ({ ...v, ...patch }))} currencies={extras.currencies} disabled={closed} />
          : <p className="muted mh-hint">Falta aplicar a migração 0041 (Loja do Mestre) no Supabase para vender itens na loja.</p>}
      </form>}
    </section>
    <section className="mh-section">
      <h3>Entrega</h3>
      <div className="mh-form">
        <PlayerPicker players={players} value={value} onChange={setTarget} />
        <label className="field"><span>Quantidade</span>
          <input type="number" inputMode="numeric" min="1" max="99" value={qtyText} onChange={e => setQtyText(e.target.value)} onFocus={e => e.target.select()} style={{ width: '8ch' }} /></label>
        <label className="field"><span>Observação da recompensa (opcional)</span><input maxLength={200} value={note} onChange={e => setNote(e.target.value)} placeholder="Aparece no chat da mesa" /></label>
        {tab === 'create' && !custom && <small className="muted">Dê um nome ao item.</small>}
        {tab === 'catalog' && !picked && <small className="muted">Escolha um item da lista.</small>}
        <div className="tabs-row">
          <button type="button" className="primary" disabled={!valid || run.busy} onClick={give}>{run.busy ? 'Aplicando…' : 'Entregar'}</button>
          {tab === 'create' && sale.sell && <button type="button" className="primary" disabled={!canSell || run.busy} onClick={putOnSale}>Colocar à venda</button>}
        </div>
      </div>
      <BatchResults run={run} />
    </section>
    {shopReady && <ShopManager tableId={tableId} extras={extras} closed={closed} />}
  </div>;
}
