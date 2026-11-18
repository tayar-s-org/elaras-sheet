import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aptitudeBonus, aptitudeBonusOf, xpWithAptitude, accumulationCap, pointsForMax, aptitudeSummary, validateAllocation, cleanAllocation, pointsOf, aptitudeKey,
} from './aptitude.js';
import { addXp } from './progression.js';
import { processHour, ACT } from './activities.js';

test('atributo: +10% por ponto, máximo +100% (10 pontos ou mais)', () => {
  const table = [[0, 0], [1, 0.1], [2, 0.2], [3, 0.3], [4, 0.4], [5, 0.5], [6, 0.6], [7, 0.7], [8, 0.8], [9, 0.9], [10, 1], [15, 1], [30, 1]];
  for (const [pts, bonus] of table) assert.equal(aptitudeBonus('attribute', pts), bonus, `${pts} pontos`);
});

test('perícia: +5% por ponto, máximo +100% (20 pontos ou mais)', () => {
  const table = [[0, 0], [1, 0.05], [2, 0.1], [3, 0.15], [4, 0.2], [5, 0.25], [8, 0.4], [10, 0.5], [15, 0.75], [20, 1], [25, 1]];
  for (const [pts, bonus] of table) assert.equal(aptitudeBonus('skill', pts), bonus, `${pts} pontos`);
});

test('o limite de +100% vale para cada alvo e os pontos extras não rendem mais', () => {
  assert.equal(aptitudeBonus('attribute', 15), 1, '15 em Força = +100%, não +150%');
  assert.equal(aptitudeBonus('skill', 25), 1, '25 em Conjurar = +100%, não +125%');
  assert.equal(aptitudeBonus('attribute', 30), 1);
  assert.equal(pointsForMax('attribute'), 10);
  assert.equal(pointsForMax('skill'), 20);
  assert.equal(aptitudeBonus('attribute', -3), 0);
  assert.equal(aptitudeBonus('attribute', 'abc'), 0);
});

test('feitiços não têm Aptidão', () => {
  assert.equal(aptitudeBonus('spell', 50), 0);
  assert.equal(xpWithAptitude(10, 'spell', 50), 10);
  assert.equal(accumulationCap('spell', 50), 5000);
});

test('XP final: exemplos do pedido (Força 3 pts → 13, Conjurar 4 pts → 12, Força 15 pts → 20)', () => {
  assert.equal(xpWithAptitude(10, 'attribute', 3), 13);
  assert.equal(xpWithAptitude(10, 'skill', 4), 12);
  assert.equal(xpWithAptitude(10, 'attribute', 15), 20);
  assert.equal(xpWithAptitude(10, 'attribute', 0), 10);
  assert.equal(xpWithAptitude(0.5, 'attribute', 4), 0.7, 'ganho fracionado também recebe o bônus');
  assert.equal(xpWithAptitude(1, 'skill', 8), 1.4);
});

test('limite de acúmulo: tabela de atributos (5.000 → até 10.000)', () => {
  for (const [pts, cap] of [[0, 5000], [1, 5500], [2, 6000], [5, 7500], [10, 10000], [14, 10000]]) assert.equal(accumulationCap('attribute', pts), cap, `${pts} pontos`);
});

test('limite de acúmulo: tabela de perícias (5.000 → até 10.000)', () => {
  for (const [pts, cap] of [[0, 5000], [1, 5250], [2, 5500], [5, 6250], [10, 7500], [20, 10000], [40, 10000]]) assert.equal(accumulationCap('skill', pts), cap, `${pts} pontos`);
});

test('redistribuir atualiza o limite: Força 2 pontos = 6.000 e depois 5 pontos = 7.500', () => {
  const before = { [aptitudeKey('attribute', 'Força')]: 2 };
  const after = { [aptitudeKey('attribute', 'Força')]: 5 };
  assert.equal(accumulationCap('attribute', pointsOf(before, 'attribute', 'Força')), 6000);
  assert.equal(accumulationCap('attribute', pointsOf(after, 'attribute', 'Força')), 7500);
  assert.equal(aptitudeBonus('attribute', pointsOf(after, 'attribute', 'Vigor')), 0, 'só o alvo que recebeu pontos ganha bônus');
});

test('se o limite diminui com XP acima dele: nada é apagado, só novos ganhos são bloqueados', () => {
  const pool = { available: 7000, earned_total: 7000, spent_total: 0, discarded_total: 0 };
  const lowered = accumulationCap('attribute', 2); // caiu de 5 para 2 pontos: 6.000
  const r = addXp(pool, 10, lowered);
  assert.equal(r.pool.available, 7000, 'a XP acumulada continua intacta');
  assert.equal(r.kept, 0);
  assert.equal(r.discarded, 10, 'o ganho acima do limite vai para o descartado');
  assert.equal(r.pool.earned_total, 7010, 'o histórico do que foi conquistado não encolhe');
  assert.equal(r.pool.earned_total, r.pool.available + r.pool.spent_total + r.pool.discarded_total, 'invariante');
  const spent = { ...pool, available: 5900, spent_total: 1100 };
  assert.equal(addXp(spent, 200, lowered).kept, 100, 'abaixo do limite volta a acumular até ele');
});

test('Normal e Focado seguem independentes: o limite de Aptidão vale por alvo para cada acumulador', () => {
  const cap = accumulationCap('skill', 10); // 7.500
  const normal = addXp({ available: 7499, earned_total: 7499, spent_total: 0, discarded_total: 0 }, 5, cap);
  const focused = addXp({ available: 10, earned_total: 10, spent_total: 0, discarded_total: 0 }, 5, cap);
  assert.equal(normal.kept, 1);
  assert.equal(focused.kept, 5);
});

test('resumo: recebidos, distribuídos e disponíveis; nova rolagem soma sem apagar a distribuição', () => {
  const alloc = { 'attribute:Força': 5, 'skill:Conjurar': 10 };
  let s = aptitudeSummary([{ roll: 47 }], alloc);
  assert.deepEqual(s, { received: 47, distributed: 15, available: 32 });
  s = aptitudeSummary([{ roll: 47 }, { roll: 30 }], alloc);
  assert.deepEqual(s, { received: 77, distributed: 15, available: 62 }, 'a nova rolagem só soma ao disponível');
  assert.deepEqual(aptitudeSummary([], {}), { received: 0, distributed: 0, available: 0 });
});

const sheet = { attributes: ['Agilidade', 'Astúcia', 'Espírito', 'Força', 'Vigor'], skills: ['Conjurar', 'Atirar'] };
test('validação: só alvos da ficha, inteiros não negativos e nunca mais do que o recebido', () => {
  assert.deepEqual(validateAllocation({ 'attribute:Força': 5, 'skill:Conjurar': 10 }, 47, sheet), []);
  assert.deepEqual(validateAllocation({}, 0, sheet), []);
  assert.ok(validateAllocation({ 'attribute:Força': 30, 'skill:Conjurar': 20 }, 47, sheet).some(p => /só recebeu 47/.test(p)), 'mais do que possui');
  assert.ok(validateAllocation({ 'skill:Espadas': 3 }, 47, sheet).some(p => /não existe na ficha/.test(p)), 'perícia que a ficha não tem');
  assert.ok(validateAllocation({ 'attribute:Inteligência': 3 }, 47, sheet).some(p => /não existe/.test(p)), 'atributo inventado');
  assert.ok(validateAllocation({ 'spell:Fogo': 3 }, 47, sheet).length > 0, 'feitiço não recebe Aptidão');
  assert.ok(validateAllocation({ 'attribute:Força': -1 }, 47, sheet).length > 0, 'negativo');
  assert.ok(validateAllocation({ 'attribute:Força': 1.5 }, 47, sheet).length > 0, 'fracionado');
  assert.ok(validateAllocation({ 'attribute:Força': 5000 }, 99999, sheet).length > 0, 'limite absurdo por alvo');
  assert.ok(validateAllocation(null, 10, sheet).length > 0);
  assert.deepEqual(validateAllocation({ 'attribute:Força': 0 }, 0, sheet), [], 'zero em qualquer alvo é inofensivo');
});

test('deixar pontos sem distribuir é permitido', () => {
  assert.deepEqual(validateAllocation({ 'attribute:Força': 5 }, 47, sheet), []);
  assert.equal(aptitudeSummary([{ roll: 47 }], { 'attribute:Força': 5 }).available, 42);
});

test('cleanAllocation guarda só pontos inteiros positivos', () => {
  assert.deepEqual(cleanAllocation({ 'attribute:Força': 5, 'skill:Atirar': 0, 'skill:Conjurar': '3', x: -2, y: 'abc' }), { 'attribute:Força': 5, 'skill:Conjurar': 3 });
});

test('o motor continua gerando o ganho-base (a Aptidão é aplicada uma única vez, no servidor)', () => {
  const stats = { maxStamina: 100, maxMana: 50, spirit: { die: 12, bonus: 0 }, conjurar: { die: 12, bonus: 0 }, meditar: { die: 8, bonus: 0 }, skills: ['Atirar'], spells: [], trainedSpells: [], jobs: {} };
  const e = processHour({ dayNo: 0, row: { a: ACT.SKILL, skill: 'Atirar', mode: 'normal' }, stats, state: { stamina: 100, mana: 50 }, day: null, rng: s => s }).event;
  assert.deepEqual(e.xp.map(x => x.amount), [1, 0.5], 'sem bônus no evento: a Aptidão não é aplicada duas vezes');
});
