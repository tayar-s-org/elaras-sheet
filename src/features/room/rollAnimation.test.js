import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRollToAnimate } from './rollAnimation.js';

const rolls = (...ids) => ids.map(id => ({ id }));

test('anima a rolagem mais nova que chegou depois da ultima vista', () => {
  assert.deepEqual(nextRollToAnimate(rolls(1, 2, 3), 1), { lastSeenId: 3, roll: { id: 3 } });
});

test('sem rolagem nova nao anima e mantem a referencia', () => {
  assert.deepEqual(nextRollToAnimate(rolls(1, 2), 2), { lastSeenId: 2, roll: null });
});

test('rolagens recuperadas pela reconciliacao contam como vistas, sem animar', () => {
  assert.deepEqual(nextRollToAnimate(rolls(1, 2, 7, 8), 2, 8), { lastSeenId: 8, roll: null });
});

test('rolagem ao vivo depois da reconciliacao ainda anima', () => {
  assert.deepEqual(nextRollToAnimate(rolls(7, 8, 9), 2, 8), { lastSeenId: 9, roll: { id: 9 } });
});
