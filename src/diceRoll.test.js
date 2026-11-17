import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFormula, traitSpec, describeRoll } from './diceRoll.js';

test('parseFormula entende múltiplos grupos, modificador, explosão e modo', () => {
  assert.deepEqual(parseFormula('2d6+1d4!-1'), {
    kind: 'dice', mode: 'normal', modifier: -1 + 0,
    dice: [{ count: 2, sides: 6, explode: false, negative: false }, { count: 1, sides: 4, explode: true, negative: false }],
  });
  assert.equal(parseFormula('d20 vantagem').mode, 'advantage');
  assert.equal(parseFormula('d20+5 dis').mode, 'disadvantage');
  assert.equal(parseFormula('d20', 'advantage').mode, 'advantage');
  assert.deepEqual(parseFormula('1d8-1d4+2').dice.map(d => d.negative), [false, true]);
  assert.equal(parseFormula('1d8-1d4+2').modifier, 2);
  assert.equal(parseFormula('D100').dice[0].sides, 100);
});

test('parseFormula rejeita entradas inválidas ou fora dos limites', () => {
  for (const bad of ['', '3', 'd7', '2d', 'abc', '51d6', '1d6+', '1d6;drop', '1d20+5000', '2d20+2d20+2d20+2d20+2d20+2d20+2d20+2d20+2d20+2d20+2d20']) {
    assert.throws(() => parseFormula(bad), Error, bad);
  }
});

test('traitSpec monta a especificação sem resultado', () => {
  assert.deepEqual(traitSpec({ type: 'skill', name: 'Lutar', modifier: 1 }), {
    kind: 'trait', trait: { type: 'skill', name: 'Lutar' }, wild: true, modifier: 1, target: 4,
  });
});

test('describeRoll formata rolagens de dados com vantagem e de traço', () => {
  const dice = describeRoll({ formula: '1d20+2 (vantagem)', total: 17, result: { kind: 'dice', modifier: 2, chosen: 1, attempts: [
    { total: 9, groups: [{ sides: 20, count: 1, explode: false, negative: false, dice: [[7]] }] },
    { total: 17, groups: [{ sides: 20, count: 1, explode: false, negative: false, dice: [[15]] }] },
  ] } });
  assert.match(dice.detail, /✘ 1d20: 7 \+2 = 9 \| ✔ 1d20: 15 \+2 = 17/);
  const trait = describeRoll({ formula: 'Lutar d8 + selvagem d6 vs 4', total: 13, result: {
    kind: 'trait', name: 'Lutar', die: 8, untrained: false, wild: true, traitRolls: [8, 5], traitTotal: 13, wildRolls: [2], wildTotal: 2,
    penalty: 0, modifier: 0, target: 4, criticalFailure: false, success: true, raises: 2 } });
  assert.equal(trait.outcome, 'Sucesso com 2 aumentos');
  assert.match(trait.detail, /\(8\+5\)/);
  const crit = describeRoll({ formula: 'x', total: 1, result: { kind: 'trait', name: 'Furtividade', die: 4, untrained: true, wild: true,
    traitRolls: [1], traitTotal: 1, wildRolls: [1], wildTotal: 1, penalty: -2, modifier: 0, target: 4, criticalFailure: true, success: false, raises: 0 } });
  assert.equal(crit.outcome, 'Falha crítica!');
  assert.equal(crit.tone, 'bad');
});
