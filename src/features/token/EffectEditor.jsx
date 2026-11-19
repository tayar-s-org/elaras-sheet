import React, { useState } from 'react';
import { EFFECT_PRESETS, MAX_EFFECTS, MAX_EFFECT_LABEL, effectsOf } from '../../tokenState.js';

// Efeitos da criatura (envenenada, atordoada…): lista com remover, efeitos prontos e texto livre curto.
// Serve ao criador de criatura (lista local) e ao cartão do token (grava na hora). Sem `onAdd`/`onRemove`, só mostra.
export default function EffectEditor({ effects, onAdd, onRemove, disabled }) {
  const list = effectsOf({ effects });
  const [free, setFree] = useState('');
  const editable = Boolean(onAdd && onRemove);
  const full = list.length >= MAX_EFFECTS;
  const used = new Set(list.map(e => e.label.toLowerCase()));
  const presets = EFFECT_PRESETS.filter(p => !used.has(p.label.toLowerCase()));
  const addFree = () => { if (free.trim()) { onAdd({ label: free }); setFree(''); } };
  return <div className="effects">
    {list.length > 0 && <ul className="effect-list" aria-label="Efeitos ativos">
      {list.map(e => <li key={e.id} className="effect-chip">
        <span aria-hidden="true">{e.icon}</span> {e.label}
        {editable && <button type="button" className="effect-x" aria-label={`Remover o efeito ${e.label}`} title="Remover" disabled={disabled} onClick={() => onRemove(e.id)}>×</button>}
      </li>)}
    </ul>}
    {editable && !full && <>
      <div className="effect-presets" role="group" aria-label="Efeitos prontos">
        {presets.map(p => <button key={p.id} type="button" className="outline effect-add" disabled={disabled} title={`Adicionar: ${p.label}`} onClick={() => onAdd({ preset: p.id })}>
          <span aria-hidden="true">{p.icon}</span> {p.label}</button>)}
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
