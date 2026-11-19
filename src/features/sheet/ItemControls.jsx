import React, { useRef, useState, useEffect } from "react";
import { useConfirm } from "../../ui/ConfirmProvider.jsx";
import { unitFills } from "../../market/items.js";
import "./itemControls.css";

const fmtL = n => `${(Math.round(n * 100) / 100).toString().replace(".", ",")}`;

// Pode gastar uma unidade por aqui? Só diminui: a última unidade de equipamento ou de item customizado sai por Vender/Descartar.
export const canUse = (entry, item) => Boolean(item) && !item.liquid && (item.isCustom ? entry.qty > 1 : !item.slot || entry.qty > 1);

// Botão "−": gasta uma unidade (não existe "+": mais unidades só vêm de compra, troca ou mestre).
export function QtyMinus({ entry, item, disabled = false, onConsume }) {
  const askConfirm = useConfirm();
  if (!canUse(entry, item)) return null;
  const last = entry.qty === 1;
  const press = async () => {
    if (last && !(await askConfirm({ title: "Usar a última unidade?", text: `"${item.name}" sai da mochila.`, actionLabel: "Usar" }))) return;
    onConsume(null);
  };
  return <button type="button" className="qty-minus" disabled={disabled} aria-label={`Usar 1 unidade de ${item.name}`} title="Usar 1 unidade" onClick={press}>−</button>;
}

// Barra deslizante do nível de um cantil (0 a capacidade, passos de 0,05 L). live: grava a cada movimento (ficha, que salva
// sozinha); sem live só grava ao soltar (token: cada gravação é uma chamada ao servidor).
export function LiquidSlider({ value, capacity = 1, label, disabled = false, live = false, onCommit }) {
  const [draft, setDraft] = useState(value);
  const dragging = useRef(false);
  useEffect(() => { if (!dragging.current) setDraft(value); }, [value]);
  const commit = v => {
    dragging.current = false;
    if (v === value) return;
    const result = onCommit(v);
    if (result?.catch) result.catch(() => setDraft(value)); // o servidor recusou: volta ao nível real
  };
  return <div className="liquid">
    <input type="range" className="liquid-range" min="0" max={capacity} step="0.05" value={draft} disabled={disabled}
      aria-label={`${label}: ${fmtL(draft)} L de ${fmtL(capacity)} L`}
      style={{ "--fill": `${capacity ? (draft / capacity) * 100 : 0}%` }}
      onChange={e => { dragging.current = !live; const v = Number(e.target.value); setDraft(v); if (live) onCommit(v); }}
      onPointerUp={e => commit(Number(e.currentTarget.value))}
      onKeyUp={e => commit(Number(e.currentTarget.value))}
      onBlur={e => dragging.current && commit(Number(e.currentTarget.value))} />
    <output className="liquid-label">{fmtL(draft)} L / {fmtL(capacity)} L</output>
  </div>;
}

// Menu discreto "⋯" com a ação de enviar o item a outro jogador da mesa.
export function SendMenu({ onSend, disabled = false, title = "", label = "Enviar a outro jogador…" }) {
  const ref = useRef(null);
  return <details className="item-more" ref={ref}>
    <summary aria-label="Mais ações do item" title="Mais ações">⋯</summary>
    <div className="item-menu">
      <button type="button" className="text-button" disabled={disabled} title={title} onClick={() => { ref.current?.removeAttribute("open"); onSend(); }}>{label}</button>
      {disabled && title && <small className="muted">{title}</small>}
    </div>
  </details>;
}

// Um cantil por linha: barra de nível, "−" para tirar aquela unidade (com o nível dela) e "⋯" para enviá-la.
export function LiquidUnits({ entry, item, disabled = false, live = false, onFill, onConsume, onSend, sendDisabled = false, sendTitle = "" }) {
  const askConfirm = useConfirm();
  if (!item?.liquid) return null;
  const fills = unitFills(entry, item);
  const only = entry.qty === 1;
  const remove = async index => {
    if (!(await askConfirm({ title: "Tirar este cantil?", text: `Uma unidade de "${item.name}" (${fmtL(fills[index])} L) sai da mochila.`, actionLabel: "Tirar" }))) return;
    onConsume(index);
  };
  return <div className="liquid-units">
    {fills.map((litres, i) => <div className="liquid-unit" key={i}>
      {!only && <span className="liquid-name">{i + 1}</span>}
      <LiquidSlider value={litres} capacity={item.liquid.capacity} label={`${item.name}${only ? "" : ` ${i + 1}`}`} disabled={disabled} live={live} onCommit={v => onFill(i, v)} />
      <button type="button" className="qty-minus" disabled={disabled} aria-label={`Tirar ${item.name}${only ? "" : ` ${i + 1}`} da mochila`} title="Tirar esta unidade" onClick={() => remove(i)}>−</button>
      {onSend && <SendMenu onSend={() => onSend(i)} disabled={sendDisabled} title={sendTitle} label="Enviar este cantil…" />}
    </div>)}
  </div>;
}
