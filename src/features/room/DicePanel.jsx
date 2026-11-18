import React, { useState } from 'react';
import { ATTRIBUTES, SKILLS } from '../../rules.js';
import { rollDice } from '../../lib/room.js';
import { ROOM_DICE, parseFormula, traitSpec, describeRoll } from '../../diceRoll.js';
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

  const off = disabled || busy;
  return <div className="dice2">
    <section className="dice2-section" aria-label="Rolagem rápida">
      <h4 className="dice2-title">Rolagem rápida</h4>
      <div className="dice2-grid" role="group" aria-label="Dados">
        {ROOM_DICE.map(sides => <button key={sides} type="button" className="dice2-die" disabled={off} onClick={() => rollFormula(`1d${sides}`)}>d{sides}</button>)}
      </div>
      <form className="dice2-formula" onSubmit={e => { e.preventDefault(); rollFormula(formula); }}>
        <input aria-label="Fórmula" value={formula} maxLength={80} onChange={e => setFormula(e.target.value)} placeholder="2d6+3, 1d20 vantagem" />
        <button className="primary" disabled={off}>Rolar</button>
      </form>
      <div className="dice2-label"><span>Modo</span>
        <div className="seg" role="group" aria-label="Modo">
          {[['normal', 'Normal'], ['advantage', 'Vantagem'], ['disadvantage', 'Desvantagem']].map(([v, l]) => <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)}>{l}</button>)}
        </div></div>
    </section>

    <section className="dice2-section" aria-label="Rolar da ficha">
      <h4 className="dice2-title">Rolar da ficha (Savage Worlds)</h4>
      {!character ? <p className="muted">Vincule uma ficha sua na aba "Mesa" para rolar atributos e perícias.</p> : <>
        <div className="dice2-char">{character.name || 'Sem nome'}</div>
        <label className="dice2-label"><span>Atributo ou perícia</span>
          <select value={traitKey} onChange={e => setTraitKey(e.target.value)}>
            <optgroup label="Atributos">{ATTRIBUTES.map(a => <option key={a} value={`attribute:${a}`}>{a}</option>)}</optgroup>
            <optgroup label="Perícias">{SKILLS.map(([name]) => <option key={name} value={`skill:${name}`}>{name}</option>)}</optgroup>
          </select></label>
        <div className="dice2-row2">
          <label className="dice2-label"><span>Modificador</span>
            <input type="number" min="-20" max="20" value={modifier} onChange={e => setModifier(e.target.value)} /></label>
          <label className="dice2-label"><span>Dificuldade</span>
            <input type="number" min="2" max="30" value={target} onChange={e => setTarget(e.target.value)} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={wild} onChange={e => setWild(e.target.checked)} /> Dado selvagem (d6)</label>
        <button type="button" className="primary dice2-roll-big" disabled={off} onClick={rollTrait}>Rolar {traitKey.split(':').slice(1).join(':')}</button>
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
