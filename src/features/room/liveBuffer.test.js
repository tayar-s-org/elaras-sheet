import test from 'node:test';
import assert from 'node:assert/strict';
import { appendById, mergeById } from './liveBuffer.js';

const rows = (...ids) => ids.map(id => ({ id }));
const ids = list => list.map(x => x.id);

test('appendById ignora repetidos e devolve a mesma lista', () => {
  const list = rows(1, 2);
  assert.equal(appendById(list, { id: 2 }), list);
  assert.deepEqual(ids(appendById(list, { id: 3 })), [1, 2, 3]);
});

test('appendById descarta os mais antigos acima do limite', () => {
  assert.deepEqual(ids(appendById(rows(1, 2, 3), { id: 4 }, 3)), [2, 3, 4]);
});

test('mergeById mantem o que chegou em tempo real durante a queda e completa o que faltou', () => {
  const current = rows(1, 2, 5);
  const snapshot = rows(2, 3, 4);
  assert.deepEqual(ids(mergeById(current, snapshot)), [1, 2, 3, 4, 5]);
});

test('mergeById usa um item por id e respeita o limite pelos mais novos', () => {
  const merged = mergeById([{ id: 2, body: 'tempo real' }], [{ id: 2, body: 'snapshot' }, { id: 1 }, { id: 3 }], 2);
  assert.deepEqual(merged, [{ id: 2, body: 'tempo real' }, { id: 3 }]);
});
