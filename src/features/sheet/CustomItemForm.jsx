import React, { useCallback, useEffect, useState } from "react";
import { describeEffect } from "../../market/custom.js";
import CustomItemFields, { emptyItemForm, itemFromForm } from "./CustomItemFields.jsx";
import { myMemberships } from "../../lib/tables.js";
import { listMyCustomItems, submitCustomItem, deleteCustomItem, ITEM_STATUS } from "../../lib/customItems.js";

const fmtKg = n => `${(Math.round(n * 100) / 100).toString().replace(".", ",")} kg`;

// Item custom: o jogador descreve o item e escolhe a mesa; o mestre aprova na aba "Itens" da sala e o item cai na mochila.
export default function CustomItemForm({ cloudId, tableId: sheetTable }) {
  const [tables, setTables] = useState(null);
  const [mine, setMine] = useState(undefined); // undefined carregando; null migration pendente
  const [form, setForm] = useState({ ...emptyItemForm(), tableId: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [loadError, setLoadError] = useState("");
  const set = patch => setForm(f => ({ ...f, ...patch }));

  // Se a consulta falha (rede, sessão), mantém a lista anterior e mostra o erro com "Tentar de novo".
  const refresh = useCallback(async () => {
    try { setMine(await listMyCustomItems()); setLoadError(""); }
    catch (e) { setLoadError(e.message); }
  }, []);
  useEffect(() => {
    myMemberships().then(rows => {
      // A ficha vale numa mesa só: o item vai para a mesa da própria ficha.
      const list = rows.filter(r => r.status === "approved" && (!sheetTable || r.tables.id === sheetTable)).map(r => r.tables);
      setTables(list);
      setForm(f => ({ ...f, tableId: f.tableId || list[0]?.id || "" }));
    }).catch(() => setTables([]));
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [refresh]);

  const item = itemFromForm(form);
  const reason = !cloudId ? "Aguarde o salvamento automático da ficha na sua conta para enviar itens."
    : tables && !tables.length ? "Você precisa participar de uma mesa para enviar um item ao mestre."
    : !item ? "Dê um nome ao item." : "";

  async function submit(e) {
    e.preventDefault();
    if (reason || busy) return;
    setBusy(true);
    setMsg("");
    try {
      await submitCustomItem(form.tableId, cloudId, item);
      setForm(f => ({ ...f, ...emptyItemForm() }));
      setMsg("Item enviado. Quando o mestre aprovar, ele aparece na sua mochila.");
      await refresh();
    } catch (err) { setMsg(err.message); } finally { setBusy(false); }
  }
  async function cancel(id) {
    try { await deleteCustomItem(id); await refresh(); } catch (err) { setMsg(err.message); }
  }

  return <div className="ci">
    <p className="muted">Crie um item que não está no livro. Ele vai para o mestre da mesa que você escolher; se for aprovado, entra na sua mochila e, equipado, soma os bônus na ficha sozinho.</p>
    <form className="ci-form" onSubmit={submit}>
      <CustomItemFields form={form} set={set} />
      <label className="field"><span>Enviar para a mesa</span>
        <select value={form.tableId} onChange={e => set({ tableId: e.target.value })} disabled={!tables?.length}>
          {(tables || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          {tables && !tables.length && <option value="">Nenhuma mesa</option>}
        </select></label>
      {reason && <p className="muted ci-hint">{reason}</p>}
      <div className="row ci-actions"><button className="primary" disabled={Boolean(reason) || busy}>{busy ? "Enviando…" : "Enviar para aprovação"}</button></div>
      {msg && <p role="status" className="muted">{msg}</p>}
    </form>

    <h3>Meus itens enviados</h3>
    {loadError && <p role="alert" className="muted">{loadError} <button type="button" className="text-button" onClick={refresh}>Tentar de novo</button></p>}
    {mine === undefined ? (!loadError && <p className="muted">Carregando…</p>)
      : mine === null ? <p className="callout">Os itens customizados ainda não estão disponíveis neste servidor. Falta rodar a migration <code>0018_custom_items.sql</code> no Supabase.</p>
        : !mine.length ? <p className="muted">Você ainda não enviou nenhum item.</p>
          : <div className="mk-list">{mine.map(row => <article key={row.id} className="mk-item">
            <div className="mk-main">
              <h4>{row.name}<span className={`ci-status ${row.status}`}>{ITEM_STATUS[row.status]}</span>{row.status === "approved" && row.price > 0 && <span className="muted"> · custou $ {row.price.toLocaleString("pt-BR")}</span>}</h4>
              <p className="mk-meta">{row.tables?.name || "Mesa"} · {row.weight ? fmtKg(Number(row.weight)) : "sem peso"}</p>
              {row.effects?.length > 0 && <div className="mk-chips">{row.effects.map((e, i) => <span key={i} className="mk-chip">{describeEffect(e)}</span>)}</div>}
              {row.description && <p className="mk-notes">{row.description}</p>}
              {row.gm_note && <p className="mk-notes"><b>Mestre:</b> {row.gm_note}</p>}
            </div>
            {row.status === "pending" && <div className="mk-buy"><button type="button" className="text-button danger" onClick={() => cancel(row.id)}>Cancelar pedido</button></div>}
          </article>)}</div>}
  </div>;
}
