import React, { useEffect, useState } from "react";
import { myMemberships } from "../../lib/tables.js";
import { navigate } from "../../lib/router.js";
import "./tablebinding.css";

// A ficha é criada para uma mesa e só vale nela. Ficha nova (ou antiga, sem mesa) escolhe a mesa aqui; depois fica fixa.
export default function TableBinding({ sheet, onBind }) {
  const [tables, setTables] = useState(null);
  const [tableId, setTableId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bound = Boolean(sheet.tableId);

  useEffect(() => {
    if (bound) return undefined;
    let alive = true;
    myMemberships().then(rows => {
      if (!alive) return;
      const list = rows.filter(r => r.status === "approved").map(r => r.tables);
      setTables(list);
      setTableId(id => id || list[0]?.id || "");
    }).catch(() => alive && setTables([]));
    return () => { alive = false; };
  }, [bound]);

  if (bound) return <div className="tb tb-bound" role="note">
    <span>Mesa: <b>{sheet.tableName || "esta mesa"}</b></span>
    <small>Esta ficha foi criada para essa mesa e só vale nela.</small>
  </div>;

  async function bind(e) {
    e.preventDefault();
    const table = (tables || []).find(t => t.id === tableId);
    if (!table || busy) return;
    setBusy(true);
    setError("");
    try { await onBind(table); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <form className="tb tb-pick callout" onSubmit={bind}>
    <b>{sheet.cloud ? "Esta ficha ainda não pertence a nenhuma mesa" : "Para qual mesa é esta ficha?"}</b>
    <p>{sheet.cloud
      ? "Fichas passam a valer em uma mesa só. Escolha a mesa desta ficha; depois não dá para trocar."
      : "A ficha é criada para uma mesa e só vale nela. Ela começa a ser salva na sua conta depois que você escolher a mesa; depois não dá para trocar."}</p>
    {tables && !tables.length
      ? <div className="row"><span className="muted">Você ainda não participa de nenhuma mesa. Entre em uma com o código do mestre ou crie a sua.</span><button type="button" className="outline" onClick={() => navigate("/mesas")}>Ir para Mesas</button></div>
      : <div className="row tb-row">
        <select aria-label="Mesa da ficha" value={tableId} disabled={!tables} onChange={e => setTableId(e.target.value)}>
          {(tables || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="primary" disabled={busy || !tableId}>{busy ? "Vinculando…" : "Criar a ficha para esta mesa"}</button>
      </div>}
    {error && <p role="alert" className="muted">{error}</p>}
  </form>;
}
