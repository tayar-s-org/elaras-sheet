import React from "react";

// Saldo de pontos de criação que acompanha os editores que gastam pontos (o modal cobre o painel lateral).
export default function PointsStrip({ d }) {
  if (d.remaining == null) return null;
  const total = d.remaining + d.spent;
  const state = d.remaining < 0 ? "deficit" : d.remaining === 0 ? "ok" : "free";
  const text = state === "deficit" ? "Orçamento excedido" : state === "ok" ? "Todos os pontos usados" : "pontos livres";
  return <div className="mod-points" data-state={state} role="status" aria-label="Pontos de criação">
    <strong>{d.remaining}</strong>
    <span className="mod-points-text">{text}</span>
    <span className="mod-points-sub">{d.spent} gastos de {total}</span>
  </div>;
}
