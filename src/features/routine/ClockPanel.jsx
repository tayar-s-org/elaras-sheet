import React, { useEffect, useMemo, useState } from 'react';
import { formatClock, formatDay, hoursFor, MONTH_NAMES, dayParts } from '../../rpg/clock.js';
import { checkAdvance } from '../../rpg/readiness.js';
import { loadClockLog } from '../../lib/clock.js';
import { runAdvance } from './advance.js';
import './routine.css';

const UNITS = [{ id: 'hours', label: 'hora(s)' }, { id: 'days', label: 'dia(s)' }];
const REASON = { empty: 'dia sem rotina', pending: 'aguardando aprovação', rejected: 'rotina devolvida', draft: 'rotina em rascunho' };
const MAX_HOURS = 240; // 10 dias por avanço: cada hora de cada personagem é processada e gravada

// Painel do mestre: relógio da campanha e passagem de tempo.
// Antes de avançar mostra o resumo da validação; qualquer pendência bloqueia o avanço e leva direto ao calendário do personagem.
export default function ClockPanel({ tableId, members, tick, characters, routines, routineDays, nameOf, onOpenCalendar, onAdvanced, closed }) {
  const [plan, setPlan] = useState({ unit: 'hours', amount: 1 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [log, setLog] = useState(null);

  const reloadLog = () => loadClockLog(tableId).then(setLog).catch(() => {});
  useEffect(() => { reloadLog(); }, [tableId, tick]);

  const amount = Number(plan.amount);
  const valid = Number.isInteger(amount) && amount >= 1;
  const hours = valid ? hoursFor({ unit: plan.unit, amount }) : 0;
  const tooBig = hours > MAX_HOURS;
  const report = useMemo(() => (valid && !tooBig ? checkAdvance({ characters, assignments: routineDays, routines, fromTick: tick, hours }) : null),
    [valid, tooBig, characters, routineDays, routines, tick, hours]);
  const target = valid && !tooBig ? tick + hours : null;
  const first = report?.days?.[0];
  const last = report?.days?.[report.days.length - 1];

  const advance = async () => {
    setBusy(true);
    setMessage('');
    try {
      const next = await runAdvance({ tableId, members, tick, hours, kind: plan.unit });
      setMessage(`Tempo avançado para ${formatClock(next)}. As atividades de todos os personagens foram processadas.`);
      onAdvanced?.();
      reloadLog();
    } catch (e) { setMessage(e.message); onAdvanced?.(); } finally { setBusy(false); }
  };

  const problems = report ? report.players.filter(p => !p.complete) : [];
  const rangeText = days => {
    if (!days.length) return '';
    const parts = days.map(d => dayParts(d));
    return days.map((d, i) => `${parts[i].day}${i === 0 || parts[i].month !== parts[i - 1].month ? ` (${MONTH_NAMES[parts[i].month - 1]})` : ''}`).join(', ');
  };

  return <section className="clock-panel" aria-label="Controle do tempo">
    <div className="clock-now">
      <span className="eyebrow">Agora na campanha</span>
      <strong>{formatClock(tick)}</strong>
      <span className="muted">Todos os jogadores veem esta mesma data e hora. O tempo só anda quando você avança.</span>
    </div>

    <div className="clock-controls" role="group" aria-label="Avançar o tempo">
      <button type="button" className="outline" onClick={() => setPlan({ unit: 'hours', amount: 1 })}>+1 hora</button>
      <button type="button" className="outline" onClick={() => setPlan({ unit: 'days', amount: 1 })}>+1 dia</button>
      <label className="clock-custom"><span>Quantidade</span>
        <input type="number" min="1" max={MAX_HOURS} step="1" value={plan.amount} onChange={e => setPlan(p => ({ ...p, amount: e.target.value }))} /></label>
      <label className="clock-custom"><span>Unidade</span>
        <select value={plan.unit} onChange={e => setPlan(p => ({ ...p, unit: e.target.value }))}>{UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}</select></label>
    </div>

    {!valid && <p className="callout" role="alert">Informe um número inteiro maior que zero.</p>}
    {valid && tooBig && <p className="callout" role="alert">O avanço máximo é de {MAX_HOURS} horas (10 dias) por vez; avance em etapas.</p>}

    {report && <div className="clock-check" aria-live="polite">
      <h4>Conferência antes de avançar</h4>
      <p className="clock-dest">Destino: <b>{formatClock(target)}</b> · {hours} hora{hours > 1 ? 's' : ''}</p>
      <ul className="clock-stats">
        <li><b>{report.summary.characters}</b> personagem(ns) verificado(s)</li>
        <li><b>{report.summary.days}</b> dia(s) verificado(s): {formatDay(first)}{last !== first ? ` até ${formatDay(last)}` : ''}</li>
        <li><b>{report.summary.complete}</b> com calendário completo</li>
        <li className={report.summary.withIssues ? 'bad' : ''}><b>{report.summary.withIssues}</b> com pendências</li>
        <li className={report.summary.pendingRoutines ? 'bad' : ''}><b>{report.summary.pendingRoutines}</b> rotina(s) aguardando aprovação</li>
      </ul>
      {report.summary.characters === 0 && <p className="muted">Nenhum personagem vinculado nesta mesa; não há o que verificar.</p>}
      {problems.length > 0 && <div className="clock-problems" role="alert">
        <p><b>Avanço bloqueado.</b> Resolva as pendências abaixo. Todos os dias, até o dia de destino, precisam ter rotina atribuída e aprovada; não existe dia vazio tratado como descanso.</p>
        <ul>
          {problems.map(p => {
            const all = [...p.empty.map(d => ({ d, k: 'empty' })), ...p.pending.map(x => ({ d: x.dayNo, k: 'pending' })), ...p.rejected.map(x => ({ d: x.dayNo, k: 'rejected' })), ...p.draft.map(x => ({ d: x.dayNo, k: 'draft' }))].sort((a, b) => a.d - b.d);
            return <li key={p.characterId}>
              <button type="button" className="clock-link" onClick={() => onOpenCalendar(p.characterId, all[0].d, all.map(x => x.d))}>
                {nameOf(p.characterId) || p.name || 'Personagem'} →
              </button>
              <ul>
                {['empty', 'pending', 'rejected', 'draft'].map(k => {
                  const list = all.filter(x => x.k === k).map(x => x.d);
                  if (!list.length) return null;
                  const notes = k === 'rejected' ? p.rejected.map(x => x.note).filter(Boolean) : [];
                  return <li key={k}><b>{REASON[k]}:</b> dia(s) {rangeText(list)}{notes.length ? ` — "${notes[0]}"` : ''}</li>;
                })}
              </ul>
            </li>;
          })}
        </ul>
      </div>}
      <div className="clock-actions">
        <button type="button" className="primary" disabled={busy || closed || !report.ok} onClick={advance}
          title={report.ok ? '' : 'Resolva as pendências para avançar'}>{busy ? 'Avançando…' : `Avançar ${hours} hora${hours > 1 ? 's' : ''}`}</button>
        {closed && <span className="muted">A mesa foi encerrada.</span>}
      </div>
    </div>}
    {message && <p role="status" className="clock-msg">{message}</p>}

    <h4>Histórico de avanços</h4>
    {log === null ? <p className="muted">Carregando…</p> : !log.length ? <p className="muted">O tempo ainda não avançou.</p> : <ol className="clock-log">
      {log.map(l => <li key={l.id}>
        <b>{formatClock(l.from_tick)}</b> → <b>{formatClock(l.to_tick)}</b>
        <span className="muted"> · +{l.hours} h{l.kind === 'days' ? ` (${l.hours / 24} dia${l.hours / 24 > 1 ? 's' : ''})` : ''} · {l.checked?.characters ?? 0} personagem(ns), {l.checked?.days ?? 0} dia(s) verificados</span>
      </li>)}
    </ol>}
  </section>;
}
