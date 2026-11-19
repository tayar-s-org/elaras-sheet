import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFormula, traitSpec, describeRoll } from './diceRoll.js';

test('parseFormula entende múltiplos grupos, modificador e explosão (sem vantagem/desvantagem)', () => {
  assert.deepEqual(parseFormula('2d6+1d4!-1'), {
    kind: 'dice', mode: 'normal', modifier: -1,
    dice: [{ count: 2, sides: 6, explode: false, negative: false }, { count: 1, sides: 4, explode: true, negative: false }],
  });
  assert.throws(() => parseFormula('d20 vantagem'), Error);
  assert.deepEqual(parseFormula('1d8-1d4+2').dice.map(d => d.negative), [false, true]);
  assert.equal(parseFormula('1d8-1d4+2').modifier, 2);
  assert.equal(parseFormula('D100').dice[0].sides, 100);
});

test('parseFormula rejeita entradas inválidas ou fora dos limites', () => {
  for (const bad of ['', '3', 'd7', '2d', 'abc', '51d6', '1d6+', '1d6;drop', '1d20+5000', '2d20+2d20+2d20+2d20+2d20+2d20+2d20+2d20+2d20+2d20+2d20']) {
    assert.throws(() => parseFormula(bad), Error, bad);
  }
});

test('traitSpec monta a especificação sem dado selvagem e com o detalhamento dos bônus', () => {
  assert.deepEqual(traitSpec({ type: 'skill', name: 'Lutar', modifier: 1, bonuses: [{ label: 'Espada', value: 1 }, { label: 'zero', value: 0 }] }), {
    kind: 'trait', trait: { type: 'skill', name: 'Lutar' }, wild: false, modifier: 1, noTarget: true, bonuses: [{ label: 'Espada', value: 1 }],
  });
});

test('describeRoll formata rolagens antigas com vantagem', () => {
  const dice = describeRoll({ formula: '1d20+2 (vantagem)', total: 17, result: { kind: 'dice', modifier: 2, chosen: 1, attempts: [
    { total: 9, groups: [{ sides: 20, count: 1, explode: false, negative: false, dice: [[7]] }] },
    { total: 17, groups: [{ sides: 20, count: 1, explode: false, negative: false, dice: [[15]] }] },
  ] } });
  assert.match(dice.detail, /✘ 1d20: 7 \+2 = 9 \| ✔ 1d20: 15 \+2 = 17/);
});

const trait = (extra = {}, spec = {}) => ({ formula: 'Lutar d8+3 vs 4', total: 16, spec, result: {
  kind: 'trait', name: 'Lutar', die: 8, untrained: false, wild: false, traitRolls: [8, 5], traitTotal: 13, penalty: 0, modifier: 3,
  target: 4, criticalFailure: false, success: true, raises: 3, incap: { total: 0, steps: 0, baseDie: 8 }, ...extra } });

test('describeRoll explica de onde veio cada ponto: dado, explosão, cada bônus, total e aumentos', () => {
  const d = describeRoll(trait({}, { bonuses: [{ label: 'Espada longa', value: 2 }, { label: 'Raça (Sáurio)', value: 1 }] }));
  assert.equal(d.outcome, 'Sucesso com 3 aumentos');
  assert.equal(d.lines[0], 'Dado: Lutar d8');
  assert.match(d.lines[1], /8 \+ 5 = 13 \(explodiu 1×/);
  assert.ok(d.lines.includes('+2 Espada longa'));
  assert.ok(d.lines.includes('+1 Raça (Sáurio)'));
  assert.ok(d.lines.includes('Total: 13 +2 +1 = 16'));
  assert.match(d.lines.at(-1), /16 ≥ dificuldade 4; cada 4 pontos acima dela é um aumento \(12 acima\)/);
});

test('describeRoll não inventa conta quando o detalhamento não fecha com o modificador salvo', () => {
  assert.ok(describeRoll(trait({}, { bonuses: [{ label: 'Espada', value: 1 }] })).lines.includes('+3 modificadores'));
  assert.ok(describeRoll(trait()).lines.includes('+3 modificadores'), 'rolagem antiga, sem detalhamento');
});

test('describeRoll: falha, falha crítica, sem treino e incapacitação', () => {
  const fail = describeRoll({ ...trait({ success: false, raises: 0, traitRolls: [1], traitTotal: 1, modifier: 0 }), total: 1 });
  assert.equal(fail.outcome, 'Falha');
  assert.equal(fail.tone, 'bad');
  assert.match(fail.lines.at(-1), /1 < dificuldade 4/);
  const crit = describeRoll(trait({ wild: true, wildRolls: [1], wildTotal: 1, traitRolls: [1], traitTotal: 1, criticalFailure: true, success: false, raises: 0 }));
  assert.equal(crit.outcome, 'Falha crítica!');
  const untrained = describeRoll(trait({ untrained: true, die: 4, penalty: -2, modifier: 0 }));
  assert.match(untrained.lines[0], /sem treino \(d4 −2\)/);
  assert.ok(untrained.lines.some(l => l.startsWith('−2 penalidade por não ter treino')));
  const hit = describeRoll(trait({ die: 6, incap: { total: 3, steps: 2, baseDie: 10 } }));
  assert.match(hit.lines[0], /Lutar d6 · incapacitação 3 reduziu de d10 para d6/);
  assert.doesNotMatch(describeRoll(trait()).lines[0], /incapacitação/);
  assert.doesNotMatch(describeRoll(trait({ incap: undefined })).lines[0], /incapacitação/);
});

test('describeRoll mostra o d12+N e a escada descendo com a incapacitação', () => {
  const d = describeRoll({ formula: 'Lutar d12+1+2 vs 4', total: 20, spec: { bonuses: [{ label: 'Espada', value: 2 }] }, result: {
    kind: 'trait', name: 'Lutar', die: 12, bonus: 1, untrained: false, wild: false, traitRolls: [12, 5], traitTotal: 17, penalty: 0, modifier: 2,
    target: 4, criticalFailure: false, success: true, raises: 4, incap: { total: 1, steps: 1, baseDie: 12, baseBonus: 2 } } });
  assert.equal(d.lines[0], 'Dado: Lutar d12+1 · incapacitação 1 reduziu de d12+2 para d12+1');
  assert.ok(d.lines.some(l => l.startsWith('+1 bônus do d12+1')));
  assert.ok(d.lines.includes('Total: 17 +1 +2 = 20'));
  const down = describeRoll({ formula: 'x', total: 5, spec: {}, result: { kind: 'trait', name: 'Força', die: 10, bonus: 0, untrained: false, wild: false,
    traitRolls: [5], traitTotal: 5, penalty: 0, modifier: 0, target: 4, criticalFailure: false, success: true, raises: 0, incap: { total: 1, steps: 1, baseDie: 12, baseBonus: 0 } } });
  assert.match(down.lines[0], /reduziu de d12 para d10/);
});

test('rolagem da ficha sem dificuldade mostra só o total: sem sucesso, falha, aumentos nem "vs 4"', () => {
  const d = describeRoll({ ...trait({}, { noTarget: true, bonuses: [] }), formula: 'Lutar d8+3 vs 4' });
  assert.equal(d.title, 'Lutar d8+3');
  assert.equal(d.outcome, '');
  assert.equal(d.tone, '');
  assert.ok(d.lines.at(-1).startsWith('Total:'));
  assert.ok(!d.lines.some(l => /dificuldade|Resultado/.test(l)));
});
