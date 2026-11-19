import React from 'react';

// Condições ativas (Atordoado, Cego…): chips com ícone; o texto completo (duração e observação) fica no título e, no modo normal, ao lado.
// Mesmo formato dos efeitos das criaturas (tokenState.js). Mostra nada quando não há condição.
export default function ActiveConditions({ conditions, compact = false, title = 'Status ativos' }) {
  if (!conditions?.length) return null;
  return <ul className={`active-conditions${compact ? ' compact' : ''}`} aria-label={title}>
    {conditions.map(c => {
      const detail = [c.duration, c.note].filter(Boolean).join(' · ');
      return <li key={c.id} className="effect-chip" title={detail ? `${c.label} — ${detail}` : c.label}>
        <span aria-hidden="true">{c.icon}</span> {c.label}{!compact && c.duration ? <small> · {c.duration}</small> : null}
        {!compact && c.note ? <small className="muted"> — {c.note}</small> : null}
      </li>;
    })}
  </ul>;
}
