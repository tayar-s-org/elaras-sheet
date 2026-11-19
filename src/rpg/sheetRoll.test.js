import test from 'node:test';
import assert from 'node:assert/strict';
import { newCharacter } from '../rules.js';
import { applyRace } from '../templates.js';
import { customEntry } from '../market/custom.js';
import { addCustomEntries, toggleEquip } from '../market/inventory.js';
import { rollableTraits, rollBonuses, modifierBonuses } from './sheetRoll.js';

const LISTS = { attributes: ['Agilidade', 'Astúcia', 'Espírito', 'Força', 'Vigor'], skills: ['Furtividade', 'Perceber', 'Escalar'] };
const RING = { id: '123e4567-e89b-12d3-a456-426614174000', name: 'Anel do lobo', weight: 0.2, description: '',
  effects: [{ kind: 'attribute', target: 'Força', bonus: 2 }, { kind: 'skill', target: 'Furtividade', bonus: 1 }] };

test('lista só atributos e perícias treinadas, com o dado que a ficha tem', () => {
  const c = { ...newCharacter(), skills: { Furtividade: 8, Perceber: 6 } };
  const t = rollableTraits(c);
  assert.deepEqual(t.attributes.map(a => a.name), ['Agilidade', 'Astúcia', 'Espírito', 'Força', 'Vigor']);
  assert.equal(t.skills.find(s => s.name === 'Furtividade').label, 'd8');
  assert.equal(t.skills.find(s => s.name === 'Perceber').label, 'd6');
  assert.equal(t.skills.some(s => s.name === 'Lutar'), false, 'perícia sem treino não aparece');
});

test('itens equipados entram por item; na mochila não contam', () => {
  const entry = customEntry(RING, LISTS);
  let c = addCustomEntries(newCharacter(), [entry]);
  assert.equal(rollableTraits(c).attributes.find(a => a.name === 'Força').autoBonus, 0);
  c = toggleEquip({ ...c, skills: { Furtividade: 8 } }, entry.id);
  const t = rollableTraits(c);
  const strength = t.attributes.find(a => a.name === 'Força');
  assert.deepEqual(strength.parts, [{ label: 'Anel do lobo', value: 2, source: 'item' }]);
  assert.equal(t.skills.find(s => s.name === 'Furtividade').autoBonus, 1);
});

test('raça: Sáurio ganha +2 em Perceber sempre; Rakashano +2 em Escalar só se marcado; d6 racial já vem no dado', () => {
  let c = applyRace({ ...newCharacter(), skills: { Perceber: 6, Escalar: 6 } }, 'Sáurio');
  let t = rollableTraits(c);
  const notice = t.skills.find(s => s.name === 'Perceber');
  assert.equal(notice.autoBonus, 2);
  assert.equal(notice.parts[0].label, 'Raça (Sáurio)');
  c = applyRace({ ...newCharacter(), skills: { Escalar: 6 } }, 'Rakashano');
  t = rollableTraits(c);
  const climb = t.skills.find(s => s.name === 'Escalar');
  assert.equal(climb.autoBonus, 0);
  assert.equal(climb.optional[0].value, 2);
  assert.equal(rollBonuses(climb, { optionalIds: ['climb'] })[0].value, 2);
  assert.deepEqual(rollBonuses(climb, {}), []);
  assert.equal(t.attributes.find(a => a.name === 'Agilidade').label, 'd6', 'o d6 de Agilidade do Rakashano já está na ficha');
});

test('d12+N: a incapacitação desce a escada inteira (d12+2 → d12+1 → d12 → d10)', () => {
  const base = newCharacter();
  const c = { ...base, attributes: { ...base.attributes, Força: 12, Vigor: 8 }, skills: { Lutar: 12 }, bonuses: { skills: { Lutar: 2 }, attributes: { Força: 2 } } };
  const fight = state => rollableTraits(c, state).skills.find(s => s.name === 'Lutar');
  assert.equal(fight().label, 'd12+2');
  assert.equal(fight().autoBonus, 2);
  assert.equal(rollableTraits(c).attributes.find(a => a.name === 'Força').autoBonus, 2);
  // Vigor d8: vida 3 (na metade ou menos) => incapacitação 1 => um estágio
  const one = fight({ life: 3, stamina: 8 });
  assert.deepEqual([one.die, one.evolution, one.label, one.stepped], [12, 1, 'd12+1 (d12+2)', true]);
  // vida 1 (abaixo de 25%) + stamina 4 (na metade) => incapacitação 3 => dois estágios
  const two = fight({ life: 1, stamina: 4 });
  assert.deepEqual([two.die, two.evolution, two.label], [12, 0, 'd12 (d12+2)']);
  const sheet = { ...c, bonuses: { skills: { Lutar: 1 }, attributes: {} } };
  const three = rollableTraits(sheet, { life: 1, stamina: 4 }).skills.find(s => s.name === 'Lutar');
  assert.deepEqual([three.die, three.evolution], [10, 0], 'd12+1 com dois estágios: d12 e depois d10');
});

test('o d12+N não vai no modificador enviado (o servidor soma sozinho, senão contaria em dobro)', () => {
  const base = newCharacter();
  const c = { ...base, skills: { Lutar: 12 }, bonuses: { skills: { Lutar: 3 }, attributes: {} } };
  const fight = rollableTraits(c).skills.find(s => s.name === 'Lutar');
  const all = rollBonuses(fight, { manual: 1 });
  assert.deepEqual(all.map(b => b.value), [3, 1]);
  assert.deepEqual(modifierBonuses(all).map(b => b.value), [1]);
});

test('rollBonuses junta tudo e o modificador situacional', () => {
  const entry = customEntry(RING, LISTS);
  const c = toggleEquip(addCustomEntries({ ...newCharacter(), skills: { Furtividade: 8 } }, [entry]), entry.id);
  const stealth = rollableTraits(c).skills[0];
  const list = rollBonuses(stealth, { manual: -2 });
  assert.deepEqual(list.map(b => b.value), [1, -2]);
  assert.equal(list[1].label, 'Modificador situacional');
});

const withEdges = (names, skills = {}, extra = {}) => ({ ...newCharacter(), skills, advantages: names.map(name => ({ name, description: '', power: false })), ...extra });

test('vantagens do livro: bônus fixo entra sozinho, o situacional vira caixa', () => {
  const c = withEdges(['Ladrão', 'Prontidão', 'Furioso'], { Escalar: 8, Furtividade: 8, Perceber: 6, Lutar: 8 });
  const t = rollableTraits(c);
  const climb = t.skills.find(s => s.name === 'Escalar');
  assert.deepEqual(climb.parts.map(p => [p.label, p.value]), [['Vantagem Ladrão', 2]]);
  const sneak = t.skills.find(s => s.name === 'Furtividade');
  assert.equal(sneak.autoBonus, 0, 'Furtividade do Ladrão só vale em área urbana');
  assert.match(sneak.optional[0].label, /Ladrão \(em área urbana\)/);
  assert.equal(rollBonuses(sneak, { optionalIds: [sneak.optional[0].id] })[0].value, 2);
  assert.equal(t.skills.find(s => s.name === 'Perceber').autoBonus, 2);
  const fight = t.skills.find(s => s.name === 'Lutar');
  assert.equal(fight.autoBonus, 0);
  assert.match(fight.optional.find(o => /Furioso/.test(o.label)).label, /em fúria/);
  assert.ok(t.attributes.find(a => a.name === 'Força').optional.some(o => /Furioso/.test(o.label)));
});

test('vantagem repetida conta uma vez; a aprimorada substitui a básica; sem a vantagem não há bônus', () => {
  const twice = rollableTraits(withEdges(['Prontidão', 'prontidao'], { Perceber: 6 })).skills[0];
  assert.equal(twice.autoBonus, 2);
  const arma = rollableTraits(withEdges(['Arma Predileta', 'Arma Predileta Aprimorada'], { Lutar: 10 })).skills[0];
  assert.equal(arma.optional[0].value, 2);
  assert.match(arma.optional[0].label, /Arma Predileta Aprimorada/);
  const basic = rollableTraits(withEdges(['Arma Predileta'], { Lutar: 10 })).skills[0];
  assert.equal(basic.optional[0].value, 1);
  assert.equal(rollableTraits(withEdges([], { Perceber: 6 })).skills[0].parts.length, 0);
});

test('Impulso e Resistência Arcana valem para qualquer atributo ou perícia', () => {
  const t = rollableTraits(withEdges(['Impulso', 'Resistência Arcana', 'Resistência Arcana Aprimorada'], { Cavalgar: 6 }));
  for (const trait of [...t.attributes, ...t.skills]) {
    assert.ok(trait.optional.some(o => /Impulso/.test(o.label) && o.value === 2), trait.name);
    assert.ok(trait.optional.some(o => /Resistência Arcana/.test(o.label) && o.value === 4), trait.name);
  }
});

test('vantagem do livro e raça somam juntas em Perceber (Sáurio + Prontidão = +4)', () => {
  const c = applyRace(withEdges(['Prontidão'], { Perceber: 6 }), 'Sáurio');
  assert.equal(rollableTraits(c).skills.find(s => s.name === 'Perceber').autoBonus, 4);
});

const withHindrances = (list, skills = {}, extra = {}) => ({ ...newCharacter(), skills, hindrances: list.map(([name, severity = 'Menor']) => ({ name, description: '', severity })), ...extra });
const trait = (c, key) => [...rollableTraits(c).attributes, ...rollableTraits(c).skills].find(t => t.key === key);

test('complicações: penalidade fixa entra sozinha, a situacional vira caixa', () => {
  const c = withHindrances([['Desajeitado'], ['Sem Noção', 'Maior'], ['Um Braço Só', 'Maior'], ['Duro De Ouvido'], ['Covarde', 'Maior']],
    { Consertar: 6, Conhecimento: 6, Escalar: 6, Perceber: 6, Lutar: 6 });
  assert.deepEqual(trait(c, 'skill:Consertar').parts.map(p => [p.label, p.value]), [['Complicação Desajeitado', -2]]);
  assert.equal(trait(c, 'skill:Conhecimento').autoBonus, -2);
  assert.equal(trait(c, 'skill:Escalar').autoBonus, -4);
  const hear = trait(c, 'skill:Perceber');
  assert.equal(hear.autoBonus, 0);
  const deaf = hear.optional.find(o => /Duro De Ouvido/.test(o.label));
  assert.match(deaf.label, /\(para ouvir\)/);
  assert.equal(deaf.value, -2);
  assert.ok(trait(c, 'attribute:Espírito').optional.some(o => /Covarde/.test(o.label) && o.value === -2));
  assert.ok(trait(c, 'skill:Lutar').optional.some(o => /Um Braço Só/.test(o.label) && o.value === -4), 'qualquer tarefa de duas mãos');
  assert.ok(!trait(c, 'skill:Escalar').optional.some(o => /Um Braço Só/.test(o.label)), 'Escalar já tem a penalidade fixa');
});

test('Fobia muda com a gravidade; Duro de Ouvido maior (surdo) não tem número para somar', () => {
  assert.equal(trait(withHindrances([['Fobia', 'Menor']], { Lutar: 6 }), 'skill:Lutar').optional[0].value, -2);
  assert.equal(trait(withHindrances([['Fobia', 'Maior']], { Lutar: 6 }), 'skill:Lutar').optional[0].value, -4);
  assert.equal(trait(withHindrances([['Duro De Ouvido', 'Maior']], { Perceber: 6 }), 'skill:Perceber').optional.length, 0);
});

test('Carisma entra em Persuadir e Manha: Atraente/Carismático/Nobre somam, Muito Atraente substitui Atraente, Feio subtrai', () => {
  const edges = names => ({ advantages: names.map(name => ({ name, description: '', power: false })) });
  const sk = { Persuadir: 6, Manha: 6, Lutar: 6 };
  const c = { ...withHindrances([['Feio']], sk), ...edges(['Atraente', 'Carismático']) };
  assert.deepEqual(trait(c, 'skill:Persuadir').parts.map(p => p.value).sort(), [-2, 2, 2]);
  assert.equal(trait(c, 'skill:Manha').autoBonus, 2);
  assert.equal(trait(c, 'skill:Lutar').autoBonus, 0, 'Carisma não mexe em Lutar');
  const very = { ...withHindrances([], sk), ...edges(['Atraente', 'Muito Atraente']) };
  assert.deepEqual(trait(very, 'skill:Persuadir').parts.map(p => p.value), [4]);
  const nobre = { ...withHindrances([], sk), ...edges(['Nobre']) };
  assert.equal(trait(nobre, 'skill:Persuadir').autoBonus, 2);
});

test('Carisma da raça: Sáurio −2 sempre; Meio-orc −2 só diante de outras raças; Rakashano tem dois −4 opcionais', () => {
  const sk = { Persuadir: 6 };
  assert.equal(trait(applyRace({ ...newCharacter(), skills: sk }, 'Sáurio'), 'skill:Persuadir').autoBonus, -2);
  const orc = trait(applyRace({ ...newCharacter(), skills: sk }, 'Meio-orc'), 'skill:Persuadir');
  assert.equal(orc.autoBonus, 0);
  assert.equal(orc.optional[0].value, -2);
  assert.equal(trait(applyRace({ ...newCharacter(), skills: sk }, 'Rakashano'), 'skill:Persuadir').optional.filter(o => o.value === -4).length, 2);
});

test('penalidades das vantagens: Frenesi e Varredura somem com a versão Aprimorada; Coragem Líquida pega perícias de Astúcia e Agilidade', () => {
  const adv = names => ({ advantages: names.map(name => ({ name, description: '', power: false })) });
  const sk = { Lutar: 10, Consertar: 6, Escalar: 6 };
  assert.ok(trait({ ...newCharacter(), skills: sk, ...adv(['Frenesi']) }, 'skill:Lutar').optional.some(o => /Frenesi/.test(o.label) && o.value === -2));
  assert.ok(!trait({ ...newCharacter(), skills: sk, ...adv(['Frenesi', 'Frenesi Aprimorado']) }, 'skill:Lutar').optional.some(o => /Frenesi/.test(o.label)));
  const drunk = { ...newCharacter(), skills: sk, ...adv(['Coragem Líquida']) };
  const hasDrink = key => trait(drunk, key).optional.some(o => /Coragem Líquida/.test(o.label));
  assert.ok(hasDrink('attribute:Astúcia') && hasDrink('attribute:Agilidade'));
  assert.ok(hasDrink('skill:Consertar'), 'Consertar é Astúcia');
  assert.ok(hasDrink('skill:Lutar'), 'Lutar é Agilidade');
  assert.ok(!hasDrink('skill:Escalar') && !hasDrink('attribute:Força'), 'Escalar é Força');
});

test('penalidades somam com bônus no total e entram no que é enviado ao servidor', () => {
  const c = { ...withHindrances([['Desajeitado']], { Consertar: 8 }), advantages: [{ name: 'Senhor Conserta Tudo', description: '', power: false }] };
  const fix = trait(c, 'skill:Consertar');
  assert.equal(fix.autoBonus, 0, '+2 do Senhor Conserta Tudo e −2 do Desajeitado');
  const all = rollBonuses(fix, {});
  assert.deepEqual(modifierBonuses(all).map(b => b.value).sort(), [-2, 2]);
});
