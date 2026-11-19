import React, { useState } from 'react';
import { rollDice } from '../../lib/room.js';
import { ROOM_DICE, parseFormula, traitSpec, describeRoll } from '../../diceRoll.js';
import { rollableTraits, rollBonuses, modifierBonuses } from '../../rpg/sheetRoll.js';
import './roompanels.css';

const when = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function RollHistory({ rolls: all, hidden, members, me }) {
  const rolls = hidden?.size ? all.filter(r => !hidden.has(r.id)) : all;
  const names = Object.fromEntries(members.map(m => [m.user_id, m.profiles?.display_name || 'Jogador']));
  if (!rolls.length) return <p className="muted">Nenhuma rolagem ainda.</p>;
  return <ol className="roll-history" aria-label="Histórico de rolagens">
    {[...rolls].reverse().map(r => {
      const d = describeRoll(r);
      return <li key={r.id} className={`roll ${d.tone}`}>
        <div className="roll-head">
          <strong>{names[r.user_id] || 'Jogador'}</strong>
          <span className="muted">{when(r.created_at)}{r.visibility === 'gm' ? ' · só mestre' : ''}{r.user_id === me ? ' · você' : ''}</span>
        </div>
        <div className="roll-total"><b>{d.total}</b>{d.outcome && <span className="roll-outcome">{d.outcome}</span>}</div>
        <div className="muted">{r.label ? `${r.label} · ` : ''}{d.title}</div>
        <div className="roll-detail">{d.lines.map((line, i) => <span key={i} className="roll-step">{line}</span>)}</div>
      </li>;
    })}
  </ol>;
}

const signed = n => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

export default function DicePanel({ tableId, me, members, characters, states, onRolled, disabled, settings, onSettings }) {
  const [formula, setFormula] = useState('1d20');
  const [visibility, setVisibility] = useState('public');
  const [traitKey, setTraitKey] = useState('attribute:Agilidade');
  const [modifier, setModifier] = useState(0);
  const [optionalIds, setOptionalIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mine = members.find(m => m.user_id === me);
  const character = mine?.character_id ? characters[mine.character_id] : null;
  // Só o que a ficha tem: atributos e perícias treinadas (inclusive as personalizadas aprovadas), com o dado que vale agora.
  const traits = (() => {
    if (!character) return null;
    try { return rollableTraits(character.data, states?.[character.id]); } catch { return null; }
  })();
  const all = traits ? [...traits.attributes, ...traits.skills, ...traits.customSkills] : [];
  const trait = all.find(t => t.key === traitKey) || all[0] || null;
  const bonuses = trait ? rollBonuses(trait, { optionalIds: optionalIds.filter(id => trait.optional.some(o => o.id === id)), manual: modifier }) : [];
  const totalBonus = bonuses.reduce((n, b) => n + b.value, 0);
  // O servidor soma o d12+N da ficha por conta própria; só o resto vai no modificador.
  const sent = modifierBonuses(bonuses);

  async function run(spec, label = '', characterId = null) {
    setBusy(true);
    setError('');
    try { onRolled(await rollDice(tableId, spec, { label, visibility, characterId })); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const rollFormula = text => { try { run(parseFormula(text)); } catch (e) { setError(e.message); } };
  const rollTrait = () => {
    if (!trait) return;
    run(traitSpec({ type: trait.type, name: trait.name, modifier: sent.reduce((n, b) => n + b.value, 0), bonuses: sent }), trait.name, character.id);
  };
  const toggleOptional = id => setOptionalIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const option = t => `${t.name} · ${t.label}${t.autoBonus ? ` ${signed(t.autoBonus)}` : ''}`;

  const off = disabled || busy;
  return <div className="dice2">
    <section className="dice2-section" aria-label="Rolagem rápida">
      <h4 className="dice2-title">Rolagem rápida</h4>
      <div className="dice2-grid" role="group" aria-label="Dados">
        {ROOM_DICE.map(sides => <button key={sides} type="button" className="dice2-die" disabled={off} onClick={() => rollFormula(`1d${sides}`)}>d{sides}</button>)}
      </div>
      <form className="dice2-formula" onSubmit={e => { e.preventDefault(); rollFormula(formula); }}>
        <input aria-label="Fórmula" value={formula} maxLength={80} onChange={e => setFormula(e.target.value)} placeholder="2d6+3, 1d8!" />
        <button className="primary" disabled={off}>Rolar</button>
      </form>
    </section>

    <section className="dice2-section" aria-label="Rolar da ficha">
      <h4 className="dice2-title">Rolar da ficha</h4>
      {!character ? <p className="muted">Vincule uma ficha sua nos controles da mesa para rolar atributos e perícias. Para rolar por uma criatura, selecione-a no tabuleiro.</p>
        : !trait ? <p className="muted">Não consegui ler a ficha vinculada. Abra a ficha e confira se ela está salva.</p> : <>
        <div className="dice2-char">{character.name || 'Sem nome'}</div>
        <label className="dice2-label"><span>Atributo ou perícia</span>
          <select value={trait.key} onChange={e => { setTraitKey(e.target.value); setOptionalIds([]); }}>
            <optgroup label="Atributos">{traits.attributes.map(t => <option key={t.key} value={t.key}>{option(t)}</option>)}</optgroup>
            {traits.skills.length > 0 && <optgroup label="Perícias">{traits.skills.map(t => <option key={t.key} value={t.key}>{option(t)}</option>)}</optgroup>}
            {traits.customSkills.length > 0 && <optgroup label="Perícias personalizadas">{traits.customSkills.map(t => <option key={t.key} value={t.key}>{option(t)}</option>)}</optgroup>}
          </select></label>
        <div className="dice2-breakdown" aria-label={`Como ${trait.name} será rolado`}>
          <div className="dice2-die-line"><span>Dado</span><b>{trait.label}</b></div>
          {trait.stepped && <small className="dice2-incap">Incapacitação {traits.incapacitation.total}: o dado caiu de {trait.baseLabel} para {trait.currentLabel}.</small>}
          {bonuses.map((b, i) => <div key={i} className="dice2-bonus-line"><span>{b.label}</span><b>{signed(b.value)}</b></div>)}
          {!bonuses.length && <small className="muted">Sem bônus nem penalidades de itens, raça, vantagens, complicações ou evolução.</small>}
        </div>
        {trait.optional.map(o => <label key={o.id} className="check"><input type="checkbox" checked={optionalIds.includes(o.id)} onChange={() => toggleOptional(o.id)} /> {o.label} ({signed(o.value)})</label>)}
        <label className="dice2-label"><span>Modificador situacional</span>
          <input type="number" min="-20" max="20" value={modifier} onChange={e => setModifier(e.target.value)} /></label>
        <button type="button" className="primary dice2-roll-big" disabled={off} onClick={rollTrait}>Rolar {trait.name} ({trait.label}{totalBonus ? ` ${signed(totalBonus)}` : ''})</button>
      </>}
    </section>

    <section className="dice2-section" aria-label="Opções">
      <h4 className="dice2-title">Opções</h4>
      <div className="dice2-label"><span>Quem vê a rolagem</span>
        <div className="seg" role="group" aria-label="Quem vê">
          {[['public', 'Todos'], ['gm', 'Só o mestre']].map(([v, l]) => <button key={v} type="button" aria-pressed={visibility === v} onClick={() => setVisibility(v)}>{l}</button>)}
        </div></div>
      <div className="dice2-opts">
        <label className="check"><input type="checkbox" checked={Boolean(settings?.anim)} onChange={e => onSettings?.({ anim: e.target.checked })} /> Animação 3D no tabuleiro</label>
        <label className="check"><input type="checkbox" checked={Boolean(settings?.sound)} disabled={!settings?.anim} onChange={e => onSettings?.({ sound: e.target.checked })} /> Som dos dados</label>
      </div>
    </section>
    {error && <p role="alert" className="dice2-error">{error}</p>}
  </div>;
}
