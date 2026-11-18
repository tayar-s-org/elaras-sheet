import React, { useState } from 'react';
import { ATTRIBUTES, SKILLS } from '../../rules.js';
import { rollDice } from '../../lib/room.js';
import { ROOM_DICE, parseFormula, traitSpec, describeRoll } from '../../diceRoll.js';

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
        <div className="roll-detail">{d.detail}</div>
      </li>;
    })}
  </ol>;
}

export default function DicePanel({ tableId, me, members, characters, onRolled, disabled, settings, onSettings }) {
  const [formula, setFormula] = useState('1d20');
  const [mode, setMode] = useState('normal');
  const [visibility, setVisibility] = useState('public');
  const [traitKey, setTraitKey] = useState('attribute:Agilidade');
  const [modifier, setModifier] = useState(0);
  const [target, setTarget] = useState(4);
  const [wild, setWild] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mine = members.find(m => m.user_id === me);
  const character = mine?.character_id ? characters[mine.character_id] : null;

  async function run(spec, label = '', characterId = null) {
    setBusy(true);
    setError('');
    try { onRolled(await rollDice(tableId, spec, { label, visibility, characterId })); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const rollFormula = text => { try { run(parseFormula(text, mode)); } catch (e) { setError(e.message); } };
  const rollTrait = () => {
    const [type, ...rest] = traitKey.split(':');
    const name = rest.join(':');
    run(traitSpec({ type, name, wild, modifier: Number(modifier) || 0, target: Number(target) || 4 }), name, character.id);
  };

  return <div className="dice-panel">
    <div className="dice-buttons" role="group" aria-label="Dados">
      {ROOM_DICE.map(s => <button key={s} className="outline" disabled={disabled || busy} onClick={() => rollFormula(`1d${s}`)}>d{s}</button>)}
    </div>
    <form className="row" onSubmit={e => { e.preventDefault(); rollFormula(formula); }}>
      <input aria-label="Fórmula" value={formula} maxLength={80} onChange={e => setFormula(e.target.value)} placeholder="2d6+3, 1d20 vantagem" />
      <button className="primary" disabled={disabled || busy}>Rolar</button>
    </form>
    <div className="form-grid compact">
      <label className="field"><span>Modo</span>
        <select value={mode} onChange={e => setMode(e.target.value)}>
          <option value="normal">Normal</option><option value="advantage">Vantagem</option><option value="disadvantage">Desvantagem</option>
        </select></label>
      <label className="field"><span>Quem vê</span>
        <select value={visibility} onChange={e => setVisibility(e.target.value)}>
          <option value="public">Todos</option><option value="gm">Só o mestre</option>
        </select></label>
    </div>
    <fieldset className="trait-roll">
      <legend>Rolar da ficha (Savage Worlds)</legend>
      {!character ? <p className="muted">Vincule uma ficha sua em "Gerenciar mesa" para rolar atributos e perícias.</p> : <>
        <p className="muted">{character.name || 'Sem nome'}</p>
        <label className="field"><span>Atributo ou perícia</span>
          <select value={traitKey} onChange={e => setTraitKey(e.target.value)}>
            <optgroup label="Atributos">{ATTRIBUTES.map(a => <option key={a} value={`attribute:${a}`}>{a}</option>)}</optgroup>
            <optgroup label="Perícias">{SKILLS.map(([s]) => <option key={s} value={`skill:${s}`}>{s}</option>)}</optgroup>
          </select></label>
        <div className="form-grid compact">
          <label className="field"><span>Modificador</span>
            <input type="number" min="-20" max="20" value={modifier} onChange={e => setModifier(e.target.value)} /></label>
          <label className="field"><span>Dificuldade</span>
            <input type="number" min="2" max="30" value={target} onChange={e => setTarget(e.target.value)} /></label>
        </div>
        <label className="field"><span><input type="checkbox" checked={wild} onChange={e => setWild(e.target.checked)} /> Dado selvagem (d6)</span></label>
        <button className="primary" disabled={disabled || busy} onClick={rollTrait}>Rolar {traitKey.split(':').slice(1).join(':')}</button>
      </>}
    </fieldset>
    <div className="dice-options">
      <label className="check"><input type="checkbox" checked={Boolean(settings?.anim)} onChange={e => onSettings?.({ anim: e.target.checked })} /> Animação 3D no tabuleiro</label>
      <label className="check"><input type="checkbox" checked={Boolean(settings?.sound)} disabled={!settings?.anim} onChange={e => onSettings?.({ sound: e.target.checked })} /> Som dos dados</label>
    </div>
    {error && <p role="alert" className="muted">{error}</p>}
  </div>;
}
