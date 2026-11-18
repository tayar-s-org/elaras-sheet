import React from 'react';
import { RESOURCES, level, LEVEL_TEXT, currentValue } from './vitals.js';
import './peek.css';

// Barras de Vida, Stamina e Mana com a faixa (OK / Na metade / Abaixo de 25% / Exaustão), iguais às do token.
// showMana: a mana só aparece para o dono da ficha e para o mestre.
export default function VitalBars({ state, max, showMana = true }) {
  return <div className="peek-vitals">
    {RESOURCES.filter(([k]) => showMana || k !== 'mana').map(([k, label]) => {
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
  </div>;
}
