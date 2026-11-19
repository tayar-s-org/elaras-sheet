import React, { useMemo, useRef, useState } from 'react';
import { monthGrid, monthName, WEEKDAY_LABELS, dayOfTick, isDayLocked, MONTHS_PER_YEAR } from '../../rpg/clock.js';
import { dayState } from '../../rpg/readiness.js';
import { routineHue, countByRoutine } from '../../training/calendar.js';
import './routine.css';

const colorOf = id => `hsl(${routineHue(id)} 62% 58%)`;
const STATE_TEXT = {
  ok: 'Aprovado', pending: 'Aguardando aprovação', rejected: 'Devolvido pelo mestre', draft: 'Preenchido, sem aprovação', empty: 'Sem rotina',
};

// Calendário do RPG: 5 semanas de 6 dias por mês, 12 meses por ano. A rotina vai ao dia de três jeitos: arrastando,
// com o pincel (clicar ou passar o mouse segurando) ou selecionando vários dias e aplicando de uma vez.
// Estado de cada dia: sem rotina · preenchido (rascunho) · aguardando aprovação · aprovado · devolvido · passado/processado.
export default function CampaignCalendar({ view, days, routines, tick, editable, onShift, onToday, onAssign, onOpen, processed, highlight }) {
  const grid = useMemo(() => monthGrid(view.year, view.month), [view.year, view.month]);
  const byId = useMemo(() => Object.fromEntries(routines.map(r => [r.id, r])), [routines]);
  const approved = routines.filter(r => r.status === 'approved');
  const counts = countByRoutine(Object.fromEntries(Object.entries(days).map(([d, id]) => [d, id])));
  const [brush, setBrush] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [selecting, setSelecting] = useState(false);
  const [over, setOver] = useState(null);
  const painting = useRef(false);
  const today = tick == null ? -1 : dayOfTick(tick);
  const activeBrush = brush && byId[brush]?.status === 'approved' ? brush : null;
  const label = r => r?.name?.trim() || 'Sem nome';
  const locked = dayNo => tick != null && isDayLocked(dayNo, tick);
  const canEdit = dayNo => editable && !locked(dayNo);

  const place = (dayNos, id) => {
    const ok = dayNos.filter(canEdit);
    if (ok.length) onAssign(ok, id);
  };
  const drop = (e, dayNo) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/plain');
    if (byId[id]?.status === 'approved') place([dayNo], id);
  };
  const toggle = dayNo => setSelected(prev => { const n = new Set(prev); if (n.has(dayNo)) n.delete(dayNo); else n.add(dayNo); return n; });
  const toggleWeek = week => {
    const all = week.map(c => c.dayNo).filter(canEdit);
    setSelected(prev => { const n = new Set(prev); const full = all.every(d => n.has(d)); all.forEach(d => (full ? n.delete(d) : n.add(d))); return n; });
  };
  const applyToSelected = id => { place([...selected], id); setSelected(new Set()); };
  const stateOf = dayNo => {
    const id = days[dayNo];
    return id ? dayState(byId[id], byId[id]?.character_id) : 'empty';
  };

  return <section className="tc cc" aria-label={`Calendário: ${monthName(view.month)}, ano ${view.year}`}
    onMouseUp={() => { painting.current = false; }} onMouseLeave={() => { painting.current = false; }}>
    <header className="tc-head">
      <h3>{monthName(view.month)} <span>Ano {view.year}</span></h3>
      <div className="tc-nav">
        <button type="button" className="outline" aria-label="Ano anterior" onClick={() => onShift(-MONTHS_PER_YEAR)}>«</button>
        <button type="button" className="outline" aria-label="Mês anterior" onClick={() => onShift(-1)}>◀</button>
        <button type="button" className="outline" onClick={onToday}>Hoje</button>
        <button type="button" className="outline" aria-label="Próximo mês" onClick={() => onShift(1)}>▶</button>
        <button type="button" className="outline" aria-label="Próximo ano" onClick={() => onShift(MONTHS_PER_YEAR)}>»</button>
      </div>
    </header>

    <ul className="cc-legend" aria-label="Legenda">
      <li><i className="s-empty" />Sem rotina</li>
      <li><i className="s-draft" />Preenchido</li>
      <li><i className="s-pending" />Aguardando aprovação</li>
      <li><i className="s-ok" />Aprovado</li>
      <li><i className="s-rejected" />Devolvido</li>
      <li><i className="s-done" />Processado</li>
    </ul>

    {editable && <div className="tc-palette" aria-label="Rotinas aprovadas">
      {approved.length ? <>
        <p className="muted tc-hint">Escolha uma rotina e use o número do dia para aplicá-la. Também vale arrastar ou passar o mouse segurando. Para vários dias de uma vez, use <b>Selecionar dias</b>.</p>
        <div className="tc-chips">
          {approved.map(r => <button key={r.id} type="button" draggable className={`tc-chip${activeBrush === r.id ? ' on' : ''}`} style={{ '--tc': colorOf(r.id) }}
            aria-pressed={activeBrush === r.id} title="Arraste para um dia ou clique para usar como pincel"
            onDragStart={e => { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => { if (selected.size) applyToSelected(r.id); else setBrush(b => (b === r.id ? null : r.id)); }}>
            <i aria-hidden="true" />{label(r)}{counts[r.id] ? <small>{counts[r.id]} {counts[r.id] === 1 ? 'dia' : 'dias'}</small> : null}</button>)}
        </div>
        <div className="cc-select-bar">
          <button type="button" className={selecting ? 'primary' : 'outline'} aria-pressed={selecting}
            onClick={() => { setSelecting(s => !s); setSelected(new Set()); setBrush(null); }}>Selecionar dias</button>
          {selecting && <>
            <span className="muted">{selected.size} {selected.size === 1 ? 'dia selecionado' : 'dias selecionados'}. Clique numa rotina acima para aplicar a todos, ou toque no número da semana para marcá-la.</span>
            <button type="button" className="outline" disabled={!selected.size} onClick={() => applyToSelected(null)}>Limpar rotina dos selecionados</button>
            <button type="button" className="text-button" disabled={!selected.size} onClick={() => setSelected(new Set())}>Desmarcar</button>
          </>}
        </div>
      </> : <p className="muted tc-hint">Você ainda não tem rotinas aprovadas. Crie uma na aba <b>Rotinas</b>, envie para o mestre e, depois de aprovada, ela aparece aqui para ir aos dias.</p>}
    </div>}

    <div className="tc-grid cc-grid" role="group" aria-label="Dias do mês">
      {WEEKDAY_LABELS.map(w => <div key={w} className="tc-wd">{w}</div>)}
      {grid.map((week, wi) => week.map(({ day, dayNo }, ci) => {
        const rid = days[dayNo];
        const r = rid ? byId[rid] : null;
        const st = stateOf(dayNo);
        const lock = locked(dayNo);
        const done = lock && dayNo < today ? (processed?.has?.(dayNo) ? 'done' : 'past') : '';
        const sel = selected.has(dayNo);
        return <div key={dayNo} aria-label={`Dia ${day}: ${STATE_TEXT[st]}${done ? ', já passou' : ''}`}
          className={`tc-day s-${st}${dayNo === today ? ' today' : ''}${over === dayNo ? ' over' : ''}${editable && activeBrush && !lock ? ' paintable' : ''}${sel ? ' picked' : ''}${lock ? ' locked' : ''}${done ? ` ${done}` : ''}${highlight?.includes(dayNo) ? ' flag' : ''}`}
          onDragOver={e => { if (canEdit(dayNo)) { e.preventDefault(); setOver(dayNo); } }} onDragLeave={() => setOver(o => (o === dayNo ? null : o))} onDrop={e => drop(e, dayNo)}
          onMouseDown={e => {
            if (e.button !== 0 || !canEdit(dayNo) || e.target.closest('button')) return;
            if (selecting) { toggle(dayNo); return; }
            if (activeBrush) { painting.current = true; place([dayNo], activeBrush); }
          }}
          onMouseEnter={() => { if (painting.current && activeBrush) place([dayNo], activeBrush); }}>
          <div className="cc-day-head">
            {canEdit(dayNo) && (selecting || activeBrush) ? <button
              type="button"
              className="outline cc-day-action"
              aria-pressed={selecting ? sel : undefined}
              aria-label={selecting ? `Dia ${day}, ${STATE_TEXT[st]}` : `Aplicar ${label(byId[activeBrush])} no dia ${day}, ${STATE_TEXT[st]}`}
              onClick={() => selecting ? toggle(dayNo) : place([dayNo], activeBrush)}
            >{day}</button> : <span className="tc-num">{day}</span>}
            {ci === 0 && editable && selecting && <button type="button" className="cc-week"
              aria-label={`Selecionar a semana ${wi + 1}`} disabled={!week.some(c => canEdit(c.dayNo))}
              onClick={() => toggleWeek(week)}>Sem. {wi + 1}</button>}
          </div>
          {rid && <div className={`tc-slot${r ? '' : ' stale'}${r && !activeBrush && !selecting ? ' openable' : ''}`} style={{ '--tc': colorOf(rid) }}
            role={r && !activeBrush && !selecting ? 'button' : undefined} tabIndex={r && !activeBrush && !selecting ? 0 : undefined}
            draggable={canEdit(dayNo) && r?.status === 'approved'} onDragStart={e => { e.dataTransfer.setData('text/plain', rid); e.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => { if (r && !activeBrush && !selecting && onOpen) onOpen(r.id); }}
            onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && r && !activeBrush && !selecting && onOpen) { e.preventDefault(); onOpen(r.id); } }}
            title={r ? `${label(r)} · ${STATE_TEXT[st]}${r.review_note && st === 'rejected' ? ` · ${r.review_note}` : ''} · clique para abrir a rotina` : 'Rotina removida'}>
            <span className="tc-slot-name">{r ? label(r) : 'Rotina removida'}</span>
            <small className={`cc-badge s-${st}`}>{STATE_TEXT[st]}</small>
            {canEdit(dayNo) && <button type="button" className="tc-x" aria-label={`Tirar a rotina do dia ${day}`} onClick={e => { e.stopPropagation(); place([dayNo], null); }}>×</button>}
          </div>}
          {!rid && lock && <small className="cc-badge s-empty">Passou sem rotina</small>}
        </div>;
      }))}
    </div>
  </section>;
}
