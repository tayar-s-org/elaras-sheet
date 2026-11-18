import React, { useCallback, useEffect, useState } from "react";
import { DICE, SKILLS } from "../../rules.js";
import { MAX_SKILL_NAME, MAX_CUSTOM_SKILLS, cleanSkillName, skillNameTaken, skillPoints } from "../../skills/custom.js";
import { myMemberships } from "../../lib/tables.js";
import { listMyCustomSkills, submitCustomSkill, deleteCustomSkill, SKILL_STATUS } from "../../lib/customSkills.js";
import "../sheet/market.css";

const FIXED = SKILLS.map(([name]) => name);

// Pedir uma perícia personalizada: nome e dado inicial (mesmo custo das outras) vão para o mestre da mesa escolhida.
export default function CustomSkillForm({ c, cloudId, tableId: sheetTable }) {
  const [tables, setTables] = useState(null);
  const [mine, setMine] = useState(undefined); // undefined carregando; null migration pendente
  const [form, setForm] = useState({ name: "", die: 4, tableId: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = patch => setForm(f => ({ ...f, ...patch }));

  const refresh = useCallback(async () => { setMine(await listMyCustomSkills()); }, []);
  useEffect(() => {
    myMemberships().then(rows => {
      // A ficha vale numa mesa só: o pedido vai para a mesa da própria ficha.
      const list = rows.filter(r => r.status === "approved" && (!sheetTable || r.tables.id === sheetTable)).map(r => r.tables);
      setTables(list);
      setForm(f => ({ ...f, tableId: f.tableId || list[0]?.id || "" }));
    }).catch(() => setTables([]));
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [refresh]);

  const name = cleanSkillName(form.name);
  const pendingSame = (mine || []).some(r => r.status === "pending" && r.table_id === form.tableId && cleanSkillName(r.name).toLowerCase() === name.toLowerCase());
  const reason = !cloudId ? "Aguarde o salvamento automático da ficha na sua conta para enviar pedidos."
    : tables && !tables.length ? "Você precisa participar de uma mesa para pedir uma perícia ao mestre."
    : !name ? "Dê um nome à perícia."
    : skillNameTaken(name, c, FIXED) ? "Esse nome já existe na sua ficha (perícia do livro ou personalizada)."
    : (c.customSkills || []).length >= MAX_CUSTOM_SKILLS ? `Você já tem ${MAX_CUSTOM_SKILLS} perícias personalizadas.`
    : pendingSame ? "Você já enviou um pedido com esse nome para esta mesa." : "";

  async function submit(e) {
    e.preventDefault();
    if (reason || busy) return;
    setBusy(true);
    setMsg("");
    try {
      await submitCustomSkill(form.tableId, cloudId, name, form.die);
      setForm(f => ({ ...f, name: "" }));
      setMsg("Pedido enviado. Quando o mestre aprovar, a perícia aparece aqui, já com o dado que você escolheu.");
      await refresh();
    } catch (err) { setMsg(err.message); } finally { setBusy(false); }
  }
  async function cancel(id) {
    try { await deleteCustomSkill(id); await refresh(); } catch (err) { setMsg(err.message); }
  }

  return <div className="ci">
    <p className="muted">Precisa de uma perícia que não está no livro? Escolha o nome e o dado inicial e envie ao mestre. Se ele aprovar, a perícia entra na ficha e custa pontos como as outras (d4 custa 1, d6 custa 2, d8 custa 3, d10 custa 4 e d12 custa 5).</p>
    <form className="ci-form" onSubmit={submit}>
      <label className="field"><span>Nome da perícia</span>
        <input maxLength={MAX_SKILL_NAME} value={form.name} onChange={e => set({ name: e.target.value })} placeholder="Ex.: Alquimia, Cartografia, Herbalismo…" /></label>
      <div className="field"><span>Dado inicial</span>
        <div className="die-picker" role="radiogroup" aria-label="Dado inicial da perícia">
          {DICE.map(v => <button key={v} type="button" role="radio" aria-checked={form.die === v} className={form.die === v ? "sel" : ""} onClick={() => set({ die: v })}>d{v}</button>)}
        </div>
        <small className="muted">Custo: {skillPoints(form.die)} {skillPoints(form.die) === 1 ? "ponto" : "pontos"}. Você ajusta o dado depois, como nas outras perícias.</small></div>
      <label className="field"><span>Enviar para a mesa</span>
        <select value={form.tableId} onChange={e => set({ tableId: e.target.value })} disabled={!tables?.length}>
          {(tables || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          {tables && !tables.length && <option value="">Nenhuma mesa</option>}
        </select></label>
      {reason && <p className="muted ci-hint">{reason}</p>}
      <div className="row ci-actions"><button className="primary" disabled={Boolean(reason) || busy}>{busy ? "Enviando…" : "Pedir ao mestre"}</button></div>
      {msg && <p role="status" className="muted">{msg}</p>}
    </form>

    <h3>Meus pedidos de perícia</h3>
    {mine === undefined ? <p className="muted">Carregando…</p>
      : mine === null ? <p className="callout">As perícias personalizadas ainda não estão disponíveis neste servidor. Falta rodar a migration <code>0027_custom_skills.sql</code> no Supabase.</p>
        : !mine.length ? <p className="muted">Você ainda não pediu nenhuma perícia.</p>
          : <div className="mk-list">{mine.map(row => <article key={row.id} className="mk-item">
            <div className="mk-main">
              <h4>{row.name}<span className={`ci-status ${row.status}`}>{SKILL_STATUS[row.status]}</span></h4>
              <p className="mk-meta">{row.tables?.name || "Mesa"} · d{row.die}</p>
              {row.gm_note && <p className="mk-notes"><b>Mestre:</b> {row.gm_note}</p>}
            </div>
            {row.status === "pending" && <div className="mk-buy"><button type="button" className="text-button danger" onClick={() => cancel(row.id)}>Cancelar pedido</button></div>}
          </article>)}</div>}
  </div>;
}
