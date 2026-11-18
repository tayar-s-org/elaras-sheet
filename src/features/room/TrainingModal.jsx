import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { calculate, validateCharacter } from '../../rules.js';
import {
  loadRoutines, createRoutine, saveRoutine, submitRoutine, setRoutineStatus, deleteRoutine,
  loadCalendars, saveCalendar, TRAINING_STATUS,
} from '../../lib/training.js';
import {
  ACTIVITIES, emptyRoutine, normalizeRoutine, simulateRoutine, maxMeditations, maxPracticeHours,
  MANA_IMPROVEMENT_POINTS, blockedReason,
} from '../../training/routine.js';
import { monthKey, shiftMonth, sanitizeDays, setDay } from '../../training/calendar.js';
import TrainingCalendar from './TrainingCalendar.jsx';
import '../sheet/modules.css';
import '../sheet/market.css';
import './training.css';

const fmt = n => (Math.round(n * 100) / 100).toString().replace('.', ',');
const signed = n => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : '0');
const POLL_MS = 8000;
const CAL_SAVE_MS = 500;
const now = () => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; };

function statsOf(data) {
  try {
    const c = validateCharacter(data);
    const d = calculate(c);
    return { maxStamina: d.stamina, maxMana: d.mana, spirit: c.attributes.Espírito, conjurar: c.skills.Conjurar || 0, meditar: c.skills.Meditar || 0 };
  } catch { return { maxStamina: 0, maxMana: 0, spirit: 4, conjurar: 0, meditar: 0 }; }
}

function Rules({ stats }) {
  return <details className="tr-rules">
    <summary>Regras das atividades</summary>
    <div className="tr-rules-grid">
      <section><h4>Atividades físicas</h4><p>Horas 1 a 4 de treino: 1 de fadiga por hora. Horas 5 a 8: 2 por hora. Horas 9 a 12: 4 por hora. Assim, 4h custam 4, 8h custam 12 e 12h custam 28. O contador volta a zero após um descanso completo.</p></section>
      <section><h4>Atividades mágicas</h4><p>Estudar um feitiço de complexidade 1 custa 1 de mana por hora, sem acréscimo ao longo do dia. Praticar custa 1 de mana por hora, com limite de metade de Conjurar por dia (este personagem: {maxPracticeHours(stats.conjurar)}h).</p></section>
      <section><h4>Recuperação física</h4><p>Exige estar alimentado. 8 horas de descanso completo (dormir) recuperam 12 de fadiga. Descanso simples recupera 2 por hora, até 4 horas por dia.</p></section>
      <section><h4>Recuperação mágica</h4><p>Meditar recupera 1 / (4 − x/4) de mana por hora, onde x é a rolagem de Meditar (máximo 12, que dá 1 por hora). Você entra em estado meditativo no máximo 1/6 do Espírito vezes ao dia, no mínimo 1 (este personagem: {maxMeditations(stats.spirit)}x).</p></section>
      <section><h4>Aprimoramento de mana</h4><p>Para cada +1 de mana máxima é preciso meditar o tempo de recuperar {MANA_IMPROVEMENT_POINTS} de mana, já com a mana cheia. O treino pode continuar por até 7 dias; passou disso, falha.</p></section>
    </div>
  </details>;
}

const label = r => r?.name?.trim() || 'Sem nome';

// Rotina de treino: cada jogador tem várias rotinas com nome (um dia, hora a hora) e um calendário mensal
// onde coloca as rotinas aprovadas pelo mestre.
export default function TrainingModal({ tableId, me, isGm, initial, initialRoutine, members, characters, closed, onClose }) {
  const roster = useMemo(() => members.filter(m => m.status === 'approved' && m.character_id && characters[m.character_id]), [members, characters]);
  const [selected, setSelected] = useState(() => (initial && roster.some(m => m.user_id === initial) ? initial : roster.some(m => m.user_id === me) ? me : roster[0]?.user_id));
  const [view, setView] = useState(initialRoutine ? 'routines' : 'calendar');
  const [rows, setRows] = useState([]); // todas as rotinas da mesa
  const [routineId, setRoutineId] = useState(initialRoutine || null);
  const [available, setAvailable] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('');
  const [month, setMonth] = useState(now);
  const [cal, setCal] = useState({ key: monthKey(now().year, now().month), byUser: {} });
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [returning, setReturning] = useState(false);
  const [returnText, setReturnText] = useState('');
  const dirtyId = useRef(null); // rotina minha com alteração ainda não salva
  const dirtyCal = useRef(false);
  const calRef = useRef(cal);
  calRef.current = cal;
  const calTimer = useRef(null);
  const key = monthKey(month.year, month.month);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Salva o calendário agora (se há alteração pendente). Usado pelo temporizador, ao trocar de mês e ao fechar.
  const flushCal = useCallback(async () => {
    clearTimeout(calTimer.current);
    if (!dirtyCal.current) return;
    dirtyCal.current = false;
    const { key: k, byUser } = calRef.current;
    try { await saveCalendar(tableId, me, k, byUser[me] || {}); setStatus('Calendário salvo'); }
    catch (e) { dirtyCal.current = true; setStatus(e.message); }
  }, [tableId, me]);
  useEffect(() => () => { flushCal(); }, [flushCal]);

  // Carrega e atualiza de tempos em tempos; o que eu estou editando não é sobrescrito.
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      const [list, cals] = await Promise.all([loadRoutines(tableId), loadCalendars(tableId, key)]);
      if (!alive) return;
      if (list === null) { setAvailable(false); setLoaded(true); return; }
      setAvailable(true);
      setRows(prev => list.map(r => (r.id === dirtyId.current ? (prev.find(p => p.id === r.id) || { ...r, data: normalizeRoutine(r.data) }) : { ...r, data: normalizeRoutine(r.data) })));
      setCal(prev => {
        const byUser = {};
        const [y, m] = key.split('-').map(Number);
        for (const [uid, days] of Object.entries(cals || {})) byUser[uid] = sanitizeDays(days, y, m - 1);
        if (dirtyCal.current && prev.key === key && prev.byUser[me]) byUser[me] = prev.byUser[me];
        return { key, byUser };
      });
      setLoaded(true);
    };
    pull();
    const timer = setInterval(pull, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [tableId, me, key]);

  // Salva a rotina que estou editando um pouco depois da última alteração.
  useEffect(() => {
    const row = rows.find(r => r.id === dirtyId.current);
    if (!row || !available) return undefined;
    setStatus('Salvando…');
    const timer = setTimeout(async () => {
      try { await saveRoutine(row.id, { name: row.name, data: row.data }); if (dirtyId.current === row.id) dirtyId.current = null; setStatus('Salvo'); }
      catch (e) { setStatus(e.message); }
    }, 800);
    return () => clearTimeout(timer);
  }, [rows, available]);

  const member = roster.find(m => m.user_id === selected);
  const character = member ? characters[member.character_id] : null;
  const stats = useMemo(() => statsOf(character?.data), [character]);
  const owner = selected === me;
  const canEdit = owner && !closed && available;
  const theirs = useMemo(() => rows.filter(r => r.user_id === selected), [rows, selected]);
  const current = theirs.find(r => r.id === routineId) || null;
  const sim = useMemo(() => simulateRoutine(current?.data || emptyRoutine(), stats), [current, stats]);
  const days = cal.byUser[selected] || {};

  // ---- calendário ----
  const shift = async delta => { await flushCal(); setMonth(m => shiftMonth(m, delta)); };
  const goToday = async () => { await flushCal(); setMonth(now()); };
  const touchCal = fn => {
    dirtyCal.current = true;
    setCal(prev => ({ ...prev, byUser: { ...prev.byUser, [me]: fn(prev.byUser[me] || {}) } }));
    clearTimeout(calTimer.current);
    calTimer.current = setTimeout(flushCal, CAL_SAVE_MS);
  };
  const setCalDay = (day, id) => touchCal(d => setDay(d, day, id));
  const clearMonth = () => { if (window.confirm('Tirar todas as rotinas deste mês do calendário?')) touchCal(() => ({})); };

  // ---- rotinas ----
  const patchRow = (id, fn) => { dirtyId.current = id; setRows(prev => prev.map(r => (r.id === id ? fn(r) : r))); };
  // Editar os dados volta a rotina para rascunho (o servidor faz o mesmo).
  const edit = patch => patchRow(current.id, r => ({ ...r, status: 'draft', data: normalizeRoutine({ ...r.data, ...patch }) }));
  const rename = name => patchRow(current.id, r => ({ ...r, name: name.slice(0, 60) }));
  const editRow = (i, patch) => {
    const at = sim.rows[i];
    if (patch.a && at && blockedReason(patch.a, at.staminaBefore, at.manaBefore)) return;
    edit({ rows: current.data.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  };
  const act = async fn => {
    setApprovalBusy(true);
    try { await fn(); } catch (e) { setStatus(e.message); } finally { setApprovalBusy(false); }
  };
  const create = () => act(async () => {
    const row = await createRoutine(tableId, `Rotina ${theirs.length + 1}`, emptyRoutine());
    setRows(prev => [...prev, { ...row, data: normalizeRoutine(row.data) }]);
    setRoutineId(row.id);
    setView('routines');
  });
  const remove = () => {
    if (!window.confirm(`Apagar a rotina "${label(current)}"? Os dias do calendário que a usam ficam vazios.`)) return;
    act(async () => {
      await deleteRoutine(current.id);
      setRows(prev => prev.filter(r => r.id !== current.id));
      setRoutineId(null);
    });
  };
  const submit = () => act(async () => {
    await saveRoutine(current.id, { name: current.name, data: current.data });
    await submitRoutine(current.id, current.data);
    dirtyId.current = null;
    setStatus('Enviada para o mestre');
    setRows(prev => prev.map(r => (r.id === current.id ? { ...r, status: 'pending', review_note: null } : r)));
  });
  const review = (next, note) => act(async () => {
    await setRoutineStatus(current.id, next, note);
    setRows(prev => prev.map(r => (r.id === current.id ? { ...r, status: next, review_note: next === 'draft' && note?.trim() ? note.trim() : null } : r)));
    setReturning(false);
    setReturnText('');
  });
  useEffect(() => { setReturning(false); setReturnText(''); }, [routineId, selected]);
  useEffect(() => { if (routineId && loaded && !theirs.some(r => r.id === routineId)) setRoutineId(null); }, [theirs, routineId, loaded]);

  const pendingOf = uid => rows.filter(r => r.user_id === uid && r.status === 'pending').length;
  const shown = current?.status || 'draft';
  const editor = current && <div className="tr-editor">
    <label className="field tr-name"><span>Nome da rotina</span>
      <input value={current.name} maxLength={60} disabled={!canEdit} placeholder="Ex.: Treino pesado, Estudo da biblioteca…" onChange={e => rename(e.target.value)} /></label>
    <div className="tr-approval" role="group" aria-label="Aprovação da rotina">
      <span className={`tr-badge ${shown}`}>{TRAINING_STATUS[shown]}</span>
      {owner && canEdit && shown === 'draft' && <button type="button" className="primary" disabled={approvalBusy} onClick={submit}>Enviar para aprovação</button>}
      {owner && canEdit && shown === 'pending' && <button type="button" className="outline" disabled={approvalBusy} onClick={() => review('draft')}>Retirar envio</button>}
      {owner && shown === 'approved' && <span className="muted">Aprovada: já pode ir para o calendário. Se você editar, volta a rascunho.</span>}
      {isGm && shown === 'pending' && !returning && <>
        <button type="button" className="primary" disabled={approvalBusy} onClick={() => review('approved')}>Aprovar</button>
        <button type="button" className="outline" disabled={approvalBusy} onClick={() => setReturning(true)}>Devolver ao jogador</button>
      </>}
      {isGm && shown === 'approved' && !returning && <button type="button" className="outline" disabled={approvalBusy} onClick={() => setReturning(true)}>Revogar aprovação</button>}
      {isGm && !owner && shown === 'draft' && <span className="muted">{current.review_note ? 'Devolvida ao jogador.' : 'O jogador ainda não enviou para aprovação.'}</span>}
      {owner && canEdit && <button type="button" className="text-button danger tr-delete" disabled={approvalBusy} onClick={remove}>Apagar rotina</button>}
    </div>
    {isGm && returning && <div className="tr-return">
      <label className="field"><span>Por que está devolvendo? (o jogador vai ler)</span>
        <textarea rows={3} maxLength={500} value={returnText} autoFocus onChange={e => setReturnText(e.target.value)} placeholder="Ex.: 8h de treino físico seguidas passam do limite; ajuste a partir das 14h." /></label>
      <div className="tr-approval">
        <button type="button" className="primary" disabled={approvalBusy || !returnText.trim()} onClick={() => review('draft', returnText)}>Devolver com este texto</button>
        <button type="button" className="outline" disabled={approvalBusy} onClick={() => { setReturning(false); setReturnText(''); }}>Cancelar</button>
      </div>
    </div>}
    {shown === 'draft' && current.review_note && <p className="callout tr-note" role="note"><b>Devolvida pelo mestre:</b> {current.review_note}</p>}
    <div className="tr-head">
      <label className="field"><span>Data do período</span>
        <input value={current.data.period} maxLength={60} disabled={!canEdit} placeholder="Ex.: Dia 3 da semana" onChange={e => edit({ period: e.target.value })} /></label>
      <label className="field"><span>Local do treino</span>
        <input value={current.data.place} maxLength={100} disabled={!canEdit} onChange={e => edit({ place: e.target.value })} /></label>
      <label className="field"><span>Estamina inicial (máx. {stats.maxStamina})</span>
        <input type="number" min="0" max={stats.maxStamina} disabled={!canEdit} value={current.data.startStamina ?? stats.maxStamina} onChange={e => edit({ startStamina: e.target.value === '' ? null : Number(e.target.value) })} /></label>
      <label className="field"><span>Mana inicial (máx. {stats.maxMana})</span>
        <input type="number" min="0" max={stats.maxMana} disabled={!canEdit} value={current.data.startMana ?? stats.maxMana} onChange={e => edit({ startMana: e.target.value === '' ? null : Number(e.target.value) })} /></label>
      <div className="field"><span>Rolagem de Meditar (0 a 12)</span>
        <div className="tr-roll-row">
          <input type="number" min="0" max="12" disabled={!canEdit || current.data.meditAvg} value={current.data.meditAvg ? sim.roll : current.data.meditRoll} onChange={e => edit({ meditRoll: Number(e.target.value) })} />
          <label className="check tr-avg" title="Em vez de rolar, usa o valor médio do dado de Meditar da ficha (sem explosão)">
            <input type="checkbox" checked={current.data.meditAvg} disabled={!canEdit} onChange={e => edit({ meditAvg: e.target.checked })} /> Usar média{current.data.meditAvg ? ` (${stats.meditar ? `d${stats.meditar}` : 'd4−2'})` : ''}</label>
        </div></div>
      <label className="check tr-fed"><input type="checkbox" checked={current.data.fed} disabled={!canEdit} onChange={e => edit({ fed: e.target.checked })} /> Alimentado (necessário para recuperar fadiga)</label>
    </div>

    <div className="tr-summary">
      <span className="mk-chip">Estamina no fim <b>{fmt(sim.endStamina)} / {stats.maxStamina}</b></span>
      <span className="mk-chip">Mana no fim <b>{fmt(sim.endMana)} / {stats.maxMana}</b></span>
      <span className="mk-chip">Fadiga do dia <b>{signed(sim.totalVE)}</b></span>
      <span className="mk-chip">Mana do dia <b>{signed(sim.totalVM)}</b></span>
      <span className="mk-chip">Meditação <b>{fmt(sim.rate)} de mana por hora</b></span>
      {sim.improvement.hours > 0 && <span className="mk-chip">Aprimoramento <b>{sim.improvement.hours}h de {sim.improvement.hoursPerPoint}h por +1 de mana</b></span>}
    </div>
    {sim.warnings.length > 0 && <ul className="tr-warnings">{sim.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}

    <div className="tr-scroll">
      <table className="tr-table">
        <thead><tr><th>Hora</th><th>Estamina</th><th>Mana</th><th>Atividades</th><th>Efeitos</th><th>Valor de estamina</th><th>Valor de mana</th></tr></thead>
        <tbody>
          {sim.rows.map((row, i) => <tr key={row.hour} className={`${row.a ? 'on' : ''}${row.blocked ? ' blocked' : ''}`}>
            <th scope="row">{row.hour}</th>
            <td className="tr-estm">{fmt(row.stamina)}{row.incap > 0 && <small className={`tr-level l${row.incap}`} title={`Incapacitação ${row.incap}`}>Incap. {row.incap}</small>}</td>
            <td>{fmt(row.mana)}{row.exhaustion > 0 && <small className={`tr-level l${row.exhaustion}`} title={`Exaustão ${row.exhaustion}`}>Exaust. {row.exhaustion}</small>}</td>
            <td className="tr-act">
              {canEdit ? <div className="tr-act-row">
                <select aria-label={`Atividade às ${row.hour}`} title={ACTIVITIES.find(x => x.id === row.a)?.label} value={row.a} onChange={e => editRow(i, { a: e.target.value })}>{ACTIVITIES.map(a => <option key={a.id} value={a.id} disabled={a.id !== row.a && Boolean(blockedReason(a.id, row.staminaBefore, row.manaBefore))}>{a.label}</option>)}</select>
                <input aria-label={`Observação às ${row.hour}`} value={row.n} maxLength={200} placeholder="Observação" onChange={e => editRow(i, { n: e.target.value })} />
              </div> : <>
                <b>{row.a ? ACTIVITIES.find(a => a.id === row.a)?.label : ''}</b>{row.n && <span> {row.n}</span>}
              </>}
            </td>
            <td className="tr-effect" title={row.effect}>{row.effect}</td>
            <td className={row.ve < 0 ? 'neg' : row.ve > 0 ? 'pos' : ''}>{signed(row.ve)}</td>
            <td className={row.vm < 0 ? 'neg' : row.vm > 0 ? 'pos' : ''}>{signed(row.vm)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <Rules stats={stats} />
  </div>;

  return createPortal(<div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="mod-editor training-modal" role="dialog" aria-modal="true" aria-labelledby="training-title">
      <header className="mod-editor-head">
        <h2 id="training-title">Rotina de Treino</h2>
        <span className="tr-status" role="status">{owner ? status : ''}</span>
        <button type="button" className="primary" onClick={onClose}>Fechar</button>
      </header>
      <div className="mod-editor-body">
        {!available && <p className="callout">A rotina de treino com calendário ainda não está disponível neste servidor. O mestre da mesa precisa rodar a migration <code>0020_training_calendar.sql</code> no Supabase.</p>}
        {!roster.length ? <p className="muted">Nenhum jogador com ficha vinculada nesta mesa ainda.</p> : <>
          <div className="tabs-row" role="tablist" aria-label="Jogadores">
            {roster.map(m => <button key={m.user_id} type="button" role="tab" aria-selected={selected === m.user_id} className={selected === m.user_id ? 'primary' : 'outline'} onClick={() => setSelected(m.user_id)}>
              {characters[m.character_id].name || m.profiles?.display_name || 'Jogador'}{m.user_id === me ? ' (você)' : ''}
              {pendingOf(m.user_id) > 0 && <span className="tr-badge pending">{pendingOf(m.user_id)} pendente{pendingOf(m.user_id) > 1 ? 's' : ''}</span>}
            </button>)}
          </div>
          {!loaded ? <p className="muted">Carregando…</p> : <>
            <p className="muted tr-owner">Jogador: {member?.profiles?.display_name || '—'}{!owner ? ' · só leitura' : ''}</p>
            <div className="tabs-row tr-views" role="tablist" aria-label="Seção">
              <button type="button" role="tab" aria-selected={view === 'calendar'} className={view === 'calendar' ? 'primary' : 'outline'} onClick={() => setView('calendar')}>Calendário</button>
              <button type="button" role="tab" aria-selected={view === 'routines'} className={view === 'routines' ? 'primary' : 'outline'} onClick={() => setView('routines')}>Rotinas ({theirs.length})</button>
            </div>

            {view === 'calendar'
              ? <TrainingCalendar year={month.year} month={month.month} days={days} routines={theirs} editable={canEdit}
                onShift={shift} onToday={goToday} onSet={setCalDay} onClear={clearMonth}
                onOpen={id => { setRoutineId(id); setView('routines'); }} />
              : <div className="tr-routines">
                <div className="tr-list">
                  {theirs.map(r => <button key={r.id} type="button" role="tab" aria-selected={routineId === r.id} className={`tr-routine${routineId === r.id ? ' on' : ''}`} onClick={() => setRoutineId(r.id)}>
                    <b>{label(r)}</b><span className={`tr-badge ${r.status}`}>{TRAINING_STATUS[r.status]}</span></button>)}
                  {canEdit && <button type="button" className="outline" disabled={approvalBusy || theirs.length >= 20} onClick={create}>+ Nova rotina</button>}
                  {!theirs.length && <p className="muted">{owner ? 'Você ainda não tem rotinas. Crie uma, preencha as 24 horas e envie para o mestre aprovar.' : 'Este jogador ainda não criou rotinas.'}</p>}
                </div>
                {editor || (theirs.length > 0 && <p className="muted">Escolha uma rotina para ver ou editar.</p>)}
              </div>}
          </>}
        </>}
      </div>
    </div>
  </div>, document.body);
}
