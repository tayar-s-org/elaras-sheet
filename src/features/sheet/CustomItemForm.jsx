import React, { useCallback, useEffect, useState } from "react";
import { ATTRIBUTES, SKILLS } from "../../rules.js";
import { DERIVED, MAX_BONUS, MAX_EFFECTS, MAX_NAME, MAX_DESCRIPTION, MAX_DAMAGE, sanitizeCustom, describeEffect, cleanDamage } from "../../market/custom.js";
import { myMemberships } from "../../lib/tables.js";
import { listMyCustomItems, submitCustomItem, deleteCustomItem, ITEM_STATUS } from "../../lib/customItems.js";

const LISTS = { attributes: ATTRIBUTES, skills: SKILLS.map(([name]) => name) };
const KINDS = [["attribute", "Atributo"], ["skill", "Perícia"], ["derived", "Valor da ficha"]];
const targetsOf = kind => (kind === "attribute" ? ATTRIBUTES.map(a => [a, a]) : kind === "skill" ? LISTS.skills.map(s => [s, s]) : Object.entries(DERIVED));
const newEffect = () => ({ kind: "attribute", target: ATTRIBUTES[0], bonus: 1 });
const fmtKg = n => `${(Math.round(n * 100) / 100).toString().replace(".", ",")} kg`;

// Item custom: o jogador descreve o item e escolhe a mesa; o mestre aprova na aba "Itens" da sala e o item cai na mochila.
export default function CustomItemForm({ cloudId, tableId: sheetTable }) {
  const [tables, setTables] = useState(null);
  const [mine, setMine] = useState(undefined); // undefined carregando; null migration pendente
  const [form, setForm] = useState({ name: "", weight: "", damage: "", description: "", tableId: "", effects: [] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = patch => setForm(f => ({ ...f, ...patch }));

  const refresh = useCallback(async () => { setMine(await listMyCustomItems()); }, []);
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

  const setEffect = (i, patch) => set({ effects: form.effects.map((e, j) => {
    if (j !== i) return e;
    const next = { ...e, ...patch };
    if (patch.kind) next.target = targetsOf(patch.kind)[0][0];
    return next;
  }) });
  const damage = cleanDamage(form.damage);
  const item = sanitizeCustom({ ...form, effects: [...(damage ? [{ kind: "damage", target: damage, bonus: 0 }] : []), ...form.effects], weight: Number(String(form.weight).replace(",", ".")) || 0 }, LISTS);
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
      setForm(f => ({ ...f, name: "", weight: "", damage: "", description: "", effects: [] }));
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
      <div className="ci-row2">
        <label className="field"><span>Nome do item</span>
          <input maxLength={MAX_NAME} value={form.name} onChange={e => set({ name: e.target.value })} placeholder="Ex.: Anel do lobo cinzento" /></label>
        <label className="field"><span>Peso (kg)</span>
          <input type="number" min="0" max="500" step="0.1" value={form.weight} onChange={e => set({ weight: e.target.value })} placeholder="0" /></label>
      </div>

      <label className="field"><span>Dano (se for uma arma)</span>
        <input maxLength={MAX_DAMAGE} value={form.damage} onChange={e => set({ damage: e.target.value })} placeholder="Ex.: For+d6, 2d6+1, d8" />
        {form.damage.trim() && !damage && <small className="ci-hint">Use só letras, números e + − * / ( ). Ex.: For+d6.</small>}</label>

      <fieldset className="custom-set"><legend>O que o item dá ({form.effects.length}/{MAX_EFFECTS})</legend>
        {form.effects.length === 0 && <p className="muted ci-hint">Sem efeito nas regras: o item serve só como registro. Adicione bônus para ele ajudar nas rolagens.</p>}
        {form.effects.map((e, i) => <div className="ci-effect" key={i}>
          <select aria-label="Tipo do efeito" value={e.kind} onChange={ev => setEffect(i, { kind: ev.target.value })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select aria-label="Alvo do efeito" value={e.target} onChange={ev => setEffect(i, { target: ev.target.value })}>{targetsOf(e.kind).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <input type="number" aria-label="Bônus" min={-MAX_BONUS} max={MAX_BONUS} value={e.bonus} onChange={ev => setEffect(i, { bonus: Number(ev.target.value) })} />
          <button type="button" className="text-button danger" aria-label="Remover efeito" onClick={() => set({ effects: form.effects.filter((_, j) => j !== i) })}>×</button>
        </div>)}
        <button type="button" className="outline" disabled={form.effects.length >= MAX_EFFECTS} onClick={() => set({ effects: [...form.effects, newEffect()] })}>+ Adicionar efeito</button>
        <p className="muted ci-hint">Atributos e perícias dão bônus nas rolagens (de −{MAX_BONUS} a +{MAX_BONUS}). Valores da ficha (armadura, Aparar, Movimento, Mana) somam direto nos números.</p>
      </fieldset>

      <label className="field"><span>Descrição</span>
        <textarea rows="3" maxLength={MAX_DESCRIPTION} value={form.description} onChange={e => set({ description: e.target.value })} placeholder="Como é, de onde veio, como funciona…" /></label>
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
    {mine === undefined ? <p className="muted">Carregando…</p>
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
