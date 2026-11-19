import React from 'react';
import { attemptDifficulty, ATTEMPT_DICE, MAX_IMPROVEMENTS, MAX_PITY } from '../../rpg/magicStudy.js';
import { fmt } from '../../rpg/describe.js';
import './studyCard.css';

const MAX_DICE = 24;

// Estudo Mágico: dados de Astúcia (ganhos com horas de estudo), melhorias e Pity de cada feitiço e o botão de tentar aprimorar.
// A tentativa gasta 16 dados de Astúcia, por isso o botão só libera quando há 16 ou mais disponíveis.
export default function StudyCard({ dice, studyHours, stats, spellProgress, attempts, spellName, owner, onGo }) {
  const ready = dice.available >= ATTEMPT_DICE;
  const missing = Math.max(0, ATTEMPT_DICE - dice.available);
  const nextPct = dice.earned >= MAX_DICE ? 100 : Math.round(((Number(studyHours) || 0) % 25) / 25 * 100);
  return <article className="th-card ms-card" aria-label="Estudo Mágico">
    <header className="ms-head">
      <h4>Estudo Mágico</h4>
      <span className={`ms-badge${ready ? ' ok' : ''}`}>{ready ? 'Pode tentar aprimorar' : `Faltam ${missing} dados de Astúcia`}</span>
    </header>

    <div className="ms-dice" aria-label="Dados de Astúcia">
      <div className="ms-dice-top">
        <span><b>{dice.available}</b> dado{dice.available === 1 ? '' : 's'} de Astúcia disponíve{dice.available === 1 ? 'l' : 'is'}</span>
        <small>{dice.earned} ganhos · {dice.spent} gastos · cada tentativa usa {ATTEMPT_DICE}</small>
      </div>
      <div className="ms-pips" role="img" aria-label={`${dice.available} disponíveis de ${MAX_DICE}`}>
        {Array.from({ length: MAX_DICE }, (_, i) => <i key={i} className={i < dice.spent ? 'spent' : i < dice.earned ? 'have' : ''} />)}
      </div>
      <div className="ms-next">
        <div className="ms-bar" aria-hidden="true"><i style={{ width: `${nextPct}%` }} /></div>
        <small>{dice.earned >= MAX_DICE ? 'Máximo de 24 dados ganhos' : `Próximo dado em ${fmt(dice.hoursToNext)} h de estudo`}</small>
      </div>
    </div>

    {!stats.spells.length ? <p className="muted">Este personagem não tem feitiços na ficha.</p> : <ul className="ms-spells">
      {stats.spells.map(s => {
        const sp = spellProgress?.[s.id] || { pity: 0, improvements: 0 };
        const d = attemptDifficulty(sp.improvements, sp.pity);
        return <li key={s.id} className="ms-spell">
          <div className="ms-spell-name"><b>{s.name || 'Sem nome'}</b>{!d && <span className="ms-badge max">Máximo</span>}</div>
          <div className="ms-row"><span>Melhorias</span>
            <span className="ms-seg" role="img" aria-label={`${sp.improvements} de ${MAX_IMPROVEMENTS}`}>{Array.from({ length: MAX_IMPROVEMENTS }, (_, i) => <i key={i} className={i < sp.improvements ? 'on' : ''} />)}</span>
            <small>{sp.improvements}/{MAX_IMPROVEMENTS}</small></div>
          <div className="ms-row"><span>Pity</span>
            <span className="ms-seg pity" role="img" aria-label={`${sp.pity} de ${MAX_PITY}`}>{Array.from({ length: MAX_PITY }, (_, i) => <i key={i} className={i < sp.pity ? 'on' : ''} />)}</span>
            <small>{sp.pity}/{MAX_PITY}</small></div>
          {d && <p className="ms-diff">Próxima dificuldade <b>{fmt(d.effective)}</b>{d.pity ? <small> (tabela {d.base})</small> : null}</p>}
        </li>;
      })}
    </ul>}

    <div className="ms-actions">
      <button type="button" className={ready ? 'primary' : 'outline'} disabled={owner && !ready}
        title={owner && !ready ? `São necessários ${ATTEMPT_DICE} dados de Astúcia (você tem ${dice.available})` : ''}
        onClick={() => onGo('requests')}>{owner ? 'Tentar aprimorar feitiço' : 'Ver melhorias'}</button>
      {owner && !ready && <span className="muted">Precisa de {ATTEMPT_DICE} dados de Astúcia disponíveis (você tem {dice.available}).</span>}
    </div>

    {attempts?.length > 0 && <details className="ms-history"><summary>Tentativas e rolagens ({attempts.length})</summary>
      <ul className="th-list">{attempts.map(a => <li key={a.id}><b>{spellName(a.spell_id)} · melhoria {a.improvement_no}:</b> <span className={a.success ? 'ms-ok' : 'ms-fail'}>{a.success ? 'sucesso' : 'falha'}</span> — {a.total} contra {fmt(a.required_effective)} (Pity {a.pity_before}→{a.pity_after}).
        <details><summary>Ver rolagens</summary><span className="rq-rolls">{ATTEMPT_DICE}d{a.die}{a.bonus ? `+${a.bonus}` : ''}: {a.rolls.join(', ')}</span></details></li>)}</ul>
    </details>}
  </article>;
}
