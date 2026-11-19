import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ACTIVITIES, ACT, ACTIVITY_LABEL, fieldsFor, rowIssue } from '../../rpg/activities.js';
import { routineHue } from '../../training/calendar.js';

export const colorOf = a => `hsl(${routineHue(a || 'x')} 62% 58%)`;
export const MIME = 'application/x-elara-action';
const emptyAction = { a: ACT.SKILL, skill: '', spell: '', job: '', mode: 'normal', n: '' };

// Identidade de um botão de ação: o que ele faz (sem a anotação).
export const keyOf = r => [r.a, r.skill || '', r.spell || '', r.job || '', r.mode || 'normal', r.n || ''].join('|');
export const pick = r => ({ a: r.a, skill: r.skill || '', spell: r.spell || '', job: r.job || '', mode: r.mode || 'normal', n: r.n || '' });

export function actionLabel(r, stats) {
  const parts = [ACTIVITY_LABEL[r.a] || '—'];
  if (r.a === ACT.SKILL && r.skill) parts.push(r.skill);
  if ((r.a === ACT.SPELL || r.a === ACT.STUDY) && r.spell) parts.push(stats.spells.find(s => s.id === r.spell)?.name || 'feitiço');
  if (r.a === ACT.WORK && r.job) parts.push(stats.jobs?.[r.job]?.name || 'trabalho');
  if ((r.a === ACT.SKILL || r.a === ACT.SPELL) && r.mode === 'focused') parts.push('Focado');
  if (r.n) parts.push(`“${r.n}”`);
  return parts.join(' · ');
}

// Os botões = os que você criou (guardados neste aparelho) + os que já estão na rotina (assim a paleta se refaz em qualquer aparelho).
export function useActionButtons(storageKey, rows) {
  const [saved, setSaved] = useState([]);
  useEffect(() => {
    try { setSaved(JSON.parse(localStorage.getItem(`elara-actions:${storageKey}`) || '[]')); } catch { setSaved([]); }
  }, [storageKey]);
  const persist = list => { setSaved(list); try { localStorage.setItem(`elara-actions:${storageKey}`, JSON.stringify(list)); } catch { /* sem storage */ } };
  const chips = useMemo(() => {
    const map = new Map();
    for (const r of [...saved, ...rows.filter(x => x.a)]) map.set(keyOf(r), pick(r));
    return [...map.values()];
  }, [saved, rows]);
  return { saved, persist, chips };
}

// Faixa de botões de ação: fica na barra fixa, então o pincel ativo e a paleta aparecem enquanto você pinta as horas.
export function BrushStrip({ chips, saved, persist, rows, stats, brush, setBrush, builderOpen, onToggleBuilder }) {
  const stripRef = useRef(null);
  useEffect(() => {
    stripRef.current?.querySelector('.tc-chip.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [brush]);
  const active = chips.find(r => keyOf(r) === brush);
  return <div className="rb-strip" role="group" aria-label="Botões de ação">
    <div className="rb-chips" ref={stripRef}>
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
      {!chips.length && <span className="muted rb-none">Nenhum botão ainda. Crie uma ação para pintar as horas.</span>}
    </div>
    <button type="button" className="outline rb-new" aria-expanded={builderOpen} aria-controls="rb-builder" onClick={onToggleBuilder}>{builderOpen ? 'Fechar' : '+ Nova ação'}</button>
    <span className="sr-only" role="status">{active ? `Pincel ativo: ${actionLabel(active, stats)}` : 'Nenhum pincel ativo'}</span>
  </div>;
}

// Formulário para criar um botão de ação. Fica recolhido: é uma tarefa ocasional, não o caminho principal.
export function ActionBuilder({ saved, persist, stats, setBrush, open, onToggle }) {
  const [draft, setDraft] = useState(emptyAction);
  const fields = fieldsFor(draft.a);
  const issue = rowIssue(draft, stats);
  const set = patch => setDraft(d => ({ ...d, ...patch, ...(patch.a ? { skill: '', spell: '', job: '', mode: 'normal' } : {}) }));
  const create = () => {
    if (issue) return;
    persist([...saved.filter(s => keyOf(s) !== keyOf(draft)), pick(draft)]);
    setBrush(keyOf(draft));
  };
  const trained = stats.spells.filter(s => stats.trainedSpells.includes(s.id));
  return <details id="rb-builder" className="rb-builder-box" open={open} onToggle={e => onToggle(e.currentTarget.open)}>
    <summary>Criar ação</summary>
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
  </details>;
}
