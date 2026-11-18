import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  loadRoutines, createRoutine, saveRoutine, submitRoutine, setRoutineStatus, deleteRoutine, TRAINING_STATUS,
} from '../../lib/training.js';
import { loadRoutineDays, assignDays } from '../../lib/clock.js';
import { emptyRoutine, normalizeRoutine, simulateRoutine, routineProblems } from '../../training/routine.js';
import { statsFromCharacter } from '../../rpg/processor.js';
import { blockedReason } from '../../rpg/activities.js';
import { loadProgress, loadTraining } from '../../lib/engine.js';
import { loadRequests, approvedJobs, loadSpellProgress } from '../../lib/requests.js';
import RequestsPanel from '../routine/Requests.jsx';
import RoutineGrid from '../routine/RoutineGrid.jsx';
import { formatClock, dayParts, dayOfTick, shiftMonth } from '../../rpg/clock.js';
import CampaignCalendar from '../routine/CampaignCalendar.jsx';
import ClockPanel from '../routine/ClockPanel.jsx';
import { useClock } from '../routine/useClock.js';
import '../sheet/modules.css';
import '../sheet/market.css';
import './training.css';

const POLL_MS = 8000;
const viewOfDay = dayNo => { const p = dayParts(dayNo); return { year: p.year, month: p.month }; };

const FALLBACK_STATS = { maxStamina: 0, maxMana: 0, spirit: { die: 4, bonus: 0 }, conjurar: { die: 0, bonus: 0 }, meditar: { die: 0, bonus: 0 }, skills: [], spells: [], trainedSpells: [] };
function statsOf(data, trained, jobs) {
  try { return statsFromCharacter(data, trained, jobs); } catch { return FALLBACK_STATS; }
}

const label = r => r?.name?.trim() || 'Sem nome';

// Rotina de treino: cada ficha tem várias rotinas com nome (um dia, hora a hora) e uma agenda por dia da campanha
// onde coloca as rotinas aprovadas pelo mestre. O mestre também controla o tempo da campanha aqui.
// Tudo é por PERSONAGEM (character_id): trocar de ficha na mesa não leva as rotinas da ficha antiga.
export default function TrainingModal({ tableId, me, isGm, initial, initialRoutine, members, characters, closed, onClose }) {
  const roster = useMemo(() => members.filter(m => m.status === 'approved' && m.character_id && characters[m.character_id]), [members, characters]);
  const [selected, setSelected] = useState(() => (initial && roster.some(m => m.character_id === initial) ? initial : roster.find(m => m.user_id === me)?.character_id || roster[0]?.character_id));
  const [view, setView] = useState(initialRoutine ? 'routines' : 'calendar');
  const [rows, setRows] = useState([]); // todas as rotinas da mesa
  const [routineId, setRoutineId] = useState(initialRoutine || null);
  const [available, setAvailable] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('');
  const clock = useClock(tableId, true);
  const [monthView, setMonthView] = useState(null);
  const [daysByChar, setDaysByChar] = useState({});
  const [progress, setProgress] = useState({});
  const [requests, setRequests] = useState([]);
  const [training, setTraining] = useState({});
  const [spellProgress, setSpellProgress] = useState({});
  const [flagged, setFlagged] = useState([]);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [returning, setReturning] = useState(false);
  const [returnText, setReturnText] = useState('');
  const dirtyId = useRef(null); // rotina minha com alteração ainda não salva
  const writes = useRef(0); // gravações do calendário em andamento (a leitura periódica não as atropela)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Primeira vez que o relógio chega: o calendário abre no mês da campanha.
  const tick = clock.tick;
  useEffect(() => { if (tick != null) setMonthView(prev => prev || viewOfDay(dayOfTick(tick))); }, [tick]);

  // Carrega e atualiza de tempos em tempos; o que eu estou editando não é sobrescrito.
  const pull = useCallback(async () => {
    const [list, assigned, prog, reqs, trn, sp] = await Promise.all([loadRoutines(tableId), loadRoutineDays(tableId), loadProgress(tableId), loadRequests(tableId), loadTraining(tableId), loadSpellProgress(tableId)]);
    if (list === null || assigned === null) { setAvailable(false); setLoaded(true); return; }
    if (prog) setProgress(prog);
    if (reqs) setRequests(reqs);
    if (trn) setTraining(trn);
    if (sp) setSpellProgress(sp);
    setAvailable(true);
    setRows(prev => list.map(r => (r.id === dirtyId.current ? (prev.find(p => p.id === r.id) || { ...r, data: normalizeRoutine(r.data) }) : { ...r, data: normalizeRoutine(r.data) })));
    if (!writes.current) setDaysByChar(assigned);
    setLoaded(true);
  }, [tableId]);
  useEffect(() => {
    let alive = true;
    const run = () => { if (alive) pull().catch(() => {}); };
    run();
    const timer = setInterval(run, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [pull, tick]);

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

  const member = roster.find(m => m.character_id === selected);
  const character = member ? characters[member.character_id] : null;
  const trained = useMemo(() => [...new Set((progress[selected] || []).filter(p => p.kind === 'spell' && p.earned_total > 0).map(p => p.name))], [progress, selected]);
  const jobs = useMemo(() => approvedJobs(requests, selected), [requests, selected]);
  const stats = useMemo(() => statsOf(character?.data, trained, jobs), [character, trained, jobs]);
  const refreshAll = useCallback(() => pull().catch(() => {}), [pull]);
  const pendingRequests = useMemo(() => requests.filter(r => r.character_id === selected && r.status === 'pending').length, [requests, selected]);
  const owner = member?.user_id === me;
  const canEdit = owner && !closed && available;
  const theirs = useMemo(() => rows.filter(r => r.character_id === selected), [rows, selected]);
  const current = theirs.find(r => r.id === routineId) || null;
  const sim = useMemo(() => simulateRoutine(current?.data || emptyRoutine(), stats), [current, stats]);
  const days = daysByChar[selected] || {};
  const routinesById = useMemo(() => Object.fromEntries(rows.map(r => [r.id, r])), [rows]);
  const nameOf = id => characters[id]?.name || 'Personagem';
  const clockReady = tick != null && clock.available;
  const roleCharacters = useMemo(() => roster.map(m => ({ characterId: m.character_id, userId: m.user_id, name: characters[m.character_id]?.name || '' })), [roster, characters]);

  // ---- calendário ----
  const shift = delta => setMonthView(m => shiftMonth(m || { year: 1, month: 1 }, delta));
  const goToday = () => { if (tick != null) setMonthView(viewOfDay(dayOfTick(tick))); };
  const assign = async (dayNos, id) => {
    if (!canEdit) return;
    setDaysByChar(prev => {
      const mine = { ...(prev[selected] || {}) };
      for (const d of dayNos) { if (id) mine[d] = id; else delete mine[d]; }
      return { ...prev, [selected]: mine };
    });
    writes.current += 1;
    try { await assignDays(tableId, selected, dayNos, id); setStatus('Calendário salvo'); }
    catch (e) { setStatus(e.message); }
    finally { writes.current -= 1; if (!writes.current) pull().catch(() => {}); }
  };
  const openCalendarOf = (characterId, firstDay, dayNos) => {
    setSelected(characterId);
    setView('calendar');
    setMonthView(viewOfDay(firstDay));
    setFlagged(dayNos || []);
  };

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
    if (!window.confirm(`Apagar a rotina "${label(current)}"? Os dias futuros que a usam ficam vazios.`)) return;
    act(async () => {
      await deleteRoutine(current.id);
      setRows(prev => prev.filter(r => r.id !== current.id));
      setRoutineId(null);
      pull().catch(() => {});
    });
  };
  const problems = useMemo(() => (current ? routineProblems(current.data, stats) : []), [current, stats]);
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

  const pendingOf = cid => rows.filter(r => r.character_id === cid && r.status === 'pending').length;
  const shown = current?.status || 'draft';
  const editor = current && <div className="tr-editor">
    <label className="field tr-name"><span>Nome da rotina</span>
      <input value={current.name} maxLength={60} disabled={!canEdit} placeholder="Ex.: Treino pesado, Estudo da biblioteca…" onChange={e => rename(e.target.value)} /></label>
    <div className="tr-approval" role="group" aria-label="Aprovação da rotina">
      <span className={`tr-badge ${shown}`}>{TRAINING_STATUS[shown]}</span>
      {owner && canEdit && shown === 'draft' && <button type="button" className="primary" disabled={approvalBusy || problems.length > 0} title={problems.length ? 'Complete as linhas marcadas antes de enviar' : ''} onClick={submit}>Enviar para aprovação</button>}
      {owner && canEdit && shown === 'draft' && problems.length > 0 && <span className="muted">Faltam dados em {problems.length} linha(s): {problems.slice(0, 3).map(p => `${p.hour} (${p.issue})`).join('; ')}{problems.length > 3 ? '…' : ''}</span>}
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
    <RoutineGrid data={current.data} sim={sim} stats={stats} canEdit={canEdit} onEdit={edit} onRow={editRow} />
  </div>;

  const migrationHelp = <p className="callout">O novo sistema de rotinas e calendário ainda não está disponível neste servidor. O mestre da mesa precisa rodar a migration <code>0023_campaign_clock.sql</code> no Supabase.</p>;

  return createPortal(<div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="mod-editor training-modal" role="dialog" aria-modal="true" aria-labelledby="training-title">
      <header className="mod-editor-head">
        <h2 id="training-title">Rotina de Treino</h2>
        {clockReady && <span className="tr-clock" title="Data e hora da campanha, iguais para todos da mesa">{formatClock(tick)}</span>}
        <span className="tr-status" role="status">{owner ? status : ''}</span>
        <button type="button" className="primary" onClick={onClose}>Fechar</button>
      </header>
      <div className="mod-editor-body">
        {!available && migrationHelp}
        {available && !clock.available && migrationHelp}
        {!roster.length ? <p className="muted">Nenhum jogador com ficha vinculada nesta mesa ainda.</p> : <>
          <div className="tabs-row" role="tablist" aria-label="Personagens">
            {roster.map(m => <button key={m.character_id} type="button" role="tab" aria-selected={selected === m.character_id} className={selected === m.character_id ? 'primary' : 'outline'} onClick={() => setSelected(m.character_id)}>
              {characters[m.character_id].name || m.profiles?.display_name || 'Personagem'}{m.user_id === me ? ' (você)' : ''}
              {pendingOf(m.character_id) > 0 && <span className="tr-badge pending">{pendingOf(m.character_id)} pendente{pendingOf(m.character_id) > 1 ? 's' : ''}</span>}
            </button>)}
          </div>
          {!loaded ? <p className="muted">Carregando…</p> : <>
            <p className="muted tr-owner">Jogador: {member?.profiles?.display_name || '—'}{!owner ? ' · só leitura' : ''}</p>
            <div className="tabs-row tr-views" role="tablist" aria-label="Seção">
              <button type="button" role="tab" aria-selected={view === 'calendar'} className={view === 'calendar' ? 'primary' : 'outline'} onClick={() => setView('calendar')}>Calendário</button>
              <button type="button" role="tab" aria-selected={view === 'routines'} className={view === 'routines' ? 'primary' : 'outline'} onClick={() => setView('routines')}>Rotinas ({theirs.length})</button>
              <button type="button" role="tab" aria-selected={view === 'requests'} className={view === 'requests' ? 'primary' : 'outline'} onClick={() => setView('requests')}>Solicitações{pendingRequests ? ` (${pendingRequests})` : ''}</button>
              {isGm && <button type="button" role="tab" aria-selected={view === 'time'} className={view === 'time' ? 'primary' : 'outline'} onClick={() => setView('time')}>Tempo da campanha</button>}
            </div>

            {view === 'calendar'
              ? (clockReady && monthView
                ? <CampaignCalendar view={monthView} days={days} routines={theirs} tick={tick} editable={canEdit}
                  onShift={shift} onToday={goToday} onAssign={assign} highlight={flagged}
                  onOpen={id => { setRoutineId(id); setView('routines'); }} />
                : <p className="muted">{clock.available ? 'Carregando o relógio da campanha…' : 'O calendário depende da migration 0023.'}</p>)
              : view === 'requests'
                ? <RequestsPanel tableId={tableId} characterId={selected} owner={owner} isGm={isGm} closed={closed} requests={requests} stats={stats}
                  training={training[selected]} spellProgress={spellProgress[selected]} refresh={refreshAll} />
              : view === 'time' && isGm
                ? (clockReady
                  ? <ClockPanel tableId={tableId} members={members} tick={tick} characters={roleCharacters} routines={routinesById} routineDays={daysByChar}
                    nameOf={nameOf} onOpenCalendar={openCalendarOf} onAdvanced={() => { clock.refresh(); pull().catch(() => {}); }} closed={closed} />
                  : <p className="muted">O relógio da campanha depende da migration 0023.</p>)
                : <div className="tr-routines">
                  <div className="tr-list">
                    {theirs.map(r => <button key={r.id} type="button" role="tab" aria-selected={routineId === r.id} className={`tr-routine${routineId === r.id ? ' on' : ''}`} onClick={() => setRoutineId(r.id)}>
                      <b>{label(r)}</b><span className={`tr-badge ${r.status}`}>{TRAINING_STATUS[r.status]}</span></button>)}
                    {canEdit && <button type="button" className="outline" disabled={approvalBusy || theirs.length >= 20} onClick={create}>+ Nova rotina</button>}
                    {!theirs.length && <p className="muted">{owner ? 'Este personagem ainda não tem rotinas. Crie uma, preencha as 24 horas e envie para o mestre aprovar.' : 'Este personagem ainda não tem rotinas.'}</p>}
                  </div>
                  {editor || (theirs.length > 0 && <p className="muted">Escolha uma rotina para ver ou editar.</p>)}
                </div>}
          </>}
        </>}
      </div>
    </div>
  </div>, document.body);
}
