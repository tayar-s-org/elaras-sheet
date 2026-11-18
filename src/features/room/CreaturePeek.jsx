import React, { useState } from 'react';
import { creatureOf, hpTone, hpLabel } from '../../creature.js';
import './master.css';

// Painel ao clicar numa criatura: barra de vida para todos; o mestre vê os números e ajusta a vida com − e +.
export default function CreaturePeek({ token, isGm, onAdjust, onClose }) {
  const c = creatureOf(token);
  const [text, setText] = useState('1');
  if (!c) return null;
  const amount = Math.max(1, Math.min(9999, Math.trunc(Number(text)) || 1));
  const tone = hpTone(c.ratio);
  return <aside className="sheet-peek creature-peek" aria-label={`Criatura ${token.name || ''}`}>
    <button type="button" className="peek-close" aria-label="Fechar painel da criatura" onClick={onClose}>×</button>
    <h4>{token.name || 'Criatura'}</h4>
    <p className="muted">Criatura{token.hidden ? ' · oculta dos jogadores' : ''}</p>
    <div className="creature-hp">
      <div className="creature-hp-head">
        <span>Vida</span>
        {isGm ? <strong>{c.hp}<small>/{c.maxHp}</small></strong> : <strong className={`hp-word ${tone}`}>{hpLabel(c.ratio)}</strong>}
      </div>
      <div className="res-bar" role="progressbar" aria-label="Vida da criatura" aria-valuemin={0} aria-valuemax={isGm ? c.maxHp : 100}
        aria-valuenow={isGm ? c.hp : Math.round(c.ratio * 100)}><i className={`hp-${tone}`} style={{ width: `${c.ratio * 100}%` }} /></div>
    </div>
    {isGm && <div className="creature-controls">
      <button type="button" className="outline" aria-label={`Tirar ${amount} de vida`} disabled={c.hp <= 0} onClick={() => onAdjust(-amount)}>−</button>
      <label><span className="sr-only">Quantidade de vida</span>
        <input type="number" min="1" max="9999" inputMode="numeric" value={text} onChange={e => setText(e.target.value)}
          onBlur={() => setText(String(amount))} onFocus={e => e.target.select()} /></label>
      <button type="button" className="outline" aria-label={`Dar ${amount} de vida`} disabled={c.hp >= c.maxHp} onClick={() => onAdjust(amount)}>+</button>
    </div>}
  </aside>;
}
