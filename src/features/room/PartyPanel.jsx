import React, { useState } from 'react';
import { saveState } from '../../lib/room.js';
import { RESOURCES, safeMaxima, level, LEVEL_TEXT, currentValue } from './vitals.js';

function Counter({ id, label, value, max, canEdit, onChange }) {
  const mana = id === 'mana';
  const lvl = level(value, max, mana);
  return <div className="counter-wrap">
    <div className="counter">
      <span>{label}</span>
      <span className={`chip l${lvl}`}>{LEVEL_TEXT[mana ? 'mana' : 'normal'][lvl]}</span>
      {canEdit && <button className="outline" aria-label={`Diminuir ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)}>−</button>}
      <strong>{value}<small>/{max}</small></strong>
      {canEdit && <button className="outline" aria-label={`Aumentar ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>}
    </div>
    <div className={`res-bar${mana ? ' mana' : ''}`} aria-hidden="true"><i style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} /></div>
  </div>;
}

function CharacterCard({ member, row, state, canEdit, tableId, patchState, closed }) {
  const [error, setError] = useState('');
  const max = safeMaxima(row.data);
  const value = k => currentValue(state, max, k);
  async function change(k, v) {
    const next = { life: value('life'), stamina: value('stamina'), mana: value('mana'), [k]: v, max }; // max permite ao servidor registrar a primeira alteracao
    patchState(row.id, next);
    setError('');
    try { await saveState(tableId, row.id, next); } catch (e) { setError(e.message); }
  }
  return <article className="party-card">
    <h4>{row.name || 'Sem nome'}</h4>
    <p className="muted">{member.profiles?.display_name} · {row.data.race || 'Raça livre'}</p>
    {RESOURCES.map(([k, label]) => <Counter key={k} id={k} label={label} value={value(k)} max={max[k]} canEdit={canEdit && !closed} onChange={v => change(k, v)} />)}
    {error && <p role="alert" className="muted">{error}</p>}
  </article>;
}

export default function PartyPanel({ tableId, me, isGm, members, characters, states, patchState, closed }) {
  const rows = members.filter(m => m.status === 'approved' && m.character_id && characters[m.character_id]);
  const mine = rows.filter(m => m.user_id === me);
  const shown = isGm ? rows : rows;
  if (!shown.length) return <p className="muted">Nenhuma ficha vinculada à mesa ainda. Escolha a sua em "Gerenciar mesa".</p>;
  return <div className="party">
    {[...mine, ...shown.filter(m => m.user_id !== me)].map(m => <CharacterCard key={m.user_id} member={m} row={characters[m.character_id]}
      state={states[m.character_id]} canEdit={isGm || m.user_id === me} tableId={tableId} patchState={patchState} closed={closed} />)}
  </div>;
}
