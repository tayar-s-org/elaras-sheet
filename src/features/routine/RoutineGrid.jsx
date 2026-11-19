import React from 'react';
import RoutineBoard from './RoutineBoard.jsx';
import { HOURS } from '../../training/routine.js';
import { SKILL_TRAIN_MAX_HOURS, REST_MAX_HOURS, QUICK_MAX_HOURS } from '../../rpg/activities.js';
import { meditationSessionsPerDay, spellTrainingHoursPerDay } from '../../rpg/tiers.js';
import { describeDay, fmt, signed, MODALITY_LABEL } from '../../rpg/describe.js';

const KIND_LABEL = { skill: 'perícia', attribute: 'atributo', spell: 'feitiço' };

function Rules({ stats }) {
  return <details className="tr-rules">
    <summary>Regras das atividades</summary>
    <div className="tr-rules-grid">
      <section><h4>Treinar Perícia</h4><p>Estamina por hora acumulada no dia: horas 1–4 custam 1, 5–8 custam 2, 9–12 custam 4 (4h = 4, 8h = 12, 12h = 28). Limite de {SKILL_TRAIN_MAX_HOURS} horas por dia. Cada hora dá +1 XP na perícia e +0,5 no atributo ligado. O <b>Treinamento Focado</b> dobra a estamina e dá o mesmo XP, num acumulador próprio (teto de 5.000, independente do Normal).</p></section>
      <section><h4>Treinar Feitiço</h4><p>1 de mana por hora (2 no Focado), até {spellTrainingHoursPerDay(stats.conjurar)}h por dia (metade do dado-base de Conjurar). Cada hora dá +1 XP no feitiço, +0,5 em Conjurar e +0,25 em Espírito.</p></section>
      <section><h4>Estudo Mágico</h4><p>Só para feitiços que já passaram pelo treinamento. Sem custo de recursos. Cada 25 horas dão 1 dado de Astúcia (acumulam até 24).</p></section>
      <section><h4>Trabalhar</h4><p>O mestre aprova e configura cada trabalho: custo de estamina e mana por faixa de horas (1–4, 5–8, 9–12), pagamento e XP por hora. Só dá para escolher trabalhos já aprovados para este personagem. Limite de 12 horas por dia.</p></section>
      <section><h4>Descanso Completo</h4><p>Precisa ser ininterrupto. Nas 3 primeiras horas não recupera; ao completar a 4ª recupera 6 (retroativo) e depois 1,5 por hora, até {REST_MAX_HOURS}h por dia. Se interromper, a sequência recomeça do zero.</p></section>
      <section><h4>Descanso Rápido</h4><p>Exige estar alimentado. Recupera 2 de estamina por hora, até {QUICK_MAX_HOURS} horas por dia.</p></section>
      <section><h4>Meditar</h4><p>Recupera 1 / (4 − x/4) de mana por hora, onde x é a rolagem de Meditar da sessão (máx. 12). Este personagem tem {meditationSessionsPerDay(stats.spirit)} sessão(ões) por dia; uma sessão conta como usada quando termina e não pode ser retomada. Cada hora meditada dá +1 XP em Meditar e +0,5 em Espírito. Aqui a prévia usa o valor médio do dado.</p></section>
    </div>
  </details>;
}

// Cabeçalho, resumo e tabela horária da rotina. Os campos de cada atividade aparecem só quando ela é escolhida.
export default function RoutineGrid({ data, sim, stats, canEdit, onEdit, onRow, onClearAll, storageKey }) {
  const skillOptions = stats.skills;
  const label = (kind, id) => (kind === 'spell' ? stats.spells.find(s => s.id === id)?.name : id) || '';
  return <>
    <div className="tr-head">
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

    <RoutineBoard data={data} sim={sim} stats={stats} canEdit={canEdit} storageKey={storageKey} onRow={onRow} onClearAll={onClearAll} />
    <Rules stats={stats} />
  </>;
}
