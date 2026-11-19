import React, { useState } from 'react';
import { creatureOf, hpTone, hpLabel, hpVisible } from '../../creature.js';
import { displayName, isNameHidden, effectsOf } from '../../tokenState.js';
import EffectEditor from '../token/EffectEditor.jsx';
import './master.css';

// Painel ao clicar numa criatura: barra de vida para todos; o mestre vê os números e ajusta a vida com − e +.
// Nome oculto: jogadores veem "?"; o mestre vê o nome real e liga/desliga a opção. Efeitos: todos veem, o mestre adiciona e remove.
export default function CreaturePeek({ token, isGm, onAdjust, onRemove, onClose, onDuplicate, onToggleName, onAddEffect, onRemoveEffect, busy, children }) {
  const c = creatureOf(token);
  const [text, setText] = useState('1');
  if (!c) return null;
  const amount = Math.max(1, Math.min(9999, Math.trunc(Number(text)) || 1));
  const tone = hpTone(c.ratio);
  const shownName = displayName(token, isGm, 'Criatura');
  const nameHidden = isNameHidden(token);
  const effects = effectsOf(token);
  return <aside className="sheet-peek creature-peek" aria-label={`Criatura ${shownName}`}>
    <button type="button" className="peek-close" aria-label="Fechar painel da criatura" onClick={onClose}>×</button>
    <h4>{shownName}</h4>
    <p className="muted">Criatura{token.hidden ? ' · oculta dos jogadores' : ''}{isGm && nameHidden ? <span className="name-hidden-note"> · nome oculto dos jogadores</span> : null}</p>
    {c.noHp ? <p className="muted">Sem vida</p> : !hpVisible(c, isGm) ? null : <div className="creature-hp">
      <div className="creature-hp-head">
        <span>Vida{isGm && c.hideHp ? ' · oculta dos jogadores' : ''}</span>
        {isGm ? <strong>{c.hp}<small>/{c.maxHp}</small></strong> : <strong className={`hp-word ${tone}`}>{hpLabel(c.ratio)}</strong>}
      </div>
      <div className="res-bar" role="progressbar" aria-label="Vida da criatura" aria-valuemin={0} aria-valuemax={isGm ? c.maxHp : 100}
        aria-valuenow={isGm ? c.hp : Math.round(c.ratio * 100)}><i className={`hp-${tone}`} style={{ width: `${c.ratio * 100}%` }} /></div>
    </div>}
    {isGm && c.noHp && onRemove && <div className="creature-controls">
      {onDuplicate && <button type="button" className="outline" aria-label={`Duplicar ${shownName}`} title="Duplicar esta criatura" onClick={onDuplicate}>⧉</button>}
      <button type="button" className="outline creature-delete" aria-label={`Apagar o token ${token.name || 'da criatura'}`} title="Apagar este token do tabuleiro" onClick={onRemove}>🗑</button>
    </div>}
    {isGm && !c.noHp && <div className="creature-controls">
      <button type="button" className="outline" aria-label={`Tirar ${amount} de vida`} disabled={c.hp <= 0} onClick={() => onAdjust(-amount)}>−</button>
      <label><span className="sr-only">Quantidade de vida</span>
        <input type="number" min="1" max="9999" inputMode="numeric" value={text} onChange={e => setText(e.target.value)}
          onBlur={() => setText(String(amount))} onFocus={e => e.target.select()} /></label>
      <button type="button" className="outline" aria-label={`Dar ${amount} de vida`} disabled={c.hp >= c.maxHp} onClick={() => onAdjust(amount)}>+</button>
      {onDuplicate && <button type="button" className="outline creature-dup" aria-label={`Duplicar ${shownName}`} title="Duplicar esta criatura" onClick={onDuplicate}>⧉</button>}
      {onRemove && <button type="button" className="outline creature-delete" aria-label={`Apagar o token ${token.name || 'da criatura'}`} title="Apagar este token do tabuleiro" onClick={onRemove}>🗑</button>}
    </div>}
    {children}
    {!isGm && effects.length > 0 && <EffectEditor effects={effects} />}
    {isGm && onToggleName && <details className="creature-flags">
      <summary>Efeitos e visibilidade{effects.length ? ` (${effects.length})` : ''}</summary>
      <label className="check"><input type="checkbox" checked={nameHidden} disabled={busy} onChange={e => onToggleName(e.target.checked)} />
        Ocultar nome e foto dos jogadores (aparece “?”)</label>
      <div>
        <h5 className="creature-section-title">Efeitos</h5>
        <EffectEditor effects={effects} disabled={busy} onAdd={onAddEffect} onRemove={onRemoveEffect} />
      </div>
    </details>}
  </aside>;
}
