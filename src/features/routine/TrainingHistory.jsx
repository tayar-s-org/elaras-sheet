import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { loadRuns, spendProgress } from '../../lib/engine.js';
import { loadAttempts } from '../../lib/requests.js';
import { ACT, ACTIVITY_LABEL } from '../../rpg/activities.js';
import { buildRecords, summarize, meditationSessions, lastTrainedTicks } from '../../rpg/history.js';
import StudyCard from './StudyCard.jsx';
import XpSheet from './XpSheet.jsx';
import { evolutionCost, MODALITY_LABEL } from '../../rpg/progression.js';
import { readDie, describeDie } from '../../rpg/dice.js';
import { astuciaDice } from '../../rpg/magicStudy.js';
import { tickToParts, formatDay } from '../../rpg/clock.js';
import { fmt, signed } from '../../rpg/describe.js';
import './routine.css';

const PAGE = 12;
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
export default function TrainingHistory({ tableId, characterId, owner, closed, stats, character, tick, progress, training, spellProgress, requests, allocation, onGo, refresh }) {
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
  const sessions = useMemo(() => meditationSessions(runs || []), [runs]);
  const pools = useMemo(() => progress || [], [progress]);
  const lastTicks = useMemo(() => lastTrainedTicks(runs || []), [runs]);
  const dice = astuciaDice(training?.study_hours || 0, training?.astucia_dice_spent || 0);
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

    <section aria-label="Progresso por alvo">
      <h4>Progresso e evolução</h4>
      <p className="muted th-hint">Planilha de XP: cada característica soma os acumuladores Normal e Focado (cada um com teto de 5.000 de XP disponível). O total adquirido nunca diminui quando você gasta XP. Clique numa linha para ver os acumuladores e evoluir.</p>
      <XpSheet pools={pools} character={character} allocation={allocation} spellName={spellName} lastTicks={lastTicks} owner={owner} closed={closed} busy={busy} onEvolve={evolve} />
    </section>

    <section className="th-grid">
      <StudyCard dice={dice} studyHours={training?.study_hours || 0} stats={stats} spellProgress={spellProgress} attempts={attempts} spellName={spellName} owner={owner} onGo={onGo} />
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
                  <td data-label="XP recebida">{xpMain.length ? xpMain.map(x => <div key={x.kind + x.name + x.modality}>+{fmt(x.amount)} {x.kind === 'spell' ? spellName(x.name) : x.name}{x.bonusPct ? <small title={`Ganho-base ${fmt(x.base)} com +${fmt(x.bonusPct)}% de Aptidão`}> (Aptidão +{fmt(x.bonusPct)}%)</small> : null}</div>) : rec.studyHours ? `${rec.studyHours} h de estudo` : '—'}</td>
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
