import React, { useRef, useState } from 'react';
import { WEEKDAYS, MONTHS, monthWeeks, countByRoutine, routineHue } from '../../training/calendar.js';
import { TRAINING_STATUS } from '../../lib/training.js';
import './trainingCalendar.css';

const colorOf = id => `hsl(${routineHue(id)} 62% 58%)`;

// Calendário mensal do jogador. Rotinas aprovadas pelo mestre vão para os dias de três jeitos: arrastar a rotina até o dia,
// escolher a rotina como "pincel" e clicar (ou arrastar o mouse) pelos dias, ou arrastar de um dia para outro.
// Uma mesma rotina pode ocupar quantos dias quiser.
export default function TrainingCalendar({ year, month, days, routines, editable, onShift, onToday, onSet, onClear, onOpen }) {
  const weeks = monthWeeks(year, month);
  const byId = Object.fromEntries(routines.map(r => [r.id, r]));
  const approved = routines.filter(r => r.status === 'approved');
  const counts = countByRoutine(days);
  const [brush, setBrush] = useState(null);
  const painting = useRef(false);
  const [over, setOver] = useState(null);
  const activeBrush = brush && byId[brush]?.status === 'approved' ? brush : null;
  const today = new Date();
  const isToday = d => d && today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
  const label = r => r.name || 'Sem nome';

  const drop = (e, day) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/plain');
    if (editable && byId[id]?.status === 'approved') onSet(day, id);
  };
  const paint = day => { if (editable && activeBrush) onSet(day, activeBrush); };

  return <section className="tc" aria-label={`Calendário de ${MONTHS[month]} de ${year}`} onMouseUp={() => { painting.current = false; }} onMouseLeave={() => { painting.current = false; }}>
    <header className="tc-head">
      <h3>{MONTHS[month]} <span>{year}</span></h3>
      <div className="tc-nav">
        <button type="button" className="outline" aria-label="Mês anterior" onClick={() => onShift(-1)}>◀</button>
        <button type="button" className="outline" onClick={onToday}>Hoje</button>
        <button type="button" className="outline" aria-label="Próximo mês" onClick={() => onShift(1)}>▶</button>
      </div>
    </header>

    {editable && <div className="tc-palette" aria-label="Rotinas aprovadas">
      {approved.length ? <>
        <p className="muted tc-hint">Arraste uma rotina até um dia, ou clique nela e depois clique (ou passe o mouse segurando) pelos dias para preencher vários.</p>
        <div className="tc-chips">
          {approved.map(r => <button key={r.id} type="button" draggable className={`tc-chip${activeBrush === r.id ? ' on' : ''}`} style={{ '--tc': colorOf(r.id) }}
            aria-pressed={activeBrush === r.id} title="Arraste para um dia ou clique para usar como pincel"
            onDragStart={e => { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => setBrush(b => (b === r.id ? null : r.id))}>
            <i aria-hidden="true" />{label(r)}{counts[r.id] ? <small>{counts[r.id]} {counts[r.id] === 1 ? 'dia' : 'dias'}</small> : null}</button>)}
        </div>
        {Object.keys(days).length > 0 && <button type="button" className="text-button danger" onClick={onClear}>Limpar o mês</button>}
      </> : <p className="muted tc-hint">Você ainda não tem rotinas aprovadas. Crie uma na aba <b>Rotinas</b>, envie para o mestre e, depois de aprovada, ela aparece aqui para ir aos dias do mês.</p>}
    </div>}

    <div className="tc-grid" role="grid" aria-readonly={!editable}>
      {WEEKDAYS.map(w => <div key={w} className="tc-wd" role="columnheader">{w}</div>)}
      {weeks.flat().map((d, i) => {
        if (!d) return <div key={`b${i}`} className="tc-day blank" aria-hidden="true" />;
        const rid = days[String(d)];
        const r = rid ? byId[rid] : null;
        const ok = r?.status === 'approved';
        return <div key={d} role="gridcell" className={`tc-day${isToday(d) ? ' today' : ''}${over === d ? ' over' : ''}${editable && activeBrush ? ' paintable' : ''}`}
          onDragOver={e => { if (editable) { e.preventDefault(); setOver(d); } }} onDragLeave={() => setOver(o => (o === d ? null : o))} onDrop={e => drop(e, d)}
          onMouseDown={e => { if (e.button === 0 && editable && activeBrush && !e.target.closest('button')) { painting.current = true; paint(d); } }}
          onMouseEnter={() => { if (painting.current) paint(d); }}>
          <span className="tc-num">{d}</span>
          {rid && <div className={`tc-slot${ok ? '' : ' stale'}${r && !activeBrush ? ' openable' : ''}`} style={{ '--tc': colorOf(rid) }}
            role={r ? 'button' : undefined} tabIndex={r ? 0 : undefined}
            draggable={editable && ok} onDragStart={e => { e.dataTransfer.setData('text/plain', rid); e.dataTransfer.effectAllowed = 'copy'; }}
            // Com um pincel escolhido, clicar no dia pinta; sem pincel, clicar na rotina do dia abre a rotina.
            onClick={() => { if (r && !activeBrush && onOpen) onOpen(r.id); }}
            onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && r && !activeBrush && onOpen) { e.preventDefault(); onOpen(r.id); } }}
            title={r ? `${label(r)} · ${TRAINING_STATUS[r.status]} · clique para abrir a rotina` : 'Rotina removida'}>
            <span className="tc-slot-name">{r ? label(r) : 'Rotina removida'}</span>
            {r && !ok && <small>sem aprovação</small>}
            {editable && <button type="button" className="tc-x" aria-label={`Tirar a rotina do dia ${d}`} onClick={e => { e.stopPropagation(); onSet(d, null); }}>×</button>}
          </div>}
        </div>;
      })}
    </div>
  </section>;
}
