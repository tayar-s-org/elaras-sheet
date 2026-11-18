import React from 'react';
import { ATTRIBUTES, calculate, validateCharacter } from '../../rules.js';
import { RESOURCES, safeMaxima, level, LEVEL_TEXT, currentValue } from './vitals.js';
import './peek.css';

// Resumo da ficha mostrado no canto do tabuleiro quando se clica no token de um personagem.
export default function SheetPeek({ data, state, onClose }) {
  let c, d;
  try { c = validateCharacter(data); d = calculate(c); } catch { return null; }
  const max = safeMaxima(data);
  const skills = Object.entries(c.skills).filter(([, die]) => die > 0);
  return <aside className="sheet-peek" aria-label={`Ficha de ${c.name || 'personagem'}`}>
    <button type="button" className="peek-close" aria-label="Fechar resumo da ficha" onClick={onClose}>×</button>
    <h4>{c.name || 'Sem nome'}</h4>
    <p className="muted">{[c.race, c.concept, `Nível ${d.level}`].filter(Boolean).join(' · ')}</p>
    <div className="peek-vitals">
      {RESOURCES.map(([k, label]) => {
        const mana = k === 'mana';
        const value = currentValue(state, max, k);
        const lvl = level(value, max[k], mana);
        return <div key={k} className="peek-vital">
          <div className="peek-vital-head">
            <span>{label}</span>
            <span className={`chip l${lvl}`}>{LEVEL_TEXT[mana ? 'mana' : 'normal'][lvl]}</span>
            <strong>{value}<small>/{max[k]}</small></strong>
          </div>
          <div className={`res-bar${mana ? ' mana' : ''}`} aria-hidden="true"><i style={{ width: `${max[k] ? Math.min(100, (value / max[k]) * 100) : 0}%` }} /></div>
        </div>;
      })}
    </div>
    <div className="peek-stats">
      {[['Movimento', d.movement], ['Aparar', d.parry], ['Resistência', d.toughness]].map(([k, v]) => <span key={k}><small>{k}</small><b>{v}</b></span>)}
    </div>
    <h5>Atributos</h5>
    <div className="peek-grid">{ATTRIBUTES.map(n => <span key={n}>{n} <b>d{c.attributes[n]}</b></span>)}</div>
    {skills.length > 0 && <>
      <h5>Perícias</h5>
      <div className="peek-grid">{skills.map(([n, die]) => <span key={n}>{n} <b>d{die}</b></span>)}</div>
    </>}
    {c.advantages.length > 0 && <>
      <h5>Vantagens</h5>
      <p>{c.advantages.map(a => a.name).filter(Boolean).join(', ')}</p>
    </>}
    {c.hindrances.length > 0 && <>
      <h5>Complicações</h5>
      <p>{c.hindrances.map(h => `${h.name}${h.name ? ` (${h.severity})` : ''}`).filter(Boolean).join(', ')}</p>
    </>}
    {c.powers.length > 0 && <>
      <h5>Poderes</h5>
      <p>{c.powers.map(p => p.name).filter(Boolean).join(', ')}</p>
    </>}
  </aside>;
}
