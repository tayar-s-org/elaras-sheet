import test from 'node:test';
import assert from 'node:assert/strict';
import { dieDef, upNormal, alignQuaternion, UP, DIE_SIDES } from './geometry.js';
import { faceAreaCenter } from './mesh.js';
import { planDice, splitD100, seededRandom, faceLabel, MAX_ANIMATED } from './plan.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('cada dado tem o número certo de faces, planas e com raio circunscrito 1', () => {
  const expected = { 4: 4, 6: 6, 8: 8, 10: 10, 12: 12, 20: 20 };
  for (const sides of DIE_SIDES) {
    const def = dieDef(sides);
    assert.equal(def.faces.length, expected[sides], `d${sides}`);
    let max = 0;
    for (const f of def.faces) {
      for (const v of f.verts) {
        assert.ok(close(v.dot(f.normal), f.dist, 1e-4), `d${sides}: face não plana`);
        max = Math.max(max, v.length());
      }
      assert.ok(f.dist > 0);
    }
    assert.ok(close(max, 1, 1e-6), `d${sides}: raio ${max}`);
  }
});

test('faces numeradas de 1 a N, sem repetição, com opostas somando N+1 (exceto d4)', () => {
  for (const sides of DIE_SIDES.filter(s => s !== 4)) {
    const def = dieDef(sides);
    const values = def.faces.map(f => f.value).sort((a, b) => a - b);
    assert.deepEqual(values, Array.from({ length: sides }, (_, i) => i + 1), `d${sides}`);
    for (const f of def.faces) {
      const opposite = def.faces.find(o => o.normal.dot(f.normal) < -0.99);
      assert.ok(opposite, `d${sides}: sem face oposta`);
      assert.equal(f.value + opposite.value, sides + 1, `d${sides}: opostas`);
    }
  }
});

test('d4: quatro vértices numerados e cada face lista os três vértices dela', () => {
  const def = dieDef(4);
  assert.deepEqual(def.vertices.map(v => v.n).sort(), [1, 2, 3, 4]);
  for (const f of def.faces) {
    assert.equal(new Set(f.labels).size, 3);
    assert.ok(f.labels.every(n => n >= 1 && n <= 4));
  }
  for (let n = 1; n <= 4; n++) assert.equal(def.faces.filter(f => f.labels.includes(n)).length, 3);
});

test('para todo valor possível a orientação final deixa exatamente esse valor virado para cima', () => {
  for (const sides of DIE_SIDES) {
    const def = dieDef(sides);
    for (let value = 1; value <= sides; value++) {
      const n = upNormal(def, value).clone().applyQuaternion(alignQuaternion(def, value));
      assert.ok(close(n.x, UP.x, 1e-6) && close(n.y, UP.y, 1e-6) && close(n.z, UP.z, 1e-6), `d${sides} valor ${value}`);
      if (sides !== 4) {
        // nenhuma outra face pode apontar para cima
        const q = alignQuaternion(def, value);
        const upFaces = def.faces.filter(f => f.normal.clone().applyQuaternion(q).y > 0.999);
        assert.equal(upFaces.length, 1);
        assert.equal(upFaces[0].value, value);
      }
    }
  }
});

test('d100 vira dois d10 (dezenas e unidades) e 100 é 00 + 0', () => {
  const cases = { 1: [10, 1], 7: [10, 7], 10: [1, 10], 57: [5, 7], 60: [6, 10], 99: [9, 9], 100: [10, 10] };
  for (const [value, [tens, units]] of Object.entries(cases)) assert.deepEqual(splitD100(Number(value)), { tens, units }, String(value));
  assert.equal(faceLabel('tens', 10), '00');
  assert.equal(faceLabel('tens', 5), '50');
  assert.equal(faceLabel('units', 10), '0');
  assert.equal(faceLabel('units', 7), '7');
  assert.equal(faceLabel('d20', 20), '20');
  // o número lido nos dois dados reconstitui o resultado
  for (let v = 1; v <= 100; v++) {
    const { tens, units } = splitD100(v);
    const read = (tens % 10) * 10 + (units % 10);
    assert.equal(read === 0 ? 100 : read, v);
  }
});

test('planDice lê rolagens de dados, vantagem, explosão e traços', () => {
  const dice = { result: { kind: 'dice', chosen: 1, attempts: [
    { groups: [{ sides: 20, dice: [[3]] }] },
    { groups: [{ sides: 20, dice: [[15]] }, { sides: 4, dice: [[4, 2]] }] },
  ] } };
  const plan = planDice(dice);
  assert.deepEqual(plan.map(d => [d.sides, d.value, d.role]), [[20, 3, 'discarded'], [20, 15, 'normal'], [4, 4, 'normal'], [4, 2, 'normal']]);
  const trait = planDice({ result: { kind: 'trait', die: 8, wild: true, traitRolls: [8, 5], wildRolls: [2] } });
  assert.deepEqual(trait.map(d => [d.sides, d.value, d.role]), [[8, 8, 'trait'], [8, 5, 'trait'], [6, 2, 'wild']]);
  const noWild = planDice({ result: { kind: 'trait', die: 6, wild: false, traitRolls: [3], wildRolls: null } });
  assert.equal(noWild.length, 1);
  const d100 = planDice({ result: { kind: 'dice', chosen: 0, attempts: [{ groups: [{ sides: 100, dice: [[57]] }] }] } });
  assert.deepEqual(d100.map(d => [d.kind, d.value]), [['tens', 5], ['units', 7]]);
  const many = { result: { kind: 'dice', chosen: 0, attempts: [{ groups: [{ sides: 6, dice: Array.from({ length: MAX_ANIMATED + 1 }, () => [1]) }] }] } };
  assert.equal(planDice(many), null);
  assert.equal(planDice({}), null);
});

test('o sorteio da animação é determinístico por rolagem e varia entre rolagens', () => {
  const a = seededRandom(123); const b = seededRandom(123); const c = seededRandom(124);
  const seqA = Array.from({ length: 5 }, a); const seqB = Array.from({ length: 5 }, b); const seqC = Array.from({ length: 5 }, c);
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  assert.ok(seqA.every(x => x >= 0 && x < 1));
});

test('centro da área de uma face em pipa independe da ordem dos vértices', () => {
  const kite = [{ x: 5, y: 0 }, { x: 8, y: 6 }, { x: 5, y: 9 }, { x: 2, y: 6 }];
  for (const points of [kite, [...kite].reverse()]) {
    const center = faceAreaCenter(points);
    assert.ok(close(center.x, 5));
    assert.ok(close(center.y, 5));
  }
});
