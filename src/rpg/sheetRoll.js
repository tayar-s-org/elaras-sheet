// Rolagem da ficha na sala: lista só o que o personagem TEM (atributos e perícias treinadas), com o dado que ele
// realmente rola (já com a incapacitação) e todos os bônus que entram na conta, cada um com a sua origem.
// Lógica pura, conferida em sheetRoll.test.js. O sorteio continua no servidor (RPC roll_dice).
import { ATTRIBUTES, SKILLS, calculate, validateCharacter } from '../rules.js';
import { racialEffects } from '../templates.js';
import { incapacitation, steppedDie } from '../incapacitation.js';
import { readDie } from './dice.js';
import { resolveItem } from '../market/items.js';
import { edgeParts, hindranceParts } from './edgeBonuses.js';

const ATTRIBUTE_ORDER = ATTRIBUTES;

// Bônus de itens equipados, um por item (mesma regra de inventoryEffects: só equipados, valor por entrada).
function itemParts(c, kind, name) {
  const parts = [];
  for (const entry of c.inventory || []) {
    if (!entry.equipped) continue;
    const item = resolveItem(entry);
    if (!item) continue;
    for (const e of item.customEffects || []) {
      if (e.kind === kind && e.target === name && e.bonus) parts.push({ label: item.name || 'Item', value: e.bonus, source: 'item' });
    }
  }
  return parts;
}

// Bônus de raça que valem sempre (Sáurio: +2 em Perceber) e os que dependem da situação (Rakashano: +2 ao escalar).
// Os dados-base da raça (d6 em Agilidade, Vigor...) já estão gravados nos dados da ficha, então não entram de novo aqui.
function racialParts(c, kind, name) {
  const racial = racialEffects(c);
  const race = c.raceId || c.race || 'Raça';
  const always = [];
  const optional = [];
  if (kind === 'skill' && name === 'Perceber' && racial.notice) always.push({ label: `Raça (${race})`, value: racial.notice, source: 'race' });
  if (kind === 'skill' && name === 'Escalar' && racial.climb) optional.push({ id: 'climb', label: 'Garras em superfície apropriada', value: racial.climb, source: 'race' });
  // Carisma entra em Persuadir e Manha. Sáurio sofre −2 sempre; Androide, Meio-elfo e Meio-orc só diante de outras raças.
  if (kind === 'skill' && (name === 'Persuadir' || name === 'Manha')) {
    const id = c.raceId;
    if (id === 'Sáurio') always.push({ label: `Carisma (Raça ${race})`, value: racial.charisma, source: 'race' });
    else if (racial.charisma) optional.push({ id: 'race-charisma', label: `Carisma (Raça ${race}, diante de outras raças)`, value: racial.charisma, source: 'race' });
    if (id === 'Rakashano') {
      optional.push({ id: 'race-bloody', label: 'Carisma (Raça Rakashano, Sanguinário diante dos mais civilizados)', value: -4, source: 'race' });
      optional.push({ id: 'race-enemy', label: 'Carisma (Raça Rakashano, Inimigo Racial)', value: -4, source: 'race' });
    }
  }
  return { always, optional };
}

const dieLabel = ({ die, bonus }) => `d${die}${bonus > 0 ? `+${bonus}` : ''}`;

// Atributo ligado a cada perícia (livro e personalizadas), para as regras que afetam "perícias de Astúcia".
const BOOK_ATTR = Object.fromEntries(SKILLS);
const attrOf = c => name => BOOK_ATTR[name] || c.customSkills?.find(s => s.name === name)?.attr || '';

function build(c, kind, name, steps) {
  const base = readDie(c, kind, name);
  const eff = steppedDie(base.die, steps, kind === 'skill' ? 'skill' : 'attribute', base.bonus);
  const stepped = eff.die !== base.die || eff.bonus !== base.bonus;
  // d12+N: a incapacitação desce a escada inteira (d12+2 → d12+1 → d12 → d10), então o +N que vale é o do dado já reduzido.
  // O servidor soma esse bônus sozinho (a partir da ficha); por isso ele NÃO entra no modificador enviado.
  const evolution = eff.bonus;
  const racial = racialParts(c, kind, name);
  const edges = edgeParts(c.advantages, kind === 'skill' ? 'skill' : 'attribute', name, attrOf(c));
  const hindrances = hindranceParts(c.hindrances, kind === 'skill' ? 'skill' : 'attribute', name, attrOf(c));
  const parts = [
    ...itemParts(c, kind, name),
    ...racial.always,
    ...edges.always,
    ...hindrances.always,
    ...(evolution ? [{ label: `Evolução (d12+${evolution})`, value: evolution, source: 'evolution' }] : []),
  ];
  return {
    key: `${kind === 'skill' ? 'skill' : 'attribute'}:${name}`,
    type: kind === 'skill' ? 'skill' : 'attribute',
    name,
    baseDie: base.die,
    baseBonus: base.bonus,
    baseLabel: dieLabel(base),
    currentLabel: dieLabel(eff),
    die: eff.die,
    stepped,
    evolution,
    // "d8", ou "d6 (d8)" quando a incapacitação reduziu o dado.
    label: stepped ? `${dieLabel(eff)} (${dieLabel(base)})` : dieLabel(eff),
    parts,
    optional: [...racial.optional, ...edges.optional, ...hindrances.optional],
    autoBonus: parts.reduce((sum, p) => sum + p.value, 0),
  };
}

// data: ficha (JSON salvo); state: estado da mesa ({ life, stamina, ... }) para a incapacitação.
export function rollableTraits(data, state) {
  const c = validateCharacter(data);
  const d = calculate(c);
  const inc = incapacitation(state, { life: d.life, stamina: d.stamina });
  const attributes = ATTRIBUTE_ORDER.map(name => build(c, 'attribute', name, inc.dieSteps));
  const custom = new Set(c.customSkills.map(s => s.name));
  const skills = Object.entries(c.skills)
    .filter(([, die]) => die > 0)
    .map(([name]) => ({ ...build(c, 'skill', name, inc.dieSteps), custom: custom.has(name) }));
  const book = skills.filter(s => !s.custom);
  const extra = skills.filter(s => s.custom);
  return { attributes, skills: book, customSkills: extra, incapacitation: inc, character: c };
}

// Bônus finais da rolagem: automáticos + condicionais marcados + modificador situacional digitado.
// Mantém `source` para a tela distinguir o que é enviado no modificador do que o servidor soma por conta própria.
export function rollBonuses(trait, { optionalIds = [], manual = 0 } = {}) {
  const bonuses = [
    ...trait.parts,
    ...trait.optional.filter(o => optionalIds.includes(o.id)),
  ].map(({ label, value, source }) => ({ label, value, source }));
  const extra = Math.trunc(Number(manual) || 0);
  if (extra) bonuses.push({ label: 'Modificador situacional', value: extra, source: 'manual' });
  return bonuses;
}

// O que vai no `modifier` da rolagem: tudo menos o bônus de evolução (d12+N), que o servidor lê da ficha e soma.
export const modifierBonuses = bonuses => bonuses.filter(b => b.source !== 'evolution');
