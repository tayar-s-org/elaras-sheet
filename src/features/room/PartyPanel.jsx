import React, { useState } from 'react';
import { calculate, validateCharacter } from '../../rules.js';
import { saveState } from '../../lib/room.js';

const RESOURCES = [['life', 'Vida'], ['stamina', 'Stamina'], ['mana', 'Mana']];

function safeMaxima(data) {
  try { const d = calculate(validateCharacter(data)); return { life: d.life, stamina: d.stamina, mana: d.mana }; }
  catch { return { life: 0, stamina: 0, mana: 0 }; }
}

function Counter({ label, value, max, canEdit, onChange }) {
  return <div className="counter">
    <span>{label}</span>
    {canEdit && <button className="outline" aria-label={`Diminuir ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)}>−</button>}
    <strong>{value}<small>/{max}</small></strong>
    {canEdit && <button className="outline" aria-label={`Aumentar ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>}
  </div>;
}

function CharacterCard({ member, row, state, canEdit, tableId, patchState, closed }) {
  const [error, setError] = useState('');
  const max = safeMaxima(row.data);
  const value = k => Math.min(max[k], Math.max(0, Number.isFinite(state?.[k]) ? state[k] : max[k]));
  async function change(k, v) {
    const next = { life: value('life'), stamina: value('stamina'), mana: value('mana'), [k]: v };
    patchState(row.id, next);
    setError('');
    try { await saveState(tableId, row.id, next); } catch (e) { setError(e.message); }
  }
  return <article className="party-card">
    <h4>{row.name || 'Sem nome'}</h4>
    <p className="muted">{member.profiles?.display_name} · {row.data.race || 'Raça livre'}</p>
    {RESOURCES.map(([k, label]) => <Counter key={k} label={label} value={value(k)} max={max[k]} canEdit={canEdit && !closed} onChange={v => change(k, v)} />)}
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
