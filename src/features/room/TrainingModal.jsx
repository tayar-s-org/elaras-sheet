import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { calculate, validateCharacter } from '../../rules.js';
import { loadRoutines, saveRoutine, loadRoutineStatuses, loadReturnNotes, submitRoutine, setRoutineStatus, TRAINING_STATUS } from '../../lib/training.js';
import {
  ACTIVITIES, averageRoll, emptyRoutine, normalizeRoutine, simulateRoutine, maxMeditations, maxPracticeHours,
  MANA_IMPROVEMENT_POINTS, blockedReason,
} from '../../training/routine.js';
import '../sheet/modules.css';
import '../sheet/market.css';
import './training.css';

const fmt = n => (Math.round(n * 100) / 100).toString().replace('.', ',');
const signed = n => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : '0');
const POLL_MS = 8000;

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

// Rotina de treino: uma planilha por jogador com o que o personagem faz a cada hora entre as sessões.
export default function TrainingModal({ tableId, me, isGm, initial, members, characters, closed, onClose }) {
  const roster = useMemo(() => members.filter(m => m.status === 'approved' && m.character_id && characters[m.character_id]), [members, characters]);
  const [selected, setSelected] = useState(() => (initial && roster.some(m => m.user_id === initial) ? initial : roster.some(m => m.user_id === me) ? me : roster[0]?.user_id));
  const [routines, setRoutines] = useState({}); // user_id -> rotina (a minha fica aqui também)
  const [available, setAvailable] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('');
  const [statuses, setStatuses] = useState(null); // aprovação por jogador; null = migration 0017 pendente
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [notes, setNotes] = useState({});
  const [returning, setReturning] = useState(false);
  const [returnText, setReturnText] = useState('');
  const dirty = useRef(false);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Carrega e atualiza de tempos em tempos; a minha rotina local não é sobrescrita enquanto há edição pendente.
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      const [all, st, nt] = await Promise.all([loadRoutines(tableId), loadRoutineStatuses(tableId), loadReturnNotes(tableId)]);
      if (!alive) return;
      setNotes(nt);
      setStatuses(prev => (dirty.current && prev ? { ...st, [me]: prev[me] } : st));
      if (all === null) { setAvailable(false); setLoaded(true); return; }
      setAvailable(true);
      setRoutines(prev => {
        const next = {};
        for (const [uid, data] of Object.entries(all)) next[uid] = normalizeRoutine(data);
        if (dirty.current && prev[me]) next[me] = prev[me];
        return next;
      });
      setLoaded(true);
    };
    pull();
    const timer = setInterval(pull, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [tableId, me]);

  // Salva a minha rotina sozinho, um pouco depois da última alteração.
  const mine = routines[me];
  useEffect(() => {
    if (!dirty.current || !mine || !available) return undefined;
    setStatus('Salvando…');
    const timer = setTimeout(async () => {
      try { await saveRoutine(tableId, me, mine); dirty.current = false; setStatus('Salvo'); }
      catch (e) { setStatus(e.message); }
    }, 800);
    return () => clearTimeout(timer);
  }, [mine, available, tableId, me]);

  const member = roster.find(m => m.user_id === selected);
  const character = member ? characters[member.character_id] : null;
  const stats = useMemo(() => statsOf(character?.data), [character]);
  const editable = member?.user_id === me && !closed && available;
  const routine = routines[selected] || emptyRoutine();
  const sim = useMemo(() => simulateRoutine(routine, stats), [routine, stats]);

  const edit = patch => {
    dirty.current = true;
    setStatuses(prev => (prev && prev[me] && prev[me] !== 'draft' ? { ...prev, [me]: 'draft' } : prev));
    setRoutines(prev => ({ ...prev, [me]: normalizeRoutine({ ...(prev[me] || emptyRoutine()), ...patch }) }));
  };
  const editRow = (i, patch) => {
    const at = sim.rows[i];
    if (patch.a && at && blockedReason(patch.a, at.staminaBefore, at.manaBefore)) return;
    const rows = routine.rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    edit({ rows });
  };

  const act = async fn => {
    setApprovalBusy(true);
    try { await fn(); } catch (e) { setStatus(e.message); } finally { setApprovalBusy(false); }
  };
  const submit = () => act(async () => {
    await submitRoutine(tableId, me, routines[me] || emptyRoutine());
    dirty.current = false;
    setStatus('Enviada para o mestre');
    setStatuses(prev => ({ ...(prev || {}), [me]: 'pending' }));
  });
  const review = (next, note) => act(async () => {
    await setRoutineStatus(tableId, selected, next, note);
    setStatuses(prev => ({ ...(prev || {}), [selected]: next }));
    setNotes(prev => { const copy = { ...prev }; if (note && note.trim()) copy[selected] = note.trim(); else delete copy[selected]; return copy; });
    setReturning(false);
    setReturnText('');
  });
  const shown = statuses ? (statuses[selected] || 'draft') : null;
  const owner = selected === me;
  useEffect(() => { setReturning(false); setReturnText(''); }, [selected]);

  return createPortal(<div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="mod-editor training-modal" role="dialog" aria-modal="true" aria-labelledby="training-title">
      <header className="mod-editor-head">
        <h2 id="training-title">Rotina de Treino</h2>
        <span className="tr-status" role="status">{editable ? status : ''}</span>
        <button type="button" className="primary" onClick={onClose}>Fechar</button>
      </header>
      <div className="mod-editor-body">
        {!available && <p className="callout">A rotina de treino ainda não está disponível neste servidor. O mestre da mesa precisa rodar a migration <code>0014_training_routines.sql</code> no Supabase.</p>}
        {!roster.length ? <p className="muted">Nenhum jogador com ficha vinculada nesta mesa ainda.</p> : <>
          <div className="tabs-row" role="tablist" aria-label="Jogadores">
            {roster.map(m => <button key={m.user_id} type="button" role="tab" aria-selected={selected === m.user_id} className={selected === m.user_id ? 'primary' : 'outline'} onClick={() => setSelected(m.user_id)}>
              {characters[m.character_id].name || m.profiles?.display_name || 'Jogador'}{m.user_id === me ? ' (você)' : ''}
              {statuses?.[m.user_id] === 'pending' && <span className="tr-badge pending">Pendente</span>}{statuses?.[m.user_id] === 'approved' && <span className="tr-badge approved">Aprovada</span>}
            </button>)}
          </div>
          {!loaded ? <p className="muted">Carregando…</p> : <>
            <p className="muted tr-owner">Jogador: {member?.profiles?.display_name || '—'}{!editable && member?.user_id !== me ? ' · só leitura' : ''}</p>
            {shown && <div className="tr-approval" role="group" aria-label="Aprovação da rotina">
              <span className={`tr-badge ${shown}`}>{TRAINING_STATUS[shown]}</span>
              {owner && editable && shown === 'draft' && <button type="button" className="primary" disabled={approvalBusy} onClick={submit}>Enviar para aprovação</button>}
              {owner && editable && shown === 'pending' && <button type="button" className="outline" disabled={approvalBusy} onClick={() => review('draft')}>Retirar envio</button>}
              {owner && shown === 'approved' && <span className="muted">Aprovada pelo mestre. Se você editar, volta a rascunho.</span>}
              {isGm && shown === 'pending' && !returning && <>
                <button type="button" className="primary" disabled={approvalBusy} onClick={() => review('approved')}>Aprovar</button>
                <button type="button" className="outline" disabled={approvalBusy} onClick={() => setReturning(true)}>Devolver ao jogador</button>
              </>}
              {isGm && shown === 'approved' && !returning && <button type="button" className="outline" disabled={approvalBusy} onClick={() => setReturning(true)}>Revogar aprovação</button>}
              {isGm && !owner && shown === 'draft' && <span className="muted">{notes[selected] ? 'Devolvida ao jogador.' : 'O jogador ainda não enviou para aprovação.'}</span>}
            </div>}
            {shown && isGm && returning && <div className="tr-return">
              <label className="field"><span>Por que está devolvendo? (o jogador vai ler)</span>
                <textarea rows={3} maxLength={500} value={returnText} autoFocus onChange={e => setReturnText(e.target.value)} placeholder="Ex.: 8h de treino físico seguidas passam do limite; ajuste a partir das 14h." /></label>
              <div className="tr-approval">
                <button type="button" className="primary" disabled={approvalBusy || !returnText.trim()} onClick={() => review('draft', returnText)}>Devolver com este texto</button>
                <button type="button" className="outline" disabled={approvalBusy} onClick={() => { setReturning(false); setReturnText(''); }}>Cancelar</button>
              </div>
            </div>}
            {shown === 'draft' && notes[selected] && <p className="callout tr-note" role="note"><b>Devolvida pelo mestre:</b> {notes[selected]}</p>}
            <div className="tr-head">
              <label className="field"><span>Data do período</span>
                <input value={routine.period} maxLength={60} disabled={!editable} placeholder="Ex.: Dia 3 da semana" onChange={e => edit({ period: e.target.value })} /></label>
              <label className="field"><span>Local do treino</span>
                <input value={routine.place} maxLength={100} disabled={!editable} onChange={e => edit({ place: e.target.value })} /></label>
              <label className="field"><span>Estamina inicial (máx. {stats.maxStamina})</span>
                <input type="number" min="0" max={stats.maxStamina} disabled={!editable} value={routine.startStamina ?? stats.maxStamina} onChange={e => edit({ startStamina: e.target.value === '' ? null : Number(e.target.value) })} /></label>
              <label className="field"><span>Mana inicial (máx. {stats.maxMana})</span>
                <input type="number" min="0" max={stats.maxMana} disabled={!editable} value={routine.startMana ?? stats.maxMana} onChange={e => edit({ startMana: e.target.value === '' ? null : Number(e.target.value) })} /></label>
              <div className="field"><span>Rolagem de Meditar (0 a 12)</span>
                <div className="tr-roll-row">
                <input type="number" min="0" max="12" disabled={!editable || routine.meditAvg} value={routine.meditAvg ? sim.roll : routine.meditRoll} onChange={e => edit({ meditRoll: Number(e.target.value) })} />
                <label className="check tr-avg" title="Em vez de rolar, usa o valor médio do dado de Meditar da ficha (sem explosão)">
                  <input type="checkbox" checked={routine.meditAvg} disabled={!editable} onChange={e => edit({ meditAvg: e.target.checked })} /> Usar média{routine.meditAvg ? ` (${stats.meditar ? `d${stats.meditar}` : 'd4−2'})` : ''}</label>
                </div></div>
              <label className="check tr-fed"><input type="checkbox" checked={routine.fed} disabled={!editable} onChange={e => edit({ fed: e.target.checked })} /> Alimentado (necessário para recuperar fadiga)</label>
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
                      {editable ? <div className="tr-act-row">
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
          </>}
        </>}
      </div>
    </div>
  </div>, document.body);
}
