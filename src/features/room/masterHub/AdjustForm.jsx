import React, { useId, useState } from 'react';
import { previewAdjust, parseWholeNumber, LIMITS } from './core.js';
import { TargetChips, BatchResults, useMasterRun, targetsFor, defaultTarget, previewText, usePersistedState } from './ui.jsx';

const MODES = [['add', 'Somar'], ['subtract', 'Retirar'], ['set', 'Definir valor']];
const apiOf = (mode, n) => (mode === 'set' ? { mode: 'set', amount: n } : { mode: 'add', amount: mode === 'subtract' ? -Math.abs(n) : Math.abs(n) });

// Formulário único de "dar, retirar ou definir um valor" (dinheiro, XP, carteira, experiência), pensado para premiar rápido no meio da sessão:
//  alvo em chips (lembra o último), valores rápidos, prévia VISÍVEL antes do botão, observação recolhida.
//  "Somar" não pede confirmação (a prévia já está na tela) e oferece "Desfazer"; Retirar e Definir valor pedem confirmação com antes → depois.
// kind: dinheiro|xp|wallet|experience (limites de core.js) · call(t, {mode, amount, note}, requestId) · undoCall(t, delta, requestId) · deltaOf(resultado).
export default function AdjustForm({ kind, storageKey, players, closed, blocked = false, extra = null, extraKey = '', quick = [], labels = {},
  amountLabel, currentOf, format = String, confirmTitle, call, undoCall, deltaOf, onDone }) {
  const [target, setTarget] = usePersistedState(`${storageKey}:target`, null);
  const [mode, setMode] = usePersistedState(`${storageKey}:mode`, 'add');
  const [text, setText] = useState(String(quick[0] ?? 1));
  const [note, setNote] = useState('');
  const uid = useId();
  const run = useMasterRun({ onDone });
  const value = (target === 'all' && players.length > 1) || players.some(p => p.id === target) ? target : defaultTarget(players);
  const targets = targetsFor(players, value);
  const amount = parseWholeNumber(text);
  const api = amount.ok ? apiOf(mode, amount.value) : null;
  const previews = api ? targets.map(p => ({ p, v: previewAdjust(kind, currentOf(p), api.mode, api.amount) })) : [];
  const bad = previews.find(x => !x.v.ok);
  const line = ({ p, v }) => `${p.name}: ${format(v.current)} → ${format(v.next)}`;
  const modeName = key => labels[key] || MODES.find(m => m[0] === key)[1];
  // O botão diz exatamente o que vai acontecer: "Somar 50 a Aria", "Retirar 10 de Todos (3)", "Definir Aria em 200".
  const who = targets.length === 1 ? targets[0].name : `${targets.length} jogadores`;
  const n = api && !bad ? format(Math.abs(api.amount)) : '';
  const applyLabel = !n || !targets.length ? modeName(mode) : mode === 'add' ? `${modeName(mode)} ${n} a ${who}` : mode === 'subtract' ? `${modeName(mode)} ${n} de ${who}` : `Definir ${who} em ${n}`;

  async function submit(e) {
    e.preventDefault();
    if (!api || bad || closed || blocked || !targets.length) return;
    await run.start({
      title: confirmTitle(modeName(mode)), actionLabel: modeName(mode), danger: mode !== 'add', skipConfirm: mode === 'add',
      text: previewText([`${targets.length === 1 ? targets[0].name : `${targets.length} jogadores`}:`, ...previews.map(line)]),
      opKey: `${storageKey}:${extraKey}:${mode}:${text}:${note}`, targets,
      fn: (t, requestId) => call(t, { mode: api.mode, amount: api.amount, note }, requestId),
      undo: undoCall && ((t, result, requestId) => undoCall(t, -deltaOf(result), requestId)),
      undoable: result => { const d = Math.abs(deltaOf(result)); return d > 0 && d <= LIMITS[kind].addMax; },
    });
  }

  return <>
    <form className="mh-form mh-adjust" onSubmit={submit}>
      <TargetChips players={players} value={value} onChange={setTarget} />
      {extra}
      <div className="tabs-row" role="group" aria-label="Operação">
        {MODES.map(([k]) => <button key={k} type="button" className={mode === k ? 'primary' : 'outline'} aria-pressed={mode === k} onClick={() => setMode(k)}>{modeName(k)}</button>)}
      </div>
      <div className="mh-amount">
        <label className="field"><span>{amountLabel(mode)}</span>
          <input type="number" inputMode="numeric" value={text} onChange={e => setText(e.target.value)} onFocus={e => e.target.select()}
            aria-invalid={!amount.ok || Boolean(bad)} aria-describedby={`${uid}-${amount.ok ? 'preview' : 'amount-error'}`} />
          {!amount.ok && <small id={`${uid}-amount-error`} className="mh-field-error" role="alert">{amount.error}</small>}</label>
        {mode !== 'set' && quick.length > 0 && <div className="mh-quick" role="group" aria-label="Valores rápidos">
          {quick.map(q => <button key={q} type="button" className="outline" onClick={() => setText(String(q))}>{mode === 'subtract' ? '−' : '+'}{q}</button>)}
        </div>}
      </div>
      <ul className="mh-preview" id={`${uid}-preview`} aria-label="Prévia do resultado">
        {previews.map(({ p, v }) => <li key={p.id}>{v.ok ? <><b>{p.name}</b> {format(v.current)} → <b>{format(v.next)}</b>{api.mode === 'add' && v.delta !== api.amount ? <small> (limitado)</small> : null}</> : <><b>{p.name}</b> <small className="muted">{v.error}</small></>}</li>)}
        {!targets.length && <li className="muted">Sem jogadores com ficha.</li>}
      </ul>
      <details className="mh-note"><summary>Observação{note ? ' ✓' : ''}</summary>
        <input maxLength={200} value={note} onChange={e => setNote(e.target.value)} aria-label="Observação (opcional)" placeholder="Opcional: fica no histórico" /></details>
      <button className="primary mh-apply" disabled={!api || Boolean(bad) || closed || blocked || run.busy || !targets.length}>{applyLabel}</button>
    </form>
    <BatchResults run={run} />
  </>;
}
