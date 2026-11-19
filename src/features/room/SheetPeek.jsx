import React from 'react';
import { ATTRIBUTES, calculate, validateCharacter } from '../../rules.js';
import { safeMaxima } from './vitals.js';
import VitalBars from './VitalBars.jsx';
import { incapacitation, steppedDie, effectiveMovement } from '../../incapacitation.js';
import IncapPanel from './IncapPanel.jsx';
import MoneyTag from '../../ui/MoneyTag.jsx';
import { resolveItem } from '../../market/items.js';
import { itemEffects } from '../../market/effects.js';

// "d8" ou, com a penalidade de incapacitação, "d6 (d8)"; o d4 é o menor dado (nunca vira d4−2).
function DieText({ die, steps, kind, bonus = 0 }) {
  const eff = steppedDie(die, steps, kind, bonus);
  const label = `d${eff.die}${eff.bonus ? eff.bonus : ''}`.replace('-', '−');
  // Boolean(...): sem ele, bonus 0 faria o React escrever um "0" depois do dado (d4 virava d40).
  const was = `d${die}${die === 12 && bonus > 0 ? `+${bonus}` : ''}`;
  return <b>{label}{Boolean(eff.die !== die || eff.bonus !== (die === 12 ? bonus : 0)) && <small> ({was})</small>}</b>;
}
import './peek.css';
import AptitudeSummary from '../routine/AptitudeSummary.jsx';

// Bônus de rolagem de itens equipados ao lado do dado.
const Bonus = ({ value }) => (value ? <small className="peek-bonus"> ({value > 0 ? `+${value}` : `−${Math.abs(value)}`})</small> : null);
const fmtKg = n => `${(Math.round(n * 100) / 100).toString().replace('.', ',')} kg`;
const Pill = ({ label, value, tone }) => <span className={`peek-pill${tone ? ` ${tone}` : ''}`}>{label}{value ? <b>{value}</b> : null}</span>;
// Item que abre ao clicar e mostra a descrição ou o efeito (igual ao cartão da ficha).
const Detail = ({ label, value, tone, children }) => <details className="peek-detail"><summary><Pill label={label} value={value} tone={tone} /></summary><div className="peek-detail-body">{children}</div></details>;
const Lines = ({ lines, notes, empty = 'Sem descrição.' }) => (lines?.length || notes ? <>{lines?.length ? <ul>{lines.map(l => <li key={l}>{l}</li>)}</ul> : null}{notes ? <p>{notes}</p> : null}</> : <p className="muted">{empty}</p>);
// Vantagens repetidas aparecem uma vez só, com o multiplicador (Nome ×2).
const grouped = list => {
  const map = new Map();
  for (const a of list) {
    const name = a.name || 'Sem nome';
    const key = name.trim().toLowerCase();
    const prev = map.get(key);
    map.set(key, prev ? { ...prev, n: prev.n + 1, description: prev.description || a.description } : { name, n: 1, power: a.power, description: a.description });
  }
  return [...map.values()];
};

// Resumo da ficha mostrado no canto do tabuleiro quando se clica no token de um personagem.
// limited: visão dos outros jogadores (só nome, descrição e barras de Vida, Stamina e Mana; sem dinheiro nem o resto da ficha).
// mine: o token é do próprio jogador (só ele vê a própria mana; os outros jogadores não).
export default function SheetPeek({ data, state, onClose, limited = false, mine = false, aptitude = null }) {
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
    <VitalBars state={state} max={max} showMana={!limited || mine} />
    {limited ? null : <>
    <IncapPanel state={state} max={max} baseMovement={d.movement} compact />
    <div className="peek-stats">
      {[['Movimento', effectiveMovement(d.movement, inc.movePenalty)], ['Aparar', d.parry], ['Resistência', d.toughness]].map(([k, v]) => <span key={k}><small>{k}</small><b>{v}</b></span>)}
    </div>
    <h5>Atributos</h5>
    <div className="peek-grid">{ATTRIBUTES.map(n => <span key={n}>{n} <DieText die={c.attributes[n]} bonus={c.bonuses?.attributes?.[n] || 0} steps={inc.dieSteps} kind="attribute" /><Bonus value={d.inventory.rollBonus.attribute[n]} /></span>)}</div>
    {skills.length > 0 && <>
      <h5>Perícias</h5>
      <div className="peek-grid">{skills.map(([n, die]) => <span key={n}>{n} <DieText die={die} bonus={c.bonuses?.skills?.[n] || 0} steps={inc.dieSteps} kind="skill" /><Bonus value={d.inventory.rollBonus.skill[n]} /></span>)}</div>
    </>}
    {c.advantages.length > 0 && <>
      <h5>Vantagens</h5>
      <div className="peek-details">{grouped(c.advantages).map(a => <Detail key={a.name} label={a.name} value={a.n > 1 ? `×${a.n}` : ''} tone={a.power ? 'power' : ''}><Lines notes={a.description} /></Detail>)}</div>
    </>}
    {c.hindrances.length > 0 && <>
      <h5>Complicações</h5>
      <div className="peek-details">{c.hindrances.map((h, i) => <Detail key={i} label={h.name || 'Sem nome'} value={h.severity} tone={h.severity === 'Maior' ? 'major' : 'minor'}><Lines notes={h.description} /></Detail>)}</div>
    </>}
    {gear.length > 0 && <>
      <h5>Equipamento</h5>
      <div className="peek-details">{gear.filter(g => g.equipped).map(g => <Detail key={g.id} label={g.name} value={g.qty > 1 ? `×${g.qty}` : ''} tone="power"><Lines {...itemEffects(resolveItem(g))} empty="Sem efeito em regras." /></Detail>)}</div>
      {gear.some(g => !g.equipped) && <>
        <h5>Mochila</h5>
        <div className="peek-details">{gear.filter(g => !g.equipped).map(g => <Detail key={g.id} label={g.name} value={g.qty > 1 ? `×${g.qty}` : ''}><Lines {...itemEffects(resolveItem(g))} empty="Sem efeito em regras." /></Detail>)}</div>
      </>}
      <p className="muted peek-load">Carga {fmtKg(d.inventory.weight)} / {fmtKg(d.inventory.capacity)}{d.inventory.overload ? ` · sobrecarga −${d.inventory.overload} de Movimento` : ''}</p>
    </>}
    {c.powers.length > 0 && <>
      <h5>Poderes</h5>
      <div className="peek-details">{c.powers.map((p, i) => <Detail key={i} label={p.name || 'Sem nome'} value={p.cost} tone="power">
        <ul className="peek-facts"><li><i>Custo de mana</i> {p.cost || '—'}</li><li><i>Dano</i> {p.damage || '—'}</li><li><i>Distância</i> {p.range || '—'}</li><li><i>Duração</i> {p.duration || '—'}</li></ul>
        {p.description ? <p>{p.description}</p> : <p className="muted">Sem descrição.</p>}
        {p.upgrades?.length ? <ul>{p.upgrades.map(u => <li key={u.n}><b>Melhoria {u.n}:</b> {u.description}</li>)}</ul> : null}
      </Detail>)}</div>
      {c.powers.some(p => p.upgrades?.length) && <ul className="peek-upgrades">{c.powers.flatMap((p, i) => (p.upgrades || []).map(u => <li key={`${i}-${u.n}`}><b>{p.name || 'Feitiço'} · melhoria {u.n}:</b> {u.description}</li>))}</ul>}
    </>}
    {!limited && <AptitudeSummary apt={aptitude} compact />}
    </>}
  </aside>;
}
