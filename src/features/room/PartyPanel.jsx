import React, { useState } from 'react';
import { saveState, sendMessage } from '../../lib/room.js';
import SheetViewModal from './SheetViewModal.jsx';
import { grantXp } from '../../lib/xp.js';
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
  const [viewing, setViewing] = useState(false);
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
    <div className="party-head">
      <h4>{row.name || 'Sem nome'}</h4>
      {canEdit && <button type="button" className="outline view-sheet-btn" onClick={() => setViewing(true)}>Ver ficha</button>}
    </div>
    <p className="muted">{member.profiles?.display_name} · {row.data.race || 'Raça livre'}</p>
    <MoneyTag value={row.data?.money} />
    {viewing && <SheetViewModal data={row.data} owner={member.profiles?.display_name} onClose={() => setViewing(false)} />}
    {canEdit && !closed && <label className="amount-field"><span>Quantidade por clique</span>
      <input type="number" inputMode="numeric" min="1" max="999" value={amountText} aria-label={`Quantidade para tirar ou adicionar (${row.name || 'personagem'})`}
        onChange={e => setAmountText(e.target.value)} onBlur={() => setAmountText(String(amount))} onFocus={e => e.target.select()} /></label>}
    {RESOURCES.filter(([k]) => k !== 'mana' || canEdit).map(([k, label]) => <Counter key={k} id={k} label={label} value={value(k)} max={max[k]} amount={amount} canEdit={canEdit && !closed} onChange={v => change(k, v)} />)}
    <IncapPanel state={state} max={max} baseMovement={baseMovement(row.data)} isGm={isGm} closed={closed} onFaint={setFaint} />
    {isGm && !closed && <MoneyGrant tableId={tableId} targets={[{ id: row.id, name: row.name }]} />}
    {isGm && !closed && <XpGrant tableId={tableId} targets={[{ id: row.id, name: row.name }]} label="Experiência (XP)" />}
    {error && <p role="alert" className="muted">{error}</p>}
  </article>;
}

// Mestre: concede XP a uma ficha (ou a todas). O jogador recebe na ficha dele; a mesa ve um aviso no chat.
function XpGrant({ tableId, targets, label }) {
  const [text, setText] = useState('1');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const amount = Math.trunc(Number(text));
  const valid = amount >= 1 && amount <= 10000;
  async function give(e) {
    e.preventDefault();
    if (!valid || busy || !targets.length) return;
    setBusy(true);
    setMsg('');
    try {
      for (const t of targets) await grantXp(tableId, t.id, amount);
      const who = targets.length === 1 ? (targets[0].name || 'um personagem') : 'todos os jogadores';
      sendMessage(tableId, `✨ O mestre concedeu +${amount} XP a ${who}.`).catch(() => {});
      setMsg(`+${amount} XP enviado${targets.length > 1 ? ' a todos' : ''}.`);
    } catch (err) { setMsg(err.message); }
    finally { setBusy(false); }
  }
  return <form className="xp-grant" onSubmit={give}>
    <label><span>{label}</span>
      <input type="number" min="1" max="10000" value={text} aria-label={label} onChange={e => setText(e.target.value)} onFocus={e => e.target.select()} /></label>
    <button className="outline" disabled={busy || !valid || !targets.length}>{busy ? 'Enviando…' : 'Dar XP'}</button>
    {msg && <small role="status" className="muted">{msg}</small>}
  </form>;
}

export default function PartyPanel({ tableId, me, isGm, members, characters, states, patchState, closed }) {
  const [picked, setPicked] = useState(null);
  const rows = members.filter(m => m.status === 'approved' && m.character_id && characters[m.character_id]);
  const mine = rows.filter(m => m.user_id === me);
  const shown = isGm ? rows : rows;
  if (!shown.length) return <p className="muted">Nenhuma ficha vinculada à mesa ainda. Escolha a sua em "Gerenciar mesa".</p>;
  const playerTargets = shown.filter(m => m.role === 'player').map(m => ({ id: characters[m.character_id].id, name: characters[m.character_id].name }));
  const moneyTargets = shown.filter(m => m.role === 'player').map(m => ({ id: characters[m.character_id].id, name: characters[m.character_id].name }));
  return <div className="party">
    {isGm && !closed && moneyTargets.length > 1 && <section className="party-card"><h4>Dinheiro para todos os jogadores</h4>
      <MoneyGrant tableId={tableId} targets={moneyTargets} label="Dinheiro para cada um" button="Dar a todos" removeButton="Remover de todos" /></section>}
    {isGm && !closed && playerTargets.length > 1 && <section className="party-card"><h4>XP para todos os jogadores</h4>
      <XpGrant tableId={tableId} targets={playerTargets} label="XP para cada um" /></section>}
    {(() => {
      // Uma aba por ficha da mesa (a sua primeiro), com o primeiro nome do personagem; só a ficha da aba escolhida aparece.
      const ordered = [...mine, ...shown.filter(m => m.user_id !== me)];
      const current = ordered.find(m => m.user_id === picked) || ordered[0];
      const firstName = m => (characters[m.character_id].name || '').trim().split(/\s+/)[0] || (m.profiles?.display_name || 'Jogador').split(/\s+/)[0];
      return <>
        <div className="tabs-row party-tabs" role="tablist" aria-label="Fichas da mesa">
          {ordered.map(m => <button key={m.user_id} type="button" role="tab" aria-selected={m.user_id === current.user_id}
            className={m.user_id === current.user_id ? 'primary' : 'outline'}
            title={`${characters[m.character_id].name || 'Sem nome'} · ${m.profiles?.display_name || 'Jogador'}`}
            onClick={() => setPicked(m.user_id)}>{firstName(m)}{m.user_id === me ? ' (você)' : ''}</button>)}
        </div>
        <CharacterCard key={current.user_id} member={current} row={characters[current.character_id]}
          state={states[current.character_id]} canEdit={isGm || current.user_id === me} isGm={isGm} tableId={tableId} patchState={patchState} closed={closed} />
      </>;
    })()}
  </div>;
}
