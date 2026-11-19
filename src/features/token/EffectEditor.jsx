import React, { useState } from 'react';
import { EFFECT_PRESETS, MAX_EFFECTS, MAX_EFFECT_LABEL, MAX_EFFECT_NOTE, MAX_EFFECT_DURATION, effectsOf } from '../../tokenState.js';

// Efeitos da criatura (envenenada, atordoada…): lista com remover, efeitos prontos e texto livre curto.
// Serve ao criador de criatura (lista local) e ao cartão do token (grava na hora). Sem `onAdd`/`onRemove`, só mostra.
// gender='m': rótulos no masculino (personagens). details: campos opcionais de duração e observação (Central do Mestre).
export default function EffectEditor({ effects, onAdd, onRemove, disabled, gender = 'f', details = false }) {
  const list = effectsOf({ effects });
  const [free, setFree] = useState('');
  const [note, setNote] = useState('');
  const [duration, setDuration] = useState('');
  const extra = details ? { note, duration } : {};
  const editable = Boolean(onAdd && onRemove);
  const full = list.length >= MAX_EFFECTS;
  const used = new Set(list.map(e => e.label.toLowerCase()));
  const labelOf = p => (gender === 'm' ? p.labelM : p.label);
  const presets = EFFECT_PRESETS.filter(p => !used.has(labelOf(p).toLowerCase()));
  const clearDetails = () => { setNote(''); setDuration(''); };
  const addFree = () => { if (free.trim()) { onAdd({ label: free, ...extra }); setFree(''); clearDetails(); } };
  const addPreset = p => { onAdd({ preset: p.id, gender, ...extra }); clearDetails(); };
  return <div className="effects">
    {list.length > 0 && <ul className="effect-list" aria-label="Efeitos ativos">
      {list.map(e => <li key={e.id} className="effect-chip">
        <span aria-hidden="true">{e.icon}</span> {e.label}{e.duration ? <small> · {e.duration}</small> : null}{e.note ? <small className="muted"> — {e.note}</small> : null}
        {editable && <button type="button" className="effect-x" aria-label={`Remover o efeito ${e.label}`} title="Remover" disabled={disabled} onClick={() => onRemove(e.id)}>×</button>}
      </li>)}
    </ul>}
    {editable && !full && <>
      {details && <div className="effect-details">
        <input maxLength={MAX_EFFECT_DURATION} value={duration} placeholder="Duração (ex.: 3 rodadas)" aria-label="Duração" disabled={disabled} onChange={e => setDuration(e.target.value)} />
        <input maxLength={MAX_EFFECT_NOTE} value={note} placeholder="Observação (opcional)" aria-label="Observação" disabled={disabled} onChange={e => setNote(e.target.value)} />
      </div>}
      <div className="effect-presets" role="group" aria-label="Efeitos prontos">
        {presets.map(p => <button key={p.id} type="button" className="outline effect-add" disabled={disabled} title={`Adicionar: ${labelOf(p)}`} onClick={() => addPreset(p)}>
          <span aria-hidden="true">{p.icon}</span> {labelOf(p)}</button>)}
      </div>
      <div className="effect-free">
        <input maxLength={MAX_EFFECT_LABEL} value={free} placeholder="Outro efeito (texto curto)" aria-label="Efeito livre" disabled={disabled}
          onChange={e => setFree(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFree(); } }} />
        <button type="button" className="outline" disabled={disabled || !free.trim()} onClick={addFree}>Adicionar</button>
      </div>
    </>}
    {editable && full && <small className="muted">Limite de {MAX_EFFECTS} efeitos.</small>}
  </div>;
}
