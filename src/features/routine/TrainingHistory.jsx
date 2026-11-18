import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { loadRuns, spendProgress } from '../../lib/engine.js';
import { loadAttempts, REQUEST_STATUS } from '../../lib/requests.js';
import { ACT, ACTIVITY_LABEL, REST_MAX_HOURS, SKILL_TRAIN_MAX_HOURS } from '../../rpg/activities.js';
import { meditationSessionsPerDay, spellTrainingHoursPerDay } from '../../rpg/tiers.js';
import { buildRecords, summarize, todayStatus, meditationSessions, groupPools } from '../../rpg/history.js';
import { evolutionCost, MODALITY_LABEL } from '../../rpg/progression.js';
import { readDie, describeDie, stepUp } from '../../rpg/dice.js';
import { astuciaDice, attemptDifficulty, MAX_IMPROVEMENTS } from '../../rpg/magicStudy.js';
import { tickToParts, formatDay } from '../../rpg/clock.js';
import { fmt, signed } from '../../rpg/describe.js';
import './routine.css';

const PAGE = 12;
const KIND_LABEL = { skill: 'Perícia', attribute: 'Atributo', spell: 'Feitiço' };
const hh = h => `${String(h).padStart(2, '0')}:00`;

function when(rec) {
  const a = tickToParts(rec.startTick), b = tickToParts(rec.endTick);
  return { date: formatDay(a.dayNo), time: `${hh(a.hour)}–${hh(b.hour)}` };
}

function Stat({ label, value, hint }) {
  return <div className="th-stat"><b>{value}</b><span>{label}</span>{hint && <small>{hint}</small>}</div>;
}

// "Ver Meus Treinamentos": o que o personagem está treinando, quanto já treinou, quanta XP ganhou e o que pode evoluir.
// Registros já processados são só leitura (nem o jogador nem o mestre editam o que já foi processado).
export default function TrainingHistory({ tableId, characterId, owner, closed, stats, character, tick, progress, training, spellProgress, requests, onGo, refresh }) {
  const [runs, setRuns] = useState(null);
  const [attempts, setAttempts] = useState(null);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  const reload = useCallback(async () => {
    const [r, a] = await Promise.all([loadRuns(tableId, characterId), loadAttempts(tableId, characterId)]);
    setRuns(r || []);
    setAttempts(a || []);
  }, [tableId, characterId]);
  useEffect(() => { setRuns(null); reload().catch(() => setRuns([])); }, [reload, tick]);
  useEffect(() => { setPage(0); setOpen(null); }, [filter, characterId]);

  const spellName = id => stats.spells.find(s => s.id === id)?.name || 'feitiço';
  const jobName = id => (requests || []).find(r => r.id === id)?.config?.name || 'trabalho';
  const records = useMemo(() => (runs ? buildRecords(runs, { spell: spellName, job: jobName }) : []), [runs, stats.spells, requests]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = useMemo(() => summarize({ runs: runs || [], progress, training, spellProgress }), [runs, progress, training, spellProgress]);
  const dayNo = tick == null ? 0 : tickToParts(tick).dayNo;
  const limits = { restMax: REST_MAX_HOURS, trainMax: SKILL_TRAIN_MAX_HOURS, spellMax: spellTrainingHoursPerDay(stats.conjurar), sessions: meditationSessionsPerDay(stats.spirit) };
  const today = useMemo(() => todayStatus({ training, dayNo, runs: runs || [], limits }), [training, dayNo, runs]); // eslint-disable-line react-hooks/exhaustive-deps
  const sessions = useMemo(() => meditationSessions(runs || []), [runs]);
  const pools = useMemo(() => groupPools(progress), [progress]);
  const dice = astuciaDice(training?.study_hours || 0, training?.astucia_dice_spent || 0);
  const mine = (requests || []).filter(r => r.character_id === characterId);
  const waiting = mine.filter(r => r.status === 'pending' || r.status === 'changes');
  const shown = records.filter(r => filter === 'all' || r.activity === filter);
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE));
  const slice = shown.slice(page * PAGE, page * PAGE + PAGE);

  const evolve = async (g, modality) => {
    const die = readDie(character, g.kind, g.name);
    if (!window.confirm(`Evoluir ${g.name} de ${describeDie(die)} usando ${evolutionCost(die)} XP do acumulador ${MODALITY_LABEL[modality]}? Isso não pode ser desfeito.`)) return;
    setBusy(`${g.kind}${g.name}${modality}`); setMessage('');
    try {
      const r = await spendProgress(tableId, characterId, g.kind, g.name, modality);
      setMessage(`Evolução de ${g.name} confirmada (−${fmt(r.cost)} XP). Ela é aplicada na sua ficha em instantes.`);
      await refresh?.();
    } catch (e) { setMessage(e.message); } finally { setBusy(''); }
  };

  return <div className="th">
    <section aria-label="Indicadores" className="th-stats">
      <Stat label="Horas treinadas" value={fmt(sum.trainedHours)} hint="perícias e feitiços" />
      <Stat label="XP recebida" value={fmt(sum.xpReceived)} hint="total conquistado" />
      <Stat label="Perícias treinadas" value={sum.skillsTrained} />
      <Stat label="Feitiços treinados" value={sum.spellsTrained} />
      <Stat label="Horas de Estudo Mágico" value={fmt(sum.studyHours)} />
      <Stat label="Melhorias de feitiços" value={sum.improvements} />
      <Stat label="Horas de trabalho" value={fmt(sum.workHours)} hint={`${sum.jobsDone} trabalho(s)`} />
      <Stat label="Horas de descanso" value={fmt(sum.restHours)} />
      <Stat label="Sessões de meditação usadas" value={sum.meditationSessions} />
    </section>

    {message && <p role="status" className="callout th-msg">{message}</p>}

    <section className="th-grid">
      <article className="th-card" aria-label="Hoje">
        <h4>Hoje · {tick == null ? '' : formatDay(dayNo)}</h4>
        <ul className="th-list">
          <li><b>Descanso:</b> {today.streakText}. Hoje: {fmt(today.restHours)} h de {REST_MAX_HOURS}, {fmt(today.restRecovered)} de estamina recuperada; sobram {fmt(today.restLeft)} h.</li>
          <li><b>Treino de perícia:</b> sobram {fmt(today.trainLeft)} h hoje. <b>Treino de feitiço:</b> sobram {fmt(today.spellLeft)} h.</li>
          <li><b>Meditação:</b> {today.meditationUsed} de {today.meditationMax} sessão(ões) usada(s){today.meditationActive ? ' (uma em andamento)' : ''}; {today.meditationLeft} disponível(is). As sessões renovam quando a mesa avança para um novo dia.</li>
        </ul>
      </article>

      <article className="th-card" aria-label="Aguardando aprovação">
        <h4>Aguardando aprovação</h4>
        {!waiting.length ? <p className="muted">Nada esperando o mestre.</p> : <ul className="th-list">
          {waiting.map(r => <li key={r.id}><b>{r.kind === 'work' ? (r.title || 'Trabalho') : `Melhoria: ${spellName(r.spell_id)}`}</b> · {REQUEST_STATUS[r.status]}{r.gm_note ? ` — "${r.gm_note}"` : ''}</li>)}
        </ul>}
        <button type="button" className="outline" onClick={() => onGo('requests')}>{owner ? 'Enviar sugestão ao mestre / visualizar aprovação' : 'Ver solicitações'}</button>
      </article>

      <article className="th-card" aria-label="Estudo Mágico">
        <h4>Estudo Mágico</h4>
        <p><b>Dados de Astúcia:</b> {dice.available} disponíveis ({dice.earned} ganhos, {dice.spent} gastos){dice.earned < 24 ? ` · próximo em ${fmt(dice.hoursToNext)} h de estudo` : ' · máximo de 24'}</p>
        {stats.spells.map(s => {
          const sp = spellProgress?.[s.id] || { pity: 0, improvements: 0 };
          const d = attemptDifficulty(sp.improvements, sp.pity);
          return <p key={s.id} className="th-spell"><b>{s.name || 'Sem nome'}</b> — melhorias {sp.improvements}/{MAX_IMPROVEMENTS} · Pity {sp.pity}/5{d ? ` · próxima dificuldade ${fmt(d.effective)}` : ''}</p>;
        })}
        {!stats.spells.length && <p className="muted">Este personagem não tem feitiços na ficha.</p>}
        <button type="button" className="outline" onClick={() => onGo('requests')}>{owner ? 'Tentar aprimorar feitiço' : 'Ver melhorias'}</button>
        {attempts?.length > 0 && <details><summary>Tentativas e rolagens ({attempts.length})</summary>
          <ul className="th-list">{attempts.map(a => <li key={a.id}><b>{spellName(a.spell_id)} · melhoria {a.improvement_no}:</b> {a.success ? 'sucesso' : 'falha'} — {a.total} contra {fmt(a.required_effective)} (Pity {a.pity_before}→{a.pity_after}).
            <details><summary>Ver rolagens</summary><span className="rq-rolls">16d{a.die}{a.bonus ? `+${a.bonus}` : ''}: {a.rolls.join(', ')}</span></details></li>)}</ul>
        </details>}
      </article>
    </section>

    <section aria-label="Progresso por alvo">
      <h4>Progresso e evolução</h4>
      <p className="muted th-hint">Cada alvo tem dois acumuladores independentes (Normal e Focado), cada um com teto de 5.000 de XP disponível. O total conquistado nunca diminui quando você gasta XP.</p>
      {!pools.length ? <p className="muted">Ainda não há XP de treino. Ela aparece depois que o mestre avançar o tempo com treinos na rotina.</p> : <div className="th-pools">
        {pools.map(g => {
          const evolvable = g.kind !== 'spell';
          const die = evolvable ? readDie(character, g.kind, g.name) : null;
          const cost = die ? evolutionCost(die) : 0;
          return <article key={`${g.kind}${g.name}`} className="th-pool">
            <h5>{g.kind === 'spell' ? spellName(g.name) : g.name} <small>{KIND_LABEL[g.kind]}{die ? ` · ${describeDie(die)}` : ''}</small></h5>
            <table className="th-xp"><thead><tr><th /><th>Disponível</th><th>Total conquistada</th><th>Gasta</th></tr></thead>
              <tbody>{['normal', 'focused'].map(m => {
                const p = g[m];
                return <tr key={m}><th scope="row">{MODALITY_LABEL[m]}</th>
                  <td>{p ? `${fmt(p.available)} / ${fmt(p.cap || 5000)}` : '—'}</td><td>{p ? fmt(p.earned_total) : '—'}</td><td>{p ? fmt(p.spent_total) : '—'}</td></tr>;
              })}</tbody></table>
            {evolvable ? <div className="th-evolve">
              <span className="muted">Próxima evolução: {describeDie(stepUp(die))} · custa {cost} XP</span>
              {['normal', 'focused'].map(m => {
                const can = owner && !closed && g[m] && g[m].available >= cost;
                return <button key={m} type="button" className={can ? 'primary' : 'outline'} disabled={!can || Boolean(busy)} title={owner ? (g[m] ? `Disponível: ${fmt(g[m].available)}` : 'Sem XP neste acumulador') : 'Só o dono da ficha evolui'}
                  onClick={() => evolve(g, m)}>{busy === `${g.kind}${g.name}${m}` ? 'Evoluindo…' : `Evoluir (${MODALITY_LABEL[m]})`}</button>;
              })}
            </div> : <p className="muted th-hint">A XP de feitiço só acumula por enquanto; o que ela compra ainda não foi definido.</p>}
          </article>;
        })}
      </div>}
    </section>

    <section aria-label="Meditação">
      <h4>Histórico de meditações</h4>
      {!sessions.length ? <p className="muted">Nenhuma sessão de meditação ainda.</p> : <ul className="th-list">
        {sessions.slice(0, 10).map(s => <li key={s.startTick}>{formatDay(tickToParts(s.startTick).dayNo)}, {hh(tickToParts(s.startTick).hour)} · {s.hours} h · rolagem d{s.sides}: {s.face} → {fmt(s.roll)} ({fmt(s.rate)} de mana/h){s.closed ? '' : ' · em andamento'}</li>)}
      </ul>}
    </section>

    <section aria-label="Registros de treinamento">
      <h4>Registros ({shown.length})</h4>
      <div className="th-filters">
        <label className="field"><span>Atividade</span>
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">Todas</option>
            {Object.values(ACT).map(a => <option key={a} value={a}>{ACTIVITY_LABEL[a]}</option>)}
          </select></label>
      </div>
      {runs === null ? <p className="muted">Carregando…</p> : !shown.length ? <p className="muted">Nenhum registro ainda. Os registros aparecem quando o mestre avança o tempo.</p> : <>
        <div className="th-scroll">
          <table className="th-table">
            <thead><tr><th>Atividade</th><th>Data</th><th>Duração</th><th>Recursos</th><th>XP recebida</th><th>XP disponível</th><th>XP total</th><th>Resultado</th><th /></tr></thead>
            <tbody>{slice.map(rec => {
              const w = when(rec);
              const xpMain = rec.xp;
              const resources = [rec.staminaSpent ? `−${fmt(rec.staminaSpent)} est.` : '', rec.manaSpent ? `−${fmt(rec.manaSpent)} mana` : '', rec.staminaGained ? `+${fmt(rec.staminaGained)} est.` : '', rec.manaGained ? `+${fmt(rec.manaGained)} mana` : ''].filter(Boolean).join(' · ');
              return <React.Fragment key={rec.id + rec.activity}>
                <tr className={rec.failedHours ? 'partial' : ''}>
                  <td data-label="Atividade"><b>{ACTIVITY_LABEL[rec.activity]}</b>{rec.targetLabel ? ` · ${rec.targetLabel}` : ''}{rec.mode ? ` · ${MODALITY_LABEL[rec.mode]}` : ''}</td>
                  <td data-label="Data">{w.date}<br /><small>{w.time}</small></td>
                  <td data-label="Duração">{rec.hours} h</td>
                  <td data-label="Recursos">{resources || '—'}{rec.pay ? ` · +$${fmt(rec.pay)}` : ''}</td>
                  <td data-label="XP recebida">{xpMain.length ? xpMain.map(x => <div key={x.kind + x.name + x.modality}>+{fmt(x.amount)} {x.kind === 'spell' ? spellName(x.name) : x.name}</div>) : rec.studyHours ? `${rec.studyHours} h de estudo` : '—'}</td>
                  <td data-label="XP disponível">{xpMain.length ? xpMain.map(x => <div key={x.kind + x.name + x.modality}>{fmt(x.availableAfter)}</div>) : '—'}</td>
                  <td data-label="XP total">{xpMain.length ? xpMain.map(x => <div key={x.kind + x.name + x.modality}>{fmt(x.earnedAfter)}</div>) : '—'}</td>
                  <td data-label="Resultado">{rec.resultText}</td>
                  <td><button type="button" className="text-button" aria-expanded={open === rec.id} onClick={() => setOpen(o => (o === rec.id ? null : rec.id))}>{open === rec.id ? 'Fechar' : 'Ver detalhes'}</button></td>
                </tr>
                {open === rec.id && <tr className="th-detail"><td colSpan={9}>
                  <p className="muted">Rotina: {rec.routine || '—'}</p>
                  {rec.reasons.length > 0 && <p className="callout">{rec.reasons.join(' ')}</p>}
                  {rec.rolls.length > 0 && <p><b>Rolagens de Meditar:</b> {rec.rolls.map(r => `d${r.sides}: ${r.face} → ${fmt(r.roll)} (${fmt(r.rate)} mana/h)`).join('; ')}</p>}
                  {rec.maxStreak > 0 && <p><b>Descanso ininterrupto:</b> até {rec.maxStreak} h seguidas, {fmt(rec.restPaid)} de estamina recuperada.</p>}
                  <ul className="th-hours">{rec.events.map(e => <li key={e.tick}>{hh(tickToParts(e.tick).hour)} — {e.ok ? 'ok' : e.reason}{e.stamina_delta ? ` · ${signed(e.stamina_delta)} est.` : ''}{e.mana_delta ? ` · ${signed(e.mana_delta)} mana` : ''}</li>)}</ul>
                </td></tr>}
              </React.Fragment>;
            })}</tbody>
          </table>
        </div>
        {pageCount > 1 && <div className="th-pager">
          <button type="button" className="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Anterior</button>
          <span className="muted">Página {page + 1} de {pageCount}</span>
          <button type="button" className="outline" disabled={page + 1 >= pageCount} onClick={() => setPage(p => p + 1)}>Próxima →</button>
        </div>}
      </>}
    </section>
  </div>;
}
