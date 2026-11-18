import React, { useMemo, useState } from "react";
import { CATEGORIES, MARKET_ITEMS, SLOTS, resolveItem } from "../../market/items.js";
import { describeEffect } from "../../market/custom.js";
import { markCustomDiscarded } from "../../lib/customItems.js";
import CustomItemForm from "./CustomItemForm.jsx";
import { buyItem, sellItem, toggleEquip, sellPrice, discardItem } from "../../market/inventory.js";
import { formatMoney, normalizeMoney } from "../../money.js";
import "../../ui/money.css";
import "./market.css";

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const fmtKg = n => `${(Math.round(n * 100) / 100).toString().replace(".", ",")} kg`;
const signed = n => (n > 0 ? `+${n}` : String(n));

function Stats({ item }) {
  const chips = [
    item.damage && ["Dano", item.damage],
    item.range && ["Distância", item.range],
    item.rof && item.rof !== "1" && ["CdT", item.rof],
    item.shots && item.shots !== "–" && ["Tiros", item.shots],
    item.minStr && item.minStr !== "–" && ["Força mín.", item.minStr],
    item.armor != null && item.slot && item.armor > 0 && ["Armadura", signed(item.armor)],
    item.effects?.parry && ["Aparar", signed(item.effects.parry)],
  ].filter(Boolean);
  const effects = (item.customEffects || []).filter(e => e.kind !== 'damage'); // o dano já aparece no chip "Dano"
  return <>
    {(chips.length > 0 || effects.length > 0) && <div className="mk-chips">{chips.map(([k, v]) => <span key={k} className="mk-chip">{k} <b>{v}</b></span>)}{effects.map((e, i) => <span key={i} className="mk-chip">{describeEffect(e)}</span>)}</div>}
    {item.notes && <p className="mk-notes">{item.notes}</p>}
  </>;
}

// Mercado: compra de equipamento do livro com o dinheiro da ficha; itens equipados somam à Resistência, ao Aparar e à carga.
export default function MarketTab({ c, d, setC, setToast, cloudId }) {
  const [view, setView] = useState("shop");
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [query, setQuery] = useState("");
  const money = normalizeMoney(c.money);
  const owned = useMemo(() => Object.fromEntries(c.inventory.map(e => [e.id, e.qty])), [c.inventory]);
  const fx = d.inventory;
  const searching = query.trim().length > 0;

  const shopItems = MARKET_ITEMS.filter(item => (searching ? norm(`${item.name} ${item.group}`).includes(norm(query)) : item.category === category));
  const groups = [...new Set(shopItems.map(i => i.group))];
  const bag = c.inventory.map(e => ({ ...e, item: resolveItem(e) })).filter(e => e.item)
    .sort((a, b) => Number(b.equipped) - Number(a.equipped) || a.item.category.localeCompare(b.item.category) || a.item.name.localeCompare(b.item.name, "pt-BR"));

  const buy = item => {
    if (item.cost > money) return;
    setC(prev => buyItem(prev, item.id, 1) || prev);
    setToast(`${item.name} comprado por $ ${formatMoney(item.cost)}.`);
  };
  const sell = item => {
    setC(prev => sellItem(prev, item.id, 1) || prev);
    setToast(`${item.name} vendido por $ ${formatMoney(sellPrice(item, 1))}.`);
  };
  const equip = id => setC(prev => toggleEquip(prev, id) || prev);

  return <div className="market">
    <div className="mk-status">
      <div className="mk-money"><span className="money-coin" aria-hidden="true">$</span><div><b>{formatMoney(money)}</b><small>seu dinheiro</small></div></div>
      <div className="mk-effects" aria-label="Efeitos dos itens equipados">
        <span className="mk-chip">Resistência <b>{signed(fx.armor)}</b></span>
        <span className="mk-chip">Aparar <b>{signed(fx.parry)}</b></span>
        <span className={`mk-chip${fx.overload ? " bad" : ""}`}>Carga <b>{fmtKg(fx.weight)} / {fmtKg(fx.capacity)}</b></span>
        {fx.overload > 0 && <span className="mk-chip bad">Sobrecarga <b>−{fx.overload} de Movimento</b></span>}
      </div>
    </div>

    <div className="tabs-row" role="tablist">
      <button type="button" role="tab" aria-selected={view === "shop"} className={view === "shop" ? "primary" : "outline"} onClick={() => setView("shop")}>Loja</button>
      <button type="button" role="tab" aria-selected={view === "custom"} className={view === "custom" ? "primary" : "outline"} onClick={() => setView("custom")}>Item custom</button>
      <button type="button" role="tab" aria-selected={view === "bag"} className={view === "bag" ? "primary" : "outline"} onClick={() => setView("bag")}>Mochila ({c.inventory.reduce((n, e) => n + e.qty, 0)})</button>
    </div>

    {view === "custom" ? <CustomItemForm cloudId={cloudId} /> : view === "shop" ? <>
      <div className="mk-filters">
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar item em todo o mercado…" aria-label="Buscar item" />
      </div>
      {!searching && <div className="tabs-row mk-cats" role="tablist" aria-label="Categorias">
        {CATEGORIES.map(cat => <button key={cat.id} type="button" role="tab" aria-selected={category === cat.id} className={category === cat.id ? "primary" : "outline"} onClick={() => setCategory(cat.id)}>
          {cat.label} <span className="mk-count">{MARKET_ITEMS.filter(i => i.category === cat.id).length}</span></button>)}
      </div>}
      {groups.map(group => <section key={group} className="mk-group" aria-label={group}>
        <h3>{group}</h3>
        <div className="mk-list">
          {shopItems.filter(i => i.group === group).map(item => {
            const can = item.cost <= money;
            return <article className="mk-item" key={item.id}>
              <div className="mk-main">
                <h4>{item.name}{owned[item.id] ? <span className="mk-owned">×{owned[item.id]} na mochila</span> : null}</h4>
                <p className="mk-meta">{item.weight ? fmtKg(item.weight) : "sem peso"}{item.slot ? ` · ${SLOTS[item.slot]}` : ""}</p>
                <Stats item={item} />
              </div>
              <div className="mk-buy">
                <b className="mk-price">$ {formatMoney(item.cost)}</b>
                <button type="button" className="primary" disabled={!can} onClick={() => buy(item)}>{can ? "Comprar" : "Sem dinheiro"}</button>
              </div>
            </article>;
          })}
        </div>
      </section>)}
      {!shopItems.length && <p className="muted">Nenhum item encontrado.</p>}
      <p className="muted mk-foot">Preços do livro (capítulo 2), relativos aos recursos iniciais de $500. Veículos e itens "Militar" não ficam à venda.</p>
    </> : <>
      {!bag.length ? <p className="muted">Sua mochila está vazia. Compre itens na loja.</p> : <div className="mk-list">
        {bag.map(({ id, qty, equipped, item }) => <article className={`mk-item${equipped ? " on" : ""}`} key={id}>
          <div className="mk-main">
            <h4>{item.name}{qty > 1 && <span className="mk-owned">×{qty}</span>}{equipped && <span className="mk-equipped">Equipado</span>}</h4>
            <p className="mk-meta">{item.weight ? fmtKg(item.weight * qty) : "sem peso"}{item.isCustom ? " · Item customizado" : item.slot ? ` · ${SLOTS[item.slot]}` : ""}</p>
            <Stats item={item} />
          </div>
          <div className="mk-buy">
            {item.slot && <button type="button" className={equipped ? "outline" : "primary"} onClick={() => equip(id)}>{equipped ? "Desequipar" : "Equipar"}</button>}
            {item.isCustom
              ? <button type="button" className="text-button danger" onClick={() => window.confirm(`Descartar "${item.name}"? O item sai da mochila e não volta sem nova aprovação.`) && (setC(prev => discardItem(prev, id) || prev), markCustomDiscarded(id))}>Descartar</button>
              : <button type="button" className="text-button" onClick={() => sell(item)} title="Vender uma unidade por metade do preço">Vender (+$ {formatMoney(sellPrice(item, 1))})</button>}
          </div>
        </article>)}
      </div>}
      <p className="muted mk-foot">Equipar um item troca o que já estava no mesmo espaço. Armaduras (torso, cabeça, braços, pernas) somam na Resistência; armas e escudos somam no Aparar. Vender devolve metade do preço.</p>
    </>}
  </div>;
}
