import React from 'react';
import { ATTRIBUTES, calculate, validateCharacter } from '../../rules.js';
import { RESOURCES, safeMaxima, level, LEVEL_TEXT, currentValue } from './vitals.js';
import { incapacitation, steppedDie, effectiveMovement } from '../../incapacitation.js';
import IncapPanel from './IncapPanel.jsx';
import MoneyTag from '../../ui/MoneyTag.jsx';
import { resolveItem } from '../../market/items.js';

// "d8" ou, com a penalidade de incapacitação, "d6 (d8)"; perícia abaixo de d4 vira "d4−2".
function DieText({ die, steps, kind }) {
  const eff = steppedDie(die, steps, kind);
  const label = `d${eff.die}${eff.bonus ? eff.bonus : ''}`.replace('-', '−');
  // Boolean(...): sem ele, bonus 0 faria o React escrever um "0" depois do dado (d4 virava d40).
  return <b>{label}{Boolean(eff.die !== die || eff.bonus) && <small> (d{die})</small>}</b>;
}
import './peek.css';

// Bônus de rolagem de itens equipados ao lado do dado.
const Bonus = ({ value }) => (value ? <small className="peek-bonus"> ({value > 0 ? `+${value}` : `−${Math.abs(value)}`})</small> : null);
const fmtKg = n => `${(Math.round(n * 100) / 100).toString().replace('.', ',')} kg`;
const Pill = ({ label, value, tone }) => <span className={`peek-pill${tone ? ` ${tone}` : ''}`}>{label}{value ? <b>{value}</b> : null}</span>;
// Vantagens repetidas aparecem uma vez só, com o multiplicador (Nome ×2).
const grouped = list => {
  const map = new Map();
  for (const a of list) {
    const name = a.name || 'Sem nome';
    const key = name.trim().toLowerCase();
    const prev = map.get(key);
    map.set(key, prev ? { ...prev, n: prev.n + 1 } : { name, n: 1, power: a.power });
  }
  return [...map.values()];
};

// Resumo da ficha mostrado no canto do tabuleiro quando se clica no token de um personagem.
// limited: visão dos jogadores (inclusive do próprio token) (só nome, descrição e barras de Vida, Stamina e Mana; sem dinheiro nem o resto da ficha).
export default function SheetPeek({ data, state, onClose, limited = false }) {
  let c, d;
  try { c = validateCharacter(data); d = calculate(c); } catch { return null; }
  const max = safeMaxima(data);
  const inc = incapacitation(state, max);
  const skills = Object.entries(c.skills).filter(([, die]) => die > 0);
  const gear = c.inventory.map(e => ({ ...e, name: resolveItem(e)?.name })).filter(e => e.name);
  return <aside className="sheet-peek" aria-label={`Ficha de ${c.name || 'personagem'}`}>
    <button type="button" className="peek-close" aria-label="Fechar resumo da ficha" onClick={onClose}>×</button>
    <h4>{c.name || 'Sem nome'}</h4>
    <p className="muted">{[c.race, c.concept, `Nível ${d.level}`, `${c.xp} XP`].filter(Boolean).join(' · ')}</p>
    {!limited && <MoneyTag value={c.money} />}
    <div className="peek-vitals">
      {RESOURCES.map(([k, label]) => {
        const mana = k === 'mana';
        const value = currentValue(state, max, k);
        const lvl = level(value, max[k], mana);
        return <div key={k} className="peek-vital">
          <div className="peek-vital-head">
            <span>{label}</span>
            <span className={`chip l${lvl}`}>{LEVEL_TEXT[mana ? 'mana' : 'normal'][lvl]}</span>
            <strong>{value}<small>/{max[k]}</small></strong>
          </div>
          <div className={`res-bar${mana ? ' mana' : ''}`} aria-hidden="true"><i style={{ width: `${max[k] ? Math.min(100, (value / max[k]) * 100) : 0}%` }} /></div>
        </div>;
      })}
    </div>
    {limited ? null : <>
    <IncapPanel state={state} max={max} baseMovement={d.movement} compact />
    <div className="peek-stats">
      {[['Movimento', effectiveMovement(d.movement, inc.movePenalty)], ['Aparar', d.parry], ['Resistência', d.toughness]].map(([k, v]) => <span key={k}><small>{k}</small><b>{v}</b></span>)}
    </div>
    <h5>Atributos</h5>
    <div className="peek-grid">{ATTRIBUTES.map(n => <span key={n}>{n} <DieText die={c.attributes[n]} steps={inc.dieSteps} kind="attribute" /><Bonus value={d.inventory.rollBonus.attribute[n]} /></span>)}</div>
    {skills.length > 0 && <>
      <h5>Perícias</h5>
      <div className="peek-grid">{skills.map(([n, die]) => <span key={n}>{n} <DieText die={die} steps={inc.dieSteps} kind="skill" /><Bonus value={d.inventory.rollBonus.skill[n]} /></span>)}</div>
    </>}
    {c.advantages.length > 0 && <>
      <h5>Vantagens</h5>
      <div className="peek-pills">{grouped(c.advantages).map(a => <Pill key={a.name} label={a.name} value={a.n > 1 ? `×${a.n}` : ''} tone={a.power ? 'power' : ''} />)}</div>
    </>}
    {c.hindrances.length > 0 && <>
      <h5>Complicações</h5>
      <div className="peek-pills">{c.hindrances.map((h, i) => <Pill key={i} label={h.name || 'Sem nome'} value={h.severity} tone={h.severity === 'Maior' ? 'major' : 'minor'} />)}</div>
    </>}
    {gear.length > 0 && <>
      <h5>Equipamento</h5>
      <div className="peek-pills">{gear.filter(g => g.equipped).map(g => <Pill key={g.id} label={g.name} value={g.qty > 1 ? `×${g.qty}` : ''} tone="power" />)}</div>
      {gear.some(g => !g.equipped) && <>
        <h5>Mochila</h5>
        <div className="peek-pills">{gear.filter(g => !g.equipped).map(g => <Pill key={g.id} label={g.name} value={g.qty > 1 ? `×${g.qty}` : ''} />)}</div>
      </>}
      <p className="muted peek-load">Carga {fmtKg(d.inventory.weight)} / {fmtKg(d.inventory.capacity)}{d.inventory.overload ? ` · sobrecarga −${d.inventory.overload} de Movimento` : ''}</p>
    </>}
    {c.powers.length > 0 && <>
      <h5>Poderes</h5>
      <div className="peek-pills">{c.powers.map((p, i) => <Pill key={i} label={p.name || 'Sem nome'} value={p.cost} tone="power" />)}</div>
    </>}
    </>}
  </aside>;
}
