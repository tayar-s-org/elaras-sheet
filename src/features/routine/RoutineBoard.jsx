import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useConfirm } from '../../ui/ConfirmProvider.jsx';
import { HOURS } from '../../training/routine.js';
import { ACTIVITIES, ACT, ACTIVITY_LABEL, fieldsFor, rowIssue } from '../../rpg/activities.js';
import { routineHue } from '../../training/calendar.js';
import { describeEvent, fmt, signed } from '../../rpg/describe.js';
import './routine.css';

const colorOf = a => `hsl(${routineHue(a || 'x')} 62% 58%)`;
const MIME = 'application/x-elara-action';
const emptyAction = { a: ACT.SKILL, skill: '', spell: '', job: '', mode: 'normal', n: '' };

// Identidade de um botão de ação: o que ele faz (sem a anotação).
const keyOf = r => [r.a, r.skill || '', r.spell || '', r.job || '', r.mode || 'normal', r.n || ''].join('|');
const pick = r => ({ a: r.a, skill: r.skill || '', spell: r.spell || '', job: r.job || '', mode: r.mode || 'normal', n: r.n || '' });

export function actionLabel(r, stats) {
  const parts = [ACTIVITY_LABEL[r.a] || '—'];
  if (r.a === ACT.SKILL && r.skill) parts.push(r.skill);
  if ((r.a === ACT.SPELL || r.a === ACT.STUDY) && r.spell) parts.push(stats.spells.find(s => s.id === r.spell)?.name || 'feitiço');
  if (r.a === ACT.WORK && r.job) parts.push(stats.jobs?.[r.job]?.name || 'trabalho');
  if ((r.a === ACT.SKILL || r.a === ACT.SPELL) && r.mode === 'focused') parts.push('Focado');
  if (r.n) parts.push(`“${r.n}”`);
  return parts.join(' · ');
}

// Botões de ação: configure uma vez o que quer fazer e arraste o botão para as horas (ou use-o como pincel).
function ActionPalette({ rows, stats, storageKey, brush, setBrush }) {
  const [draft, setDraft] = useState(emptyAction);
  const [saved, setSaved] = useState([]);
  useEffect(() => {
    try { setSaved(JSON.parse(localStorage.getItem(`elara-actions:${storageKey}`) || '[]')); } catch { setSaved([]); }
  }, [storageKey]);
  const persist = list => { setSaved(list); try { localStorage.setItem(`elara-actions:${storageKey}`, JSON.stringify(list)); } catch { /* sem storage */ } };

  // Os botões = os que você criou + os que já estão na rotina (assim a paleta se refaz em qualquer aparelho).
  const chips = useMemo(() => {
    const map = new Map();
    for (const r of [...saved, ...rows.filter(x => x.a)]) map.set(keyOf(r), pick(r));
    return [...map.values()];
  }, [saved, rows]);

  const fields = fieldsFor(draft.a);
  const issue = rowIssue(draft, stats);
  const set = patch => setDraft(d => ({ ...d, ...patch, ...(patch.a ? { skill: '', spell: '', job: '', mode: 'normal' } : {}) }));
  const create = () => {
    if (issue) return;
    persist([...saved.filter(s => keyOf(s) !== keyOf(draft)), pick(draft)]);
    setBrush(keyOf(draft));
  };
  const trained = stats.spells.filter(s => stats.trainedSpells.includes(s.id));
  return <section className="rb-palette tc-palette" aria-label="Botões de ação">
    <h4>Criar ação</h4>
    <div className="rb-builder">
      <label className="field"><span>O que fazer</span>
        <select value={draft.a} onChange={e => set({ a: e.target.value })}>{ACTIVITIES.filter(a => a.id).map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
      {fields.includes('skill') && <label className="field"><span>Perícia</span>
        <select value={draft.skill} onChange={e => set({ skill: e.target.value })}><option value="">Escolha…</option>{stats.skills.map(s => <option key={s} value={s}>{s}</option>)}</select></label>}
      {fields.includes('spell') && <label className="field"><span>Feitiço</span>
        <select value={draft.spell} onChange={e => set({ spell: e.target.value })}><option value="">Escolha…</option>
          {(draft.a === ACT.STUDY ? trained : stats.spells).map(s => <option key={s.id} value={s.id}>{s.name || 'Sem nome'}</option>)}</select></label>}
      {fields.includes('job') && <label className="field"><span>Trabalho</span>
        <select value={draft.job} onChange={e => set({ job: e.target.value })}>
          <option value="">{Object.keys(stats.jobs || {}).length ? 'Escolha…' : 'Nenhum aprovado (peça em Solicitações)'}</option>
          {Object.values(stats.jobs || {}).map(j => <option key={j.id} value={j.id}>{j.name}</option>)}</select></label>}
      {fields.includes('mode') && <label className="field"><span>Complexidade</span>
        <select value={draft.mode} onChange={e => set({ mode: e.target.value })}><option value="normal">Normal</option><option value="focused">Focado (custo dobrado)</option></select></label>}
      <label className="field"><span>Observação (opcional)</span><input value={draft.n} maxLength={200} onChange={e => set({ n: e.target.value })} /></label>
      <button type="button" className="primary" disabled={Boolean(issue)} title={issue ? `Falta: ${issue}` : ''} onClick={create}>Criar botão</button>
    </div>
    {issue && <p className="muted rb-hint">Falta: {issue}.</p>}
    <p className="muted rb-hint">Arraste um botão até a hora desejada. Ou clique nele para usá-lo como pincel e clique (ou passe o mouse segurando) pelas horas. No celular, use o pincel.</p>
    <div className="tc-chips">
      {chips.map(r => {
        const k = keyOf(r);
        const used = rows.filter(x => keyOf(x) === k).length;
        return <span key={k} className="rb-chipwrap">
          <button type="button" draggable className={`tc-chip${brush === k ? ' on' : ''}`} style={{ '--tc': colorOf(r.a) }} aria-pressed={brush === k}
            title="Arraste para uma hora ou clique para usar como pincel"
            onDragStart={e => { e.dataTransfer.setData(MIME, JSON.stringify(r)); e.dataTransfer.setData('text/plain', k); e.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => setBrush(b => (b === k ? null : k))}>
            <i aria-hidden="true" />{actionLabel(r, stats)}{used ? <small>{used} h</small> : null}</button>
          {saved.some(s => keyOf(s) === k) && !used && <button type="button" className="tc-x rb-del" aria-label="Apagar este botão" onClick={() => { persist(saved.filter(s => keyOf(s) !== k)); if (brush === k) setBrush(null); }}>×</button>}
        </span>;
      })}
      {!chips.length && <span className="muted">Nenhum botão ainda. Configure uma ação acima e clique em "Criar botão".</span>}
    </div>
  </section>;
}

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
    <span className="rb-hour">{HOURS[index]}</span>
    <span className="rb-res" title="Estamina / mana ao fim desta hora"><b>{fmt(e.staminaAfter)}</b> est. · <b>{fmt(e.manaAfter)}</b> mana</span>
    <div className="rb-cell">
      {row.a ? <div className="rb-action" style={{ '--tc': colorOf(row.a) }} draggable={canEdit}
        onDragStart={ev => { ev.dataTransfer.setData(MIME, JSON.stringify(pick(row))); ev.dataTransfer.effectAllowed = 'copy'; }}>
        <span className="rb-name">{actionLabel(row, stats)}</span>
        {canEdit && <button type="button" className="tc-x" aria-label={`Limpar a hora ${HOURS[index]}`} onClick={() => onClear(index)}>×</button>}
      </div> : <span className="rb-empty">{canEdit ? 'Solte uma ação aqui' : 'Livre'}</span>}
      {canEdit && brushRow && <button type="button" className="outline rb-apply"
        aria-label={`Aplicar ${actionLabel(brushRow, stats)} às ${HOURS[index]}`}
        onClick={() => onApply(index, brushRow)}>Aplicar</button>}
      {(text || issue) && <small className={e.ok && !issue ? 'rb-effect' : 'rb-effect bad'} title={text}>{issue ? `Falta: ${issue}` : text}</small>}
    </div>
    <span className="rb-delta">
      {e.staminaDelta ? <span className={e.staminaDelta < 0 ? 'neg' : 'pos'}>{signed(e.staminaDelta)} est.</span> : null}
      {e.manaDelta ? <span className={e.manaDelta < 0 ? 'neg' : 'pos'}>{signed(e.manaDelta)} mana</span> : null}
    </span>
  </li>;
}

// A rotina em duas planilhas de 12 horas (06:00–17:00 e 18:00–05:00): arraste as ações para as horas.
export default function RoutineBoard({ data, sim, stats, canEdit, storageKey, onRow, onClearAll }) {
  const askConfirm = useConfirm();
  const [brush, setBrush] = useState(null);
  const painting = useRef(false);
  const rows = data.rows;
  const brushRow = useMemo(() => { if (!brush) return null; const f = rows.find(r => keyOf(r) === brush); if (f) return pick(f); try { const l = JSON.parse(localStorage.getItem(`elara-actions:${storageKey}`) || '[]').find(r => keyOf(r) === brush); return l ? pick(l) : null; } catch { return null; } }, [brush, rows, storageKey]);
  const apply = (i, r) => onRow(i, r);
  const clear = i => onRow(i, { a: '', skill: '', spell: '', job: '', mode: 'normal', n: '' });
  const boards = [['Primeiras 12 horas', 0], ['Últimas 12 horas', 12]];
  return <div onMouseUp={() => { painting.current = false; }} onMouseLeave={() => { painting.current = false; }}>
    {canEdit && <ActionPalette rows={rows} stats={stats} storageKey={storageKey} brush={brush} setBrush={setBrush} />}
    {canEdit && rows.some(r => r.a) && <div className="rb-tools"><button type="button" className="text-button danger" onClick={async () => { if (await askConfirm({ title: 'Limpar rotina?', text: 'Limpar todas as 24 horas desta rotina?', actionLabel: 'Limpar todas as horas', danger: true })) onClearAll(); }}>Limpar todas as horas</button></div>}
    <div className="rb-boards">
      {boards.map(([title, start]) => <section key={start} className="rb-board" aria-label={title}>
        <h4>{title} <small className="muted">{HOURS[start]} – {HOURS[start + 11]}</small></h4>
        <ol className="rb-list">
          {sim.rows.slice(start, start + 12).map((e, k) => <Slot key={start + k} index={start + k} row={rows[start + k]} e={e} stats={stats} canEdit={canEdit}
            brushRow={brushRow} painting={painting} onApply={apply} onClear={clear} />)}
        </ol>
      </section>)}
    </div>
  </div>;
}
