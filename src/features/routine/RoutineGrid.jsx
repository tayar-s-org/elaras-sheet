import React from 'react';
import { HOURS } from '../../training/routine.js';
import { ACTIVITIES, ACT, fieldsFor, blockedReason, SKILL_TRAIN_MAX_HOURS, REST_MAX_HOURS, QUICK_MAX_HOURS, rowIssue } from '../../rpg/activities.js';
import { meditationSessionsPerDay, spellTrainingHoursPerDay } from '../../rpg/tiers.js';
import { describeDay, describeEvent, fmt, signed, MODALITY_LABEL } from '../../rpg/describe.js';

const KIND_LABEL = { skill: 'perícia', attribute: 'atributo', spell: 'feitiço' };

function Rules({ stats }) {
  return <details className="tr-rules">
    <summary>Regras das atividades</summary>
    <div className="tr-rules-grid">
      <section><h4>Treinar Perícia</h4><p>Estamina por hora acumulada no dia: horas 1–4 custam 1, 5–8 custam 2, 9–12 custam 4 (4h = 4, 8h = 12, 12h = 28). Limite de {SKILL_TRAIN_MAX_HOURS} horas por dia. Cada hora dá +1 XP na perícia e +0,5 no atributo ligado. O <b>Treinamento Focado</b> dobra a estamina e dá o mesmo XP, num acumulador próprio (teto de 5.000, independente do Normal).</p></section>
      <section><h4>Treinar Feitiço</h4><p>1 de mana por hora (2 no Focado), até {spellTrainingHoursPerDay(stats.conjurar)}h por dia (metade do dado-base de Conjurar). Cada hora dá +1 XP no feitiço, +0,5 em Conjurar e +0,25 em Espírito.</p></section>
      <section><h4>Estudo Mágico</h4><p>Só para feitiços que já passaram pelo treinamento. Sem custo de recursos. Cada 25 horas dão 1 dado de Astúcia (acumulam até 24).</p></section>
      <section><h4>Descanso Completo</h4><p>Precisa ser ininterrupto. Nas 3 primeiras horas não recupera; ao completar a 4ª recupera 6 (retroativo) e depois 1,5 por hora, até {REST_MAX_HOURS}h por dia. Se interromper, a sequência recomeça do zero.</p></section>
      <section><h4>Descanso Rápido</h4><p>Exige estar alimentado. Recupera 2 de estamina por hora, até {QUICK_MAX_HOURS} horas por dia.</p></section>
      <section><h4>Meditar</h4><p>Recupera 1 / (4 − x/4) de mana por hora, onde x é a rolagem de Meditar da sessão (máx. 12). Este personagem tem {meditationSessionsPerDay(stats.spirit)} sessão(ões) por dia; uma sessão conta como usada quando termina e não pode ser retomada. Aqui a prévia usa o valor médio do dado.</p></section>
    </div>
  </details>;
}

// Cabeçalho, resumo e tabela horária da rotina. Os campos de cada atividade aparecem só quando ela é escolhida.
export default function RoutineGrid({ data, sim, stats, canEdit, onEdit, onRow }) {
  const skillOptions = stats.skills;
  const label = (kind, id) => (kind === 'spell' ? stats.spells.find(s => s.id === id)?.name : id) || '';
  return <>
    <div className="tr-head">
      <label className="field"><span>Descrição do período</span>
        <input value={data.period} maxLength={60} disabled={!canEdit} placeholder="Ex.: Semana de estudos" onChange={e => onEdit({ period: e.target.value })} /></label>
      <label className="field"><span>Local</span>
        <input value={data.place} maxLength={100} disabled={!canEdit} onChange={e => onEdit({ place: e.target.value })} /></label>
      <label className="field"><span>Estamina inicial da prévia (máx. {fmt(stats.maxStamina)})</span>
        <input type="number" min="0" max={stats.maxStamina} disabled={!canEdit} value={data.startStamina ?? stats.maxStamina} onChange={e => onEdit({ startStamina: e.target.value === '' ? null : Number(e.target.value) })} /></label>
      <label className="field"><span>Mana inicial da prévia (máx. {fmt(stats.maxMana)})</span>
        <input type="number" min="0" max={stats.maxMana} disabled={!canEdit} value={data.startMana ?? stats.maxMana} onChange={e => onEdit({ startMana: e.target.value === '' ? null : Number(e.target.value) })} /></label>
      <label className="check tr-fed"><input type="checkbox" checked={data.fed} disabled={!canEdit} onChange={e => onEdit({ fed: e.target.checked })} /> Alimentado (necessário para o Descanso Rápido recuperar)</label>
    </div>

    <div className="tr-summary">
      <span className="mk-chip">Estamina no fim <b>{fmt(sim.endStamina)} / {fmt(stats.maxStamina)}</b></span>
      <span className="mk-chip">Mana no fim <b>{fmt(sim.endMana)} / {fmt(stats.maxMana)}</b></span>
      <span className="mk-chip">Estamina do dia <b>{signed(sim.totalStamina)}</b></span>
      <span className="mk-chip">Mana do dia <b>{signed(sim.totalMana)}</b></span>
      {sim.xp.map(x => <span key={`${x.kind}${x.name}${x.modality}`} className="mk-chip">XP {label(x.kind, x.name)} ({KIND_LABEL[x.kind]}, {MODALITY_LABEL[x.modality].toLowerCase()}) <b>+{fmt(x.amount)}</b></span>)}
    </div>
    {sim.warnings.length > 0 && <ul className="tr-warnings">{sim.warnings.map((w, i) => <li key={i}>{HOURS[w.slot]}: {w.text}</li>)}</ul>}
    <p className="muted tr-day-note">{describeDay()}</p>

    <div className="tr-scroll">
      <table className="tr-table">
        <thead><tr><th>Hora</th><th>Estamina</th><th>Mana</th><th>Atividade</th><th>Efeito</th><th>Custo / ganho</th></tr></thead>
        <tbody>
          {sim.rows.map((e, i) => {
            const row = data.rows[i];
            const issue = row.a ? rowIssue(row, stats) : '';
            const fields = fieldsFor(row.a);
            return <tr key={HOURS[i]} className={`${row.a ? 'on' : ''}${e.ok ? '' : ' blocked'}${issue ? ' incomplete' : ''}`}>
              <th scope="row" data-label="Hora">{HOURS[i]}</th>
              <td className="tr-estm" data-label="Estamina">{fmt(e.staminaAfter)}</td>
              <td data-label="Mana">{fmt(e.manaAfter)}</td>
              <td className="tr-act" data-label="Atividade">
                {canEdit ? <div className="tr-act-row">
                  <select aria-label={`Atividade às ${HOURS[i]}`} value={row.a} onChange={e2 => onRow(i, { a: e2.target.value })}>
                    {ACTIVITIES.map(a => <option key={a.id} value={a.id} disabled={a.id !== row.a && Boolean(blockedReason(a.id, e.staminaBefore, e.manaBefore))}>{a.label}</option>)}
                  </select>
                  {fields.includes('skill') && <select aria-label={`Perícia às ${HOURS[i]}`} value={row.skill} onChange={e2 => onRow(i, { skill: e2.target.value })}>
                    <option value="">Escolha a perícia…</option>{skillOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>}
                  {fields.includes('spell') && <select aria-label={`Feitiço às ${HOURS[i]}`} value={row.spell} onChange={e2 => onRow(i, { spell: e2.target.value })}>
                    <option value="">Escolha o feitiço…</option>
                    {(row.a === ACT.STUDY ? stats.spells.filter(s => stats.trainedSpells.includes(s.id)) : stats.spells).map(s => <option key={s.id} value={s.id}>{s.name || 'Sem nome'}</option>)}
                  </select>}
                  {fields.includes('mode') && <select aria-label={`Complexidade do treinamento às ${HOURS[i]}`} value={row.mode} onChange={e2 => onRow(i, { mode: e2.target.value })}>
                    <option value="normal">Treinamento Normal</option><option value="focused">Treinamento Focado (custo dobrado)</option>
                  </select>}
                  <input aria-label={`Observação às ${HOURS[i]}`} value={row.n} maxLength={200} placeholder="Observação" onChange={e2 => onRow(i, { n: e2.target.value })} />
                </div> : <>
                  <b>{ACTIVITIES.find(a => a.id === row.a)?.label}</b>
                  {row.a === ACT.SKILL && row.skill && <span> · {row.skill}</span>}
                  {(row.a === ACT.SPELL || row.a === ACT.STUDY) && row.spell && <span> · {label('spell', row.spell)}</span>}
                  {(row.a === ACT.SKILL || row.a === ACT.SPELL) && row.mode === 'focused' && <span> · Focado</span>}
                  {row.n && <span> {row.n}</span>}
                </>}
                {issue && <small className="tr-issue">{canEdit ? `Falta: ${issue}` : issue}</small>}
              </td>
              <td className="tr-effect" data-label="Efeito" title={describeEvent(e, stats)}>{describeEvent(e, stats)}</td>
              <td data-label="Custo / ganho" className="tr-delta">
                <span className={e.staminaDelta < 0 ? 'neg' : e.staminaDelta > 0 ? 'pos' : ''}>{e.staminaDelta ? `${signed(e.staminaDelta)} est.` : ''}</span>{' '}
                <span className={e.manaDelta < 0 ? 'neg' : e.manaDelta > 0 ? 'pos' : ''}>{e.manaDelta ? `${signed(e.manaDelta)} mana` : ''}</span>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    <Rules stats={stats} />
  </>;
}
