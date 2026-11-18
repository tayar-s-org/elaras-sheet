import React, { useState } from 'react';
import { incapacitation, effectLines, causeLine, stageLabel, effectiveMovement } from '../../incapacitation.js';
import './incap.css';

// Estado de incapacitação do personagem: soma de Vida e Stamina, efeitos e, no estágio 4, o prazo para desmaiar.
// O mestre define as horas (X) e marca o desmaio; para os demais o painel é só informativo.
export default function IncapPanel({ state, max, baseMovement, isGm, closed, onFaint, compact }) {
  const inc = incapacitation(state, max);
  const [text, setText] = useState('');
  const hours = Number(text);
  const validHours = Number.isFinite(hours) && hours > 0 && hours <= 999;
  const tone = Math.min(3, inc.stage);
  const effects = effectLines(inc);
  const atFour = inc.total === 4;
  const movement = Number.isFinite(baseMovement) && inc.movePenalty > 0
    ? `Movimento ${baseMovement} → ${effectiveMovement(baseMovement, inc.movePenalty)}` : null;

  return <section className={`incap incap-s${inc.stage}${compact ? ' compact' : ''}`} aria-label="Incapacitação">
    <div className="incap-head">
      <strong>Incapacitação</strong>
      <span className={`chip l${tone}`}>{stageLabel(inc)}</span>
    </div>
    {inc.total > 0 && <p className="incap-cause">{causeLine(inc)}</p>}
    {effects.length > 0 && <ul className="incap-effects">{effects.map(e => <li key={e}>{e}</li>)}</ul>}
    {movement && <p className="incap-move">{movement}</p>}
    {inc.total === 0 && <p className="incap-ok">Vida e Stamina acima da metade: sem penalidades.</p>}

    {atFour && !inc.fainted && <div className="incap-faint">
      <p>{inc.faintHours
        ? <>Desmaia (Incapacitação 5) se passar <b>{inc.faintHours} h</b> neste estado.</>
        : 'Desmaia (Incapacitação 5) se passar muitas horas neste estado. O mestre define o prazo.'}</p>
      {isGm && !closed && <div className="incap-controls">
        <label><span>Horas até desmaiar</span>
          <input type="number" min="1" max="999" inputMode="numeric" placeholder={inc.faintHours ? String(inc.faintHours) : 'X'} value={text}
            onChange={e => setText(e.target.value)} onFocus={e => e.target.select()} /></label>
        <button type="button" className="outline" disabled={!validHours}
          onClick={() => { onFaint({ hours, fainted: false }); setText(''); }}>Definir prazo</button>
        <button type="button" className="outline danger" onClick={() => onFaint({ hours: inc.faintHours, fainted: true })}>Marcar como desmaiado</button>
      </div>}
    </div>}
    {inc.fainted && <div className="incap-faint">
      <p><b>Desmaiado.</b> Não pode rolar atributos nem perícias até ser reanimado.</p>
      {isGm && !closed && <div className="incap-controls">
        <button type="button" className="outline" onClick={() => onFaint({ hours: inc.faintHours, fainted: false })}>Reanimar</button>
      </div>}
    </div>}
  </section>;
}
