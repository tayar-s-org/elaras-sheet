import React, { useState } from 'react';
import { saveState, sendMessage } from '../../lib/room.js';
import { RESOURCES, safeMaxima, level, LEVEL_TEXT, currentValue, baseMovement } from './vitals.js';
import { incapacitation } from '../../incapacitation.js';
import IncapPanel from './IncapPanel.jsx';
import MoneyTag from '../../ui/MoneyTag.jsx';
import MoneyGrant from './MoneyGrant.jsx';
import './party.css';

function Counter({ id, label, value, max, amount, canEdit, onChange }) {
  const mana = id === 'mana';
  const lvl = level(value, max, mana);
  return <div className="counter-wrap">
    <div className="counter">
      <span>{label}</span>
      <span className={`chip l${lvl}`}>{LEVEL_TEXT[mana ? 'mana' : 'normal'][lvl]}</span>
      {canEdit && <button className="outline" aria-label={`Tirar ${amount} de ${label}`} title={`Tirar ${amount}`} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - amount))}>−</button>}
      <strong>{value}<small>/{max}</small></strong>
      {canEdit && <button className="outline" aria-label={`Adicionar ${amount} a ${label}`} title={`Adicionar ${amount}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + amount))}>+</button>}
    </div>
    <div className={`res-bar${mana ? ' mana' : ''}`} aria-hidden="true"><i style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} /></div>
  </div>;
}

function CharacterCard({ member, row, state, canEdit, isGm, tableId, patchState, closed }) {
  const [error, setError] = useState('');
  const [amountText, setAmountText] = useState('1');
  const amount = Math.max(1, Math.min(999, Math.trunc(Number(amountText)) || 1));
  const max = safeMaxima(row.data);
  const value = k => currentValue(state, max, k);
  async function persist(next) {
    patchState(row.id, next);
    setError('');
    try { await saveState(tableId, row.id, next); } catch (e) { setError(e.message); }
  }
  async function change(k, v) {
    const base = { life: value('life'), stamina: value('stamina'), mana: value('mana'), [k]: v, max }; // max permite ao servidor registrar a primeira alteracao
    // O prazo/desmaio do mestre so vale enquanto o personagem continua na Incapacitação 4.
    const keep = state?.faint && incapacitation({ ...base, faint: state.faint }, max).total === 4;
    return persist(keep ? { ...base, faint: state.faint } : base);
  }
  async function setFaint(faint) {
    const wasFainted = Boolean(state?.faint?.fainted);
    await persist({ life: value('life'), stamina: value('stamina'), mana: value('mana'), max, faint });
    const who = row.name || 'O personagem';
    const text = faint.fainted ? `💤 ${who} desmaiou (Incapacitação 5).`
      : wasFainted ? `✨ ${who} foi reanimado.`
        : `⏳ ${who} está na Incapacitação 4: desmaia se passar ${faint.hours} h neste estado.`;
    sendMessage(tableId, text).catch(() => {});
  }
  return <article className="party-card">
    <h4>{row.name || 'Sem nome'}</h4>
    <p className="muted">{member.profiles?.display_name} · {row.data.race || 'Raça livre'}</p>
    <MoneyTag value={row.data?.money} />
    {canEdit && !closed && <label className="amount-field"><span>Quantidade por clique</span>
      <input type="number" inputMode="numeric" min="1" max="999" value={amountText} aria-label={`Quantidade para tirar ou adicionar (${row.name || 'personagem'})`}
        onChange={e => setAmountText(e.target.value)} onBlur={() => setAmountText(String(amount))} onFocus={e => e.target.select()} /></label>}
    {RESOURCES.map(([k, label]) => <Counter key={k} id={k} label={label} value={value(k)} max={max[k]} amount={amount} canEdit={canEdit && !closed} onChange={v => change(k, v)} />)}
    <IncapPanel state={state} max={max} baseMovement={baseMovement(row.data)} isGm={isGm} closed={closed} onFaint={setFaint} />
    {isGm && !closed && <MoneyGrant tableId={tableId} targets={[{ id: row.id, name: row.name }]} />}
    {error && <p role="alert" className="muted">{error}</p>}
  </article>;
}

export default function PartyPanel({ tableId, me, isGm, members, characters, states, patchState, closed }) {
  const rows = members.filter(m => m.status === 'approved' && m.character_id && characters[m.character_id]);
  const mine = rows.filter(m => m.user_id === me);
  const shown = isGm ? rows : rows;
  if (!shown.length) return <p className="muted">Nenhuma ficha vinculada à mesa ainda. Escolha a sua em "Gerenciar mesa".</p>;
  const moneyTargets = shown.filter(m => m.role === 'player').map(m => ({ id: characters[m.character_id].id, name: characters[m.character_id].name }));
  return <div className="party">
    {isGm && !closed && moneyTargets.length > 1 && <section className="party-card"><h4>Dinheiro para todos os jogadores</h4>
      <MoneyGrant tableId={tableId} targets={moneyTargets} label="Dinheiro para cada um" button="Dar a todos" removeButton="Remover de todos" /></section>}
    {[...mine, ...shown.filter(m => m.user_id !== me)].map(m => <CharacterCard key={m.user_id} member={m} row={characters[m.character_id]}
      state={states[m.character_id]} canEdit={isGm || m.user_id === me} isGm={isGm} tableId={tableId} patchState={patchState} closed={closed} />)}
  </div>;
}
