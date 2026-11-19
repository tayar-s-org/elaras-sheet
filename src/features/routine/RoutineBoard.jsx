import React, { useRef, useState } from 'react';
import { useConfirm } from '../../ui/ConfirmProvider.jsx';
import { HOURS } from '../../training/routine.js';
import { rowIssue } from '../../rpg/activities.js';
import { describeEvent, fmt, signed } from '../../rpg/describe.js';
import { colorOf, MIME, pick, actionLabel } from './ActionDock.jsx';
import './routine.css';

function Slot({ index, row, e, stats, canEdit, brushRow, painting, onApply, onClear }) {
  const [over, setOver] = useState(false);
  const issue = row.a ? rowIssue(row, stats) : '';
  const text = describeEvent(e, stats);
  const drop = ev => {
    ev.preventDefault(); setOver(false);
    if (!canEdit) return;
    try { const r = JSON.parse(ev.dataTransfer.getData(MIME)); if (r?.a) onApply(index, pick(r)); } catch { /* arrastou outra coisa */ }
  };
  return <li className={`rb-slot${row.a ? ' on' : ''}${over ? ' over' : ''}${e.ok ? '' : ' fail'}${issue ? ' incomplete' : ''}${canEdit && brushRow ? ' paintable' : ''}`}
    onDragOver={ev => { if (canEdit) { ev.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={drop}
    onMouseDown={ev => { if (ev.button === 0 && canEdit && brushRow && !ev.target.closest('button')) { painting.current = true; onApply(index, brushRow); } }}
    onMouseEnter={() => { if (painting.current && brushRow) onApply(index, brushRow); }}>
    {canEdit && brushRow
      ? <button type="button" className="rb-hour rb-hour-apply" aria-label={`Aplicar ${actionLabel(brushRow, stats)} às ${HOURS[index]}`}
        onClick={() => onApply(index, brushRow)}>{HOURS[index]}</button>
      : <span className="rb-hour">{HOURS[index]}</span>}
    <span className="rb-res" title="Estamina / mana ao fim desta hora"><b>{fmt(e.staminaAfter)}</b> est. · <b>{fmt(e.manaAfter)}</b> mana</span>
    <div className="rb-cell">
      {row.a ? <div className="rb-action" style={{ '--tc': colorOf(row.a) }} draggable={canEdit}
        onDragStart={ev => { ev.dataTransfer.setData(MIME, JSON.stringify(pick(row))); ev.dataTransfer.effectAllowed = 'copy'; }}>
        <span className="rb-name">{actionLabel(row, stats)}</span>
        {canEdit && <button type="button" className="tc-x" aria-label={`Limpar a hora ${HOURS[index]}`} onClick={() => onClear(index)}>×</button>}
      </div> : <span className="rb-empty">{canEdit ? 'Solte uma ação aqui' : 'Livre'}</span>}
      {(text || issue) && <small className={e.ok && !issue ? 'rb-effect' : 'rb-effect bad'} title={text}>{issue ? `Falta: ${issue}` : text}</small>}
    </div>
    <span className="rb-delta">
      {e.staminaDelta ? <span className={e.staminaDelta < 0 ? 'neg' : 'pos'}>{signed(e.staminaDelta)} est.</span> : null}
      {e.manaDelta ? <span className={e.manaDelta < 0 ? 'neg' : 'pos'}>{signed(e.manaDelta)} mana</span> : null}
    </span>
  </li>;
}

// A rotina em duas planilhas de 12 horas (06:00–17:00 e 18:00–05:00): arraste as ações para as horas.
// A paleta e o pincel ficam na barra fixa (ActionDock), que o RoutineGrid monta acima deste quadro.
export default function RoutineBoard({ data, sim, stats, canEdit, brushRow, onRow, onClearAll }) {
  const askConfirm = useConfirm();
  const painting = useRef(false);
  const rows = data.rows;
  const apply = (i, r) => onRow(i, r);
  const clear = i => onRow(i, { a: '', skill: '', spell: '', job: '', mode: 'normal', n: '' });
  const boards = [['Primeiras 12 horas', 0], ['Últimas 12 horas', 12]];
  return <div onMouseUp={() => { painting.current = false; }} onMouseLeave={() => { painting.current = false; }}>
    {canEdit && rows.some(r => r.a) && <div className="rb-tools"><button type="button" className="text-button danger" onClick={async () => { if (await askConfirm({ title: 'Limpar rotina?', text: 'Limpar todas as 24 horas desta rotina?', actionLabel: 'Limpar todas as horas', danger: true })) onClearAll(); }}>Limpar todas as horas</button></div>}
    <div className="rb-boards">
      {boards.map(([title, start]) => <section key={start} className="rb-board" aria-label={title}>
        <h3>{title} <small className="muted">{HOURS[start]} – {HOURS[start + 11]}</small></h3>
        <ol className="rb-list">
          {sim.rows.slice(start, start + 12).map((e, k) => <Slot key={start + k} index={start + k} row={rows[start + k]} e={e} stats={stats} canEdit={canEdit}
            brushRow={brushRow} painting={painting} onApply={apply} onClear={clear} />)}
        </ol>
      </section>)}
    </div>
  </div>;
}
