import test from 'node:test';
import assert from 'node:assert/strict';
import { readDie, describeDie, stepUp, rollDie } from './dice.js';
import { meditationSessionsPerDay, spellTrainingHoursPerDay } from './tiers.js';
import { xpCap, addXp, evolutionCost, spendXp, applyEvolution, BASE_XP_CAP } from './progression.js';
import {
  ACT, trainingStaminaCost, restPayout, restTotal, meditationRate, astuciaDiceFor, processHour, newDay, blockedReason,
} from './activities.js';
import { processTicks, statsFromCharacter, eventId } from './processor.js';
import { newCharacter, validateCharacter, calculate } from '../rules.js';

const stats = (over = {}) => ({
  maxStamina: 100, maxMana: 50, spirit: { die: 12, bonus: 0 }, conjurar: { die: 12, bonus: 0 }, meditar: { die: 12, bonus: 0 },
  skills: ['Atirar', 'Conjurar'], spells: [{ id: 's1', name: 'Fogo' }, { id: 's2', name: 'Gelo' }], trainedSpells: ['s1'], ...over,
});
const max = sides => sides;       // rng que sempre tira o maior valor
const rows = (n, row) => Array.from({ length: n }, () => row);
// Roda uma lista de linhas em horas seguidas do mesmo dia e devolve eventos e estado final.
function run(list, { st = stats(), start = {}, rng = max, fed = true } = {}) {
  let state = { stamina: start.stamina ?? st.maxStamina, mana: start.mana ?? st.maxMana };
  let day = null;
  const events = list.map(row => {
    const r = processHour({ dayNo: 0, row, fed, stats: st, state, day, rng });
    state = r.state; day = r.day;
    return r.event;
  });
  return { events, state, day };
}
const skill = (extra = {}) => ({ a: ACT.SKILL, skill: 'Atirar', mode: 'normal', ...extra });
const spell = (extra = {}) => ({ a: ACT.SPELL, spell: 's1', mode: 'normal', ...extra });
const total = (events, k) => events.reduce((s, e) => s + e[k], 0);

test('dados: d12+N é dado-base 12 com bônus separado; nunca vira D18/D24', () => {
  const c = { skills: { Atirar: 12, Lutar: 8 }, attributes: { Espírito: 12 }, bonuses: { skills: { Atirar: 2, Lutar: 3 }, attributes: {} } };
  assert.deepEqual(readDie(c, 'skill', 'Atirar'), { die: 12, bonus: 2 });
  assert.deepEqual(readDie(c, 'skill', 'Lutar'), { die: 8, bonus: 0 }, 'bônus só vale com d12');
  assert.equal(describeDie({ die: 12, bonus: 2 }), 'd12+2');
  assert.equal(describeDie({ die: 0 }), 'sem treino');
  assert.deepEqual(stepUp({ die: 12, bonus: 1 }), { die: 12, bonus: 2 });
  assert.deepEqual(stepUp({ die: 8, bonus: 0 }), { die: 10, bonus: 0 });
  assert.deepEqual(stepUp({ die: 0 }), { die: 4, bonus: 0 });
  assert.deepEqual(rollDie({ die: 12, bonus: 2 }, s => s), { face: 12, total: 14, sides: 12 }, 'rola 1d12 e soma o bônus');
  assert.deepEqual(rollDie({ die: 12, bonus: 2 }, () => 1), { face: 1, total: 3, sides: 12 });
  assert.equal(rollDie({ die: 0 }, () => 3).total, 1, 'sem treino: d4−2');
});

test('tabelas por dado-base: o bônus nunca muda a categoria', () => {
  assert.equal(meditationSessionsPerDay({ die: 6, bonus: 0 }), 1);
  assert.equal(meditationSessionsPerDay({ die: 12, bonus: 0 }), 2);
  assert.equal(meditationSessionsPerDay({ die: 12, bonus: 7 }), 2, 'd12+7 continua com 2 sessões');
  assert.equal(meditationSessionsPerDay({ die: 4, bonus: 0 }), 1, 'mínimo 1');
  assert.equal(meditationSessionsPerDay(18), 3, 'dado-base 18 (se existir) = 3 sessões');
  assert.equal(meditationSessionsPerDay(30), 5);
  assert.equal(spellTrainingHoursPerDay({ die: 6, bonus: 0 }), 3);
  assert.equal(spellTrainingHoursPerDay({ die: 12, bonus: 0 }), 6);
  assert.equal(spellTrainingHoursPerDay({ die: 12, bonus: 5 }), 6, 'd12+5 continua com 6 horas');
  assert.equal(spellTrainingHoursPerDay(24), 12);
  assert.equal(spellTrainingHoursPerDay({ die: 0 }), 0);
});

test('treinar perícia: estamina 1/2/4 por faixa (4h=4, 6h=8, 8h=12, 10h=20, 12h=28)', () => {
  assert.deepEqual([1, 4, 5, 8, 9, 12].map(trainingStaminaCost), [1, 1, 2, 2, 4, 4]);
  for (const [h, cost] of [[4, 4], [6, 8], [8, 12], [10, 20], [12, 28]]) {
    assert.equal(-total(run(rows(h, skill())).events, 'staminaDelta'), cost, `${h}h`);
  }
});

test('treinamento focado dobra a estamina e mantém o mesmo XP', () => {
  const n = run(rows(8, skill()));
  const f = run(rows(8, skill({ mode: 'focused' })));
  assert.equal(total(f.events, 'staminaDelta'), 2 * total(n.events, 'staminaDelta'));
  const xpOf = r => r.events.flatMap(e => e.xp).reduce((s, x) => s + x.amount, 0);
  assert.equal(xpOf(f), xpOf(n));
  assert.ok(f.events.every(e => e.xp.every(x => x.modality === 'focused')));
  assert.ok(n.events.every(e => e.xp.every(x => x.modality === 'normal')));
});

test('limite de 12 horas de treino por dia; a 13ª hora não tem efeito', () => {
  const r = run(rows(14, skill()));
  assert.equal(r.events.filter(e => e.ok).length, 12);
  assert.equal(r.events[12].ok, false);
  assert.match(r.events[12].reason, /12 horas/);
  assert.equal(r.events[12].staminaDelta, 0);
  assert.deepEqual(r.events[12].xp, []);
});

test('XP de perícia: +1 na perícia e +0,5 no atributo ligado; fracionário acumula', () => {
  const e = run([skill()]).events[0];
  assert.deepEqual(e.xp, [
    { kind: 'skill', name: 'Atirar', modality: 'normal', amount: 1 },
    { kind: 'attribute', name: 'Agilidade', modality: 'normal', amount: 0.5 },
  ]);
  const attr = run(rows(3, skill())).events.flatMap(x => x.xp).filter(x => x.kind === 'attribute').reduce((s, x) => s + x.amount, 0);
  assert.equal(attr, 1.5);
});

test('perícia fora da ficha ou não escolhida não treina', () => {
  assert.equal(run([skill({ skill: 'Furtividade' })]).events[0].ok, false);
  assert.equal(run([skill({ skill: '' })]).events[0].ok, false);
});

test('estamina em 1 ou menos bloqueia o treino sem custo nem XP', () => {
  const e = run([skill()], { start: { stamina: 1 } }).events[0];
  assert.equal(e.ok, false);
  assert.equal(e.staminaDelta, 0);
  assert.deepEqual(e.xp, []);
  assert.ok(blockedReason(ACT.SKILL, 1, 50));
  assert.equal(blockedReason(ACT.SKILL, 2, 0), '');
});

test('nenhuma hora de treino deixa a estamina abaixo de 1: o custo é limitado e a hora seguinte bloqueia', () => {
  const one = run([skill({ mode: 'focused' })], { start: { stamina: 2 } });
  assert.equal(one.events[0].ok, true, 'com 2 de estamina a hora acontece');
  assert.equal(one.events[0].staminaDelta, -1, 'o custo (2) é limitado ao que passa de 1');
  assert.equal(one.state.stamina, 1);
  const long = run(rows(12, skill({ mode: 'focused' })), { start: { stamina: 5 } });
  assert.ok(long.events.every(e => e.staminaAfter >= 1), 'nunca abaixo de 1');
  assert.equal(long.state.stamina, 1);
  assert.equal(long.events.filter(e => e.ok).length, 2, '5 → 3 → 1; com 1 de estamina as horas seguintes bloqueiam');
  assert.equal(run([skill()], { start: { stamina: 1.5 } }).state.stamina, 1);
});

test('treinar feitiço: 1 de mana por hora (2 se focado), limite = metade do dado-base de Conjurar', () => {
  const six = run(rows(8, spell()));
  assert.equal(six.events.filter(e => e.ok).length, 6, 'Conjurar d12 = 6 horas');
  assert.equal(-total(six.events, 'manaDelta'), 6);
  const focused = run(rows(3, spell({ mode: 'focused' })));
  assert.equal(-total(focused.events, 'manaDelta'), 6);
  const d6 = run(rows(5, spell()), { st: stats({ conjurar: { die: 6, bonus: 0 } }) });
  assert.equal(d6.events.filter(e => e.ok).length, 3);
  const bonus = run(rows(8, spell()), { st: stats({ conjurar: { die: 12, bonus: 4 } }) });
  assert.equal(bonus.events.filter(e => e.ok).length, 6, 'o bônus de Conjurar não aumenta as horas');
  const none = run(rows(2, spell()), { st: stats({ conjurar: { die: 0, bonus: 0 } }) });
  assert.equal(none.events.filter(e => e.ok).length, 0, 'sem Conjurar não treina feitiço');
});

test('treinar feitiço: XP +1 no feitiço, +0,5 em Conjurar, +0,25 em Espírito', () => {
  const e = run([spell()]).events[0];
  assert.deepEqual(e.xp, [
    { kind: 'spell', name: 's1', modality: 'normal', amount: 1 },
    { kind: 'skill', name: 'Conjurar', modality: 'normal', amount: 0.5 },
    { kind: 'attribute', name: 'Espírito', modality: 'normal', amount: 0.25 },
  ]);
  assert.equal(run([spell({ spell: 'nao-existe' })]).events[0].ok, false);
  assert.equal(run([spell()], { start: { mana: 1 } }).events[0].ok, false, 'mana em 1 bloqueia');
});

test('acumuladores normal e focado são independentes e respeitam o teto de 5.000', () => {
  assert.equal(BASE_XP_CAP, 5000);
  assert.equal(xpCap({}), 5000);
  assert.equal(xpCap({}, [cap => cap + 1000]), 6000, 'gancho futuro de Aptidão/Cultivo');
  const normal = { available: 4999, earned_total: 4999, spent_total: 0, discarded_total: 0 };
  const focused = { available: 100, earned_total: 100, spent_total: 0, discarded_total: 0 };
  const n2 = addXp(normal, 3);
  assert.equal(n2.pool.available, 5000);
  assert.equal(n2.discarded, 2);
  assert.equal(n2.pool.earned_total, 5002, 'o histórico conta tudo que foi conquistado');
  assert.equal(n2.pool.discarded_total, 2);
  const f2 = addXp(focused, 3);
  assert.equal(f2.pool.available, 103, 'o focado não ocupa espaço do normal e vice-versa');
  assert.equal(addXp(n2.pool, 10).kept, 0, 'cheio: nada entra');
});

test('XP disponível × total conquistada: gastar nunca reduz o total', () => {
  let pool = addXp({}, 250).pool;
  assert.equal(pool.available, 250);
  const spent = spendXp(pool, 100);
  assert.equal(spent.available, 150);
  assert.equal(spent.spent_total, 100);
  assert.equal(spent.earned_total, 250, 'earned_total intacto');
  assert.equal(spent.earned_total, spent.available + spent.spent_total + spent.discarded_total, 'invariante');
  assert.equal(spendXp(spent, 200), null, 'sem saldo');
  const capped = addXp({ available: 5000, earned_total: 5000, spent_total: 0, discarded_total: 0 }, 40).pool;
  assert.equal(capped.earned_total, capped.available + capped.spent_total + capped.discarded_total);
});

test('evolução: 100 por passo até d12+1, depois 200, 300, 400…', () => {
  assert.equal(evolutionCost({ die: 0 }), 100);
  assert.equal(evolutionCost({ die: 4 }), 100);
  assert.equal(evolutionCost({ die: 10 }), 100);
  assert.equal(evolutionCost({ die: 12, bonus: 0 }), 100, 'd12 → d12+1');
  assert.equal(evolutionCost({ die: 12, bonus: 1 }), 200, 'd12+1 → d12+2');
  assert.equal(evolutionCost({ die: 12, bonus: 2 }), 300);
  assert.equal(evolutionCost({ die: 12, bonus: 3 }), 400);
  assert.equal(evolutionCost({ die: 12, bonus: 4 }), 500);
});

test('aplicar evolução: passo de dado fica anotado; acima de d12 só o bônus sobe', () => {
  let c = validateCharacter(newCharacter());
  c.skills.Atirar = 10;
  c.attributes.Agilidade = 12;
  const before = calculate(c);
  c = applyEvolution(c, 'skill', 'Atirar');
  assert.equal(c.skills.Atirar, 12);
  assert.equal(c.evolved.skills.Atirar, 1);
  c = applyEvolution(c, 'attribute', 'Agilidade');
  assert.equal(c.attributes.Agilidade, 12, 'o dado-base continua 12');
  assert.deepEqual(readDie(c, 'attribute', 'Agilidade'), { die: 12, bonus: 1 });
  c = applyEvolution(c, 'attribute', 'Agilidade');
  assert.deepEqual(readDie(c, 'attribute', 'Agilidade'), { die: 12, bonus: 2 });
  assert.equal(c.evolved.attributes.Agilidade, undefined, 'passos de bônus não contam como passo de dado');
  const v = validateCharacter(c);
  assert.deepEqual(v.bonuses.attributes, { Agilidade: 2 }, 'o bônus sobrevive à validação da ficha');
  assert.equal(v.evolved.skills.Atirar, 1);
  assert.equal(calculate(v).skillCost, before.skillCost, 'evoluir com XP não gasta pontos de criação');
});

test('descanso completo: nada até a 3ª hora, 6 na 4ª (retroativo), +1,5 por hora, 12 h = 18', () => {
  assert.equal(restPayout(1), 0); assert.equal(restPayout(3), 0); assert.equal(restPayout(4), 6); assert.equal(restPayout(5), 1.5);
  assert.equal(restTotal(3), 0); assert.equal(restTotal(4), 6); assert.equal(restTotal(5), 7.5); assert.equal(restTotal(6), 9);
  assert.equal(restTotal(8), 12); assert.equal(restTotal(10), 15); assert.equal(restTotal(12), 18);
  const gain = h => run(rows(h, { a: ACT.REST }), { start: { stamina: 0 } }).state.stamina;
  assert.deepEqual([1, 2, 3, 4, 5, 6, 8, 10, 12].map(gain), [0, 0, 0, 6, 7.5, 9, 12, 15, 18]);
});

test('descanso completo: 3 h + interrupção + 3 h não soma; 6 h + interrupção + 4 h recupera 9 + 6', () => {
  const idle = { a: '' };
  const r1 = run([...rows(3, { a: ACT.REST }), idle, ...rows(3, { a: ACT.REST })], { start: { stamina: 0 } });
  assert.equal(r1.state.stamina, 0);
  const r2 = run([...rows(6, { a: ACT.REST }), idle, ...rows(4, { a: ACT.REST })], { start: { stamina: 0 } });
  assert.equal(r2.state.stamina, 15);
  assert.equal(r2.events[3].rest.streak, 4);
  assert.equal(r2.events[3].rest.paid, 6);
  assert.equal(r2.events[10].rest.streak, 4, 'nova sequência recomeça a contagem');
  const other = run([...rows(5, { a: ACT.REST }), skill(), ...rows(4, { a: ACT.REST })], { start: { stamina: 40 } });
  assert.equal(other.events[6].rest.streak, 1, 'qualquer outra atividade interrompe');
});

test('descanso completo: limite de 12 horas por dia e teto de estamina', () => {
  const r = run(rows(14, { a: ACT.REST }), { start: { stamina: 0 } });
  assert.equal(r.state.stamina, 18);
  assert.equal(r.events[12].ok, false);
  assert.match(r.events[12].reason, /12 horas/);
  const capped = run(rows(6, { a: ACT.REST }), { start: { stamina: 95 } });
  assert.equal(capped.state.stamina, 100, 'respeita a estamina máxima');
  assert.equal(capped.events[3].staminaDelta, 5, 'só 5 cabiam dos 6');
});

test('meditar: sessões por Espírito, mana por hora 1/(4−x/4), sessão encerrada não retoma', () => {
  assert.equal(meditationRate(0), 0.25); assert.equal(meditationRate(12), 1); assert.equal(meditationRate(99), 1);
  const idle = { a: '' };
  const med = { a: ACT.MEDITATE };
  const rngSix = sides => sides; // d12 sempre 12 → taxa 1
  const r = run([...rows(3, med), idle, ...rows(2, med), idle, ...rows(2, med)], { start: { mana: 0 }, rng: rngSix });
  // Espírito d12 = 2 sessões: 3 h + 2 h = 5 de mana; a terceira sessão falha
  assert.equal(r.state.mana, 5);
  assert.equal(r.events.filter(e => e.ok && e.activity === ACT.MEDITATE).length, 5);
  assert.equal(r.events[8].ok, false);
  assert.match(r.events[8].reason, /limite de 2/);
  assert.equal(r.events[3].meditation.closed, true, 'a sessão fecha quando a meditação termina');
  assert.equal(r.events[3].meditation.hours, 3);
  const d6 = run([...rows(2, med), idle, ...rows(2, med)], { st: stats({ spirit: { die: 6, bonus: 0 } }), start: { mana: 0 }, rng: rngSix });
  assert.equal(d6.state.mana, 2, 'Espírito d6 = 1 sessão');
  const bonus = run([...rows(1, med), idle, ...rows(1, med), idle, ...rows(1, med)], { st: stats({ spirit: { die: 12, bonus: 9 } }), start: { mana: 0 }, rng: rngSix });
  assert.equal(bonus.state.mana, 2, 'd12+9 continua com 2 sessões');
});

test('meditar: uma rolagem por sessão (guardada no evento) define a taxa da sessão toda', () => {
  const seq = [4, 12];
  let i = 0;
  const rng = () => seq[i++];
  const r = run([...rows(2, { a: ACT.MEDITATE }), { a: '' }, ...rows(2, { a: ACT.MEDITATE })], { start: { mana: 0 }, rng, st: stats({ meditar: { die: 12, bonus: 0 } }) });
  assert.equal(i, 2, 'duas sessões, duas rolagens');
  assert.equal(r.events[0].meditation.started, true);
  assert.equal(r.events[0].meditation.face, 4);
  assert.equal(r.events[1].meditation?.started, undefined);
  assert.equal(Math.round(r.events[0].manaDelta * 1000) / 1000, Math.round(1 / (4 - 1) * 1000) / 1000, 'x = 4');
  assert.equal(r.events[4].manaDelta, 1, 'x = 12');
});

test('as sessões de meditação reiniciam só no novo dia da campanha', () => {
  const med = { a: ACT.MEDITATE };
  let state = { stamina: 50, mana: 0 };
  let day = null;
  const one = (dayNo, row) => { const r = processHour({ dayNo, row, stats: stats({ spirit: { die: 6, bonus: 0 } }), state, day, rng: max }); state = r.state; day = r.day; return r.event; };
  assert.equal(one(0, med).ok, true);
  assert.equal(one(0, { a: '' }).ok, true);
  assert.equal(one(0, med).ok, false, 'Espírito d6: uma sessão por dia');
  const next = one(1, med);
  assert.equal(next.ok, true, 'no dia seguinte a sessão volta');
  assert.equal(day.dayNo, 1);
  assert.equal(day.medClosed, 0);
});

test('meditação aberta no fim do dia é encerrada na virada do dia', () => {
  let day = null; let state = { stamina: 50, mana: 0 };
  const go = (dayNo, row) => { const r = processHour({ dayNo, row, stats: stats(), state, day, rng: max }); state = r.state; day = r.day; return r.event; };
  go(0, { a: ACT.MEDITATE });
  assert.equal(day.medActive, true);
  const e = go(1, { a: '' });
  assert.equal(e.meditation.closed, true);
  assert.equal(e.meditation.atDayChange, true);
  assert.equal(day.medActive, false);
});

test('estudo mágico: só feitiço já treinado, sem custo, conta horas; 25 h = 1 dado, máximo 24', () => {
  const ok = run([{ a: ACT.STUDY, spell: 's1' }]).events[0];
  assert.equal(ok.ok, true); assert.equal(ok.study, 1); assert.equal(ok.staminaDelta, 0); assert.equal(ok.manaDelta, 0);
  assert.equal(run([{ a: ACT.STUDY, spell: 's2' }]).events[0].ok, false, 's2 nunca foi treinado');
  assert.deepEqual([0, 24, 25, 49, 50, 100, 400, 600, 601, 9999].map(astuciaDiceFor), [0, 0, 1, 1, 2, 4, 16, 24, 24, 24]);
});

test('trabalhar ainda não está liberado e não tem efeito', () => {
  const e = run([{ a: ACT.WORK }]).events[0];
  assert.equal(e.ok, false);
  assert.equal(e.staminaDelta, 0);
});

test('processTicks: um evento por hora por personagem, ids únicos e determinísticos', () => {
  const rowAt = () => ({ row: skill(), routineId: 'r1', fed: true });
  const entries = [{ characterId: 'A', stats: stats(), state: { stamina: 100, mana: 50 }, day: null, rowAt }, { characterId: 'B', stats: stats(), state: { stamina: 100, mana: 50 }, day: null, rowAt }];
  const out = processTicks({ entries, fromTick: 0, hours: 5, rng: max });
  assert.equal(out.length, 2);
  assert.equal(out[0].events.length, 5);
  assert.deepEqual(out[0].events.map(e => e.tick), [0, 1, 2, 3, 4]);
  assert.equal(out[0].events[0].routineId, 'r1');
  const again = processTicks({ entries, fromTick: 0, hours: 5, rng: max });
  const ids = r => r.flatMap(o => o.events.map(e => eventId('T', o.characterId, e.tick)));
  assert.deepEqual(ids(out), ids(again), 'reprocessar gera os mesmos ids (o servidor ignora os repetidos)');
  assert.equal(new Set(ids(out)).size, 10);
  assert.deepEqual(out[0].state, again[0].state);
});

test('processTicks atravessa a virada do dia (05:00 → 06:00) renovando os limites diários', () => {
  const rowAt = () => ({ row: skill(), routineId: 'r1', fed: true });
  const entries = [{ characterId: 'A', stats: stats({ maxStamina: 1000 }), state: { stamina: 1000, mana: 50 }, day: null, rowAt }];
  const out = processTicks({ entries, fromTick: 0, hours: 30, rng: max })[0].events;
  assert.equal(out.filter(e => e.ok && e.dayNo === 0).length, 12);
  assert.equal(out.filter(e => !e.ok && e.dayNo === 0).length, 12, 'horas 13 a 24 do dia 1 estouram o limite');
  assert.equal(out.filter(e => e.ok && e.dayNo === 1).length, 6, 'no dia 2 o treino recomeça do zero');
  assert.equal(out[24].trainHour, 1);
  assert.equal(out[24].cost, 1, 'a primeira hora do dia 2 custa 1 de novo');
});

test('estado do dia continua entre dois avanços (a sequência de descanso não se perde)', () => {
  const rowAt = () => ({ row: { a: ACT.REST }, routineId: 'r', fed: true });
  const base = { characterId: 'A', stats: stats(), rowAt };
  const first = processTicks({ entries: [{ ...base, state: { stamina: 0, mana: 0 }, day: null }], fromTick: 0, hours: 3, rng: max })[0];
  assert.equal(first.state.stamina, 0);
  const second = processTicks({ entries: [{ ...base, state: first.state, day: first.day }], fromTick: 3, hours: 2, rng: max })[0];
  assert.equal(second.events[0].rest.streak, 4);
  assert.equal(second.state.stamina, 7.5, 'a 4ª hora paga 6 e a 5ª paga 1,5, mesmo em avanços separados');
});

test('statsFromCharacter lê Espírito, Conjurar, Meditar (com bônus), máximos e feitiços da ficha', () => {
  const c = newCharacter();
  c.attributes.Espírito = 12; c.attributes.Vigor = 8;
  c.skills.Conjurar = 12; c.skills.Meditar = 8;
  c.bonuses = { skills: { Conjurar: 3 }, attributes: { Espírito: 2 } };
  c.powers = [{ name: 'Fogo', description: '', cost: '' }];
  const s = statsFromCharacter(c, ['x']);
  assert.deepEqual(s.spirit, { die: 12, bonus: 2 });
  assert.deepEqual(s.conjurar, { die: 12, bonus: 3 });
  assert.deepEqual(s.meditar, { die: 8, bonus: 0 });
  assert.equal(s.maxStamina, 8);
  assert.ok(s.skills.includes('Conjurar'));
  assert.equal(s.spells.length, 1);
  assert.match(s.spells[0].id, /^p0-/);
  assert.equal(statsFromCharacter(c).spells[0].id, s.spells[0].id, 'o id do feitiço é estável entre leituras');
  assert.deepEqual(s.trainedSpells, ['x']);
});

test('newDay começa zerado', () => {
  assert.deepEqual(newDay(3), { dayNo: 3, trainHours: 0, spellHours: 0, workHours: 0, restHours: 0, restStreak: 0, quickHours: 0, medClosed: 0, medActive: false, medHours: 0, medRoll: 0, medRate: 0, prev: '' });
});

test('meditar: cada hora dá +1 XP em Meditar e +0,5 em Espírito (só nas horas com efeito)', () => {
  const med = { a: ACT.MEDITATE };
  const r = run([med, med, med], { start: { mana: 0 } });
  for (const e of r.events) assert.deepEqual(e.xp, [
    { kind: 'skill', name: 'Meditar', modality: 'normal', amount: 1 },
    { kind: 'attribute', name: 'Espírito', modality: 'normal', amount: 0.5 },
  ]);
  const d6 = run([med, { a: '' }, med], { st: stats({ spirit: { die: 6, bonus: 0 } }), start: { mana: 0 } });
  assert.equal(d6.events[2].ok, false, 'sem sessão disponível a hora não tem efeito');
  assert.deepEqual(d6.events[2].xp, [], 'e não dá XP');
});
