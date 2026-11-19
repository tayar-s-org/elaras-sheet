import React, { useEffect, useState } from "react";
import Modal from "../../ui/Modal.jsx";
import { useConfirm } from "../../ui/ConfirmProvider.jsx";
import { listRecipients, transferItem } from "../../lib/items.js";

// Enviar item a outro personagem da mesma mesa. A transferência é atômica no servidor (sai de um e entra no outro juntos).
// index: enviar uma unidade específica de cantil (leva o nível dela); sem index, envia da quantidade.
export default function TransferModal({ tableId, fromCharacter, itemId, itemName, max, index = null, onClose, onDone }) {
  const askConfirm = useConfirm();
  const [recipients, setRecipients] = useState(null);
  const [to, setTo] = useState("");
  const [qtyText, setQtyText] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const single = index != null;
  const qty = single ? 1 : Math.trunc(Number(qtyText));
  const valid = Boolean(to) && qty >= 1 && qty <= max;

  useEffect(() => {
    let alive = true;
    listRecipients(tableId, fromCharacter).then(rows => { if (alive) setRecipients(rows); }).catch(e => { if (alive) { setRecipients([]); setError(e.message); } });
    return () => { alive = false; };
  }, [tableId, fromCharacter]);

  async function send() {
    if (!valid || busy) return;
    const target = recipients.find(r => r.characterId === to);
    if (!(await askConfirm({ title: "Enviar item?", text: `Enviar ${qty > 1 ? `${qty}× ` : ""}${itemName} para ${target.name}? Ele sai da sua mochila agora e não dá para desfazer sozinho.`, actionLabel: "Enviar" }))) return;
    setBusy(true);
    setError("");
    try {
      await transferItem({ tableId, from: fromCharacter, to, id: itemId, qty, index });
      onDone?.(`${qty > 1 ? `${qty}× ` : ""}${itemName} enviado para ${target.name}.`);
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  }

  return <Modal onClose={onClose} busy={busy} aria-labelledby="transfer-title">
    <div className="item-modal">
      <h2 id="transfer-title">Enviar {itemName}</h2>
      {recipients === null ? <p className="muted">Carregando personagens da mesa…</p>
        : !recipients.length ? <p className="muted">Não há outros personagens aprovados nesta mesa para receber o item.</p>
          : <div className="recipients" role="radiogroup" aria-label="Destinatário">
            {recipients.map(r => <label key={r.characterId} className="recipient">
              <input type="radio" name="recipient" checked={to === r.characterId} onChange={() => setTo(r.characterId)} />
              <span>{r.name}{r.player && <small> · {r.player}</small>}</span>
            </label>)}
          </div>}
      {!single && <label className="qty-field"><span>Quantidade (você tem {max})</span>
        <input type="number" inputMode="numeric" min="1" max={max} value={qtyText} data-modal-focus onChange={e => setQtyText(e.target.value)} onFocus={e => e.target.select()} /></label>}
      {error && <p role="alert" className="muted">{error}</p>}
      <div className="item-modal-actions">
        <button type="button" className="outline" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="button" className="primary" disabled={!valid || busy} onClick={send}>{busy ? "Enviando…" : "Enviar"}</button>
      </div>
    </div>
  </Modal>;
}
