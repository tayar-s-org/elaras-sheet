import React from 'react';
import { calculate, validateCharacter } from '../../../rules.js';
import { stageForXP } from '../../../catalogRules.js';
import { formatMoney } from '../../../money.js';
import { tokenUrl } from '../../../lib/tokens.js';
import '../../../ui/money.css';

const initials = name => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

// Identidade compacta, sempre visível. `full` = dinheiro e pontos (dono ou mestre); sem ele, só o que os outros jogadores já veem.
export default function SheetIdentityCard({ data, full, kind }) {
  let c = null, d = null;
  try { c = data ? validateCharacter(data) : null; d = c ? calculate(c) : null; } catch { c = null; }
  if (!c) {
    const text = kind === 'creature' ? 'Este token não tem ficha de personagem.'
      : kind === 'none' ? 'Selecione um token de personagem para ver a ficha.'
      : 'Ficha indisponível no momento.';
    return <div className="bsp-identity empty"><span className="bsp-portrait" aria-hidden="true">?</span><p className="muted" role="status">{text}</p></div>;
  }
  const src = tokenUrl(c.tokenImage);
  return <div className="bsp-identity" aria-label={`Identidade de ${c.name || 'personagem'}`}>
    {src ? <img className="bsp-portrait" src={src} alt="" /> : <span className="bsp-portrait" aria-hidden="true">{initials(c.name)}</span>}
    <div className="bsp-id-text">
      <h3>{c.name || 'Sem nome'}</h3>
      <p className="bsp-concept" title={c.concept || undefined}>{c.concept || 'Sem conceito definido'}</p>
      <p>{[c.race, c.age && `${c.age}`].filter(Boolean).join(' · ') || 'Raça não definida'} · Nível {d.level} · {c.xp} XP · {stageForXP(c.xp)}</p>
      {full ? <p className="bsp-money"><span className="money-coin" aria-hidden="true">$</span> <b>{formatMoney(c.money)}</b> · Pontos: {d.remaining + d.spent} no total · {d.spent} gastos · {d.remaining} livres</p>
        : <p>Dinheiro e demais módulos são privados.</p>}
    </div>
  </div>;
}
