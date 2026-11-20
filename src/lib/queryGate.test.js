import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueryGate, scopedValue } from './queryGate.js';

test('a consulta mais nova invalida a anterior', () => {
  const gate = createQueryGate();
  const first = gate.begin();
  assert.equal(first(), true);
  const second = gate.begin();
  assert.equal(first(), false);
  assert.equal(second(), true);
});

test('invalidate descarta as consultas em voo (troca de mesa ou evento Realtime)', () => {
  const gate = createQueryGate();
  const inFlight = gate.begin();
  gate.invalidate();
  assert.equal(inFlight(), false);
  assert.equal(gate.begin()(), true);
});

test('o valor guardado só vale para a identidade em que foi lido', () => {
  const entry = { identity: 'mesa-a', value: 7 };
  assert.equal(scopedValue(entry, 'mesa-a', null), 7);
  assert.equal(scopedValue(entry, 'mesa-b', null), null);
  assert.equal(scopedValue(null, 'mesa-a', 'vazio'), 'vazio');
});
