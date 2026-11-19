import React, { useMemo, useState } from "react";
import Modal from "../../ui/Modal.jsx";
import { useConfirm } from "../../ui/ConfirmProvider.jsx";
import { CATEGORIES, MARKET_ITEMS } from "../../market/items.js";
import CustomItemFields, { emptyItemForm, itemFromForm } from "../sheet/CustomItemFields.jsx";
import { giveItem } from "../../lib/items.js";
import "../sheet/market.css";
import "../sheet/itemControls.css";

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const fmtKg = n => `${(Math.round(n * 100) / 100).toString().replace(".", ",")} kg`;

// Ferramenta do mestre: entrega item do catálogo (sem recriar) ou cria um item novo e entrega a um personagem da mesa.
// A permissão é conferida no servidor (gm_give_item); este modal só aparece para o mestre.
export default function GmItemsModal({ tableId, targets, initialTarget, onClose }) {
  const askConfirm = useConfirm();
  const [tab, setTab] = useState("catalog");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [picked, setPicked] = useState(null);
  const [form, setForm] = useState(emptyItemForm());
  const [target, setTarget] = useState(initialTarget || targets[0]?.id || "");
  const [qtyText, setQtyText] = useState("1");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", error: false });
  const set = patch => setForm(f => ({ ...f, ...patch }));

  const searching = query.trim().length > 0;
  const list = useMemo(() => MARKET_ITEMS.filter(i => (searching ? norm(`${i.name} ${i.group}`).includes(norm(query)) : i.category === category)), [query, category, searching]);
  const custom = tab === "create" ? itemFromForm(form) : null;
  const qty = Math.trunc(Number(qtyText));
  const subject = tab === "catalog" ? picked : custom;
  const valid = Boolean(subject) && Boolean(target) && qty >= 1 && qty <= 99;

  async function give() {
    if (!valid || busy) return;
    const who = targets.find(t => t.id === target)?.name || "o personagem";
    const what = tab === "catalog" ? picked.name : custom.name;
    if (!(await askConfirm({ title: "Entregar item?", text: `Entregar ${qty > 1 ? `${qty}× ` : ""}${what} a ${who}? O item aparece na mochila do personagem na hora.`, actionLabel: "Entregar" }))) return;
    setBusy(true);
    setMsg({ text: "", error: false });
    try {
      await giveItem(tableId, target, tab === "catalog" ? { id: picked.id, qty } : { custom, qty });
      setMsg({ text: `${qty > 1 ? `${qty}× ` : ""}${what} entregue a ${who}.`, error: false });
      if (tab === "create") setForm(emptyItemForm());
    } catch (e) { setMsg({ text: e.message, error: true }); }
    finally { setBusy(false); }
  }

  return <Modal onClose={onClose} busy={busy} aria-labelledby="gm-items-title">
    <div className="item-modal" style={{ maxWidth: 680 }}>
      <h2 id="gm-items-title">Entregar itens</h2>
      <div className="tabs-row" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "catalog"} className={tab === "catalog" ? "primary" : "outline"} onClick={() => setTab("catalog")}>Catálogo</button>
        <button type="button" role="tab" aria-selected={tab === "create"} className={tab === "create" ? "primary" : "outline"} onClick={() => setTab("create")}>Criar item</button>
      </div>

      {tab === "catalog" ? <>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar item em todo o catálogo…" aria-label="Buscar item" />
        {!searching && <select value={category} onChange={e => setCategory(e.target.value)} aria-label="Categoria">{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>}
        <div className="gm-pick" role="radiogroup" aria-label="Item do catálogo">
          {list.map(i => <label key={i.id} className="recipient">
            <span><input type="radio" name="gm-item" checked={picked?.id === i.id} onChange={() => setPicked(i)} /> {i.name}</span>
            <small>{i.weight ? fmtKg(i.weight) : "sem peso"}</small>
          </label>)}
          {!list.length && <p className="muted">Nenhum item encontrado.</p>}
        </div>
      </> : <form className="ci-form" onSubmit={e => e.preventDefault()}><CustomItemFields form={form} set={set} /></form>}

      <div className="gm-footer">
        <div className="row">
          <label className="field"><span>Para</span>
            <select value={target} onChange={e => setTarget(e.target.value)}>
              {targets.map(t => <option key={t.id} value={t.id}>{t.name || "Sem nome"}</option>)}
            </select></label>
          <label className="field"><span>Quantidade</span>
            <input type="number" inputMode="numeric" min="1" max="99" value={qtyText} onChange={e => setQtyText(e.target.value)} onFocus={e => e.target.select()} style={{ width: "8ch" }} /></label>
        </div>
        {tab === "create" && !custom && <small className="muted">Dê um nome ao item.</small>}
        {tab === "catalog" && !picked && <small className="muted">Escolha um item da lista.</small>}
        {msg.text && <p role={msg.error ? "alert" : "status"} className="muted">{msg.text}</p>}
      </div>
      <div className="item-modal-actions">
        <button type="button" className="outline" disabled={busy} onClick={onClose}>Fechar</button>
        <button type="button" className="primary" disabled={!valid || busy} onClick={give}>{busy ? "Entregando…" : "Entregar"}</button>
      </div>
    </div>
  </Modal>;
}
