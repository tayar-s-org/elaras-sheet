import test from 'node:test';
import assert from 'node:assert/strict';
import { pickTable } from './pickTable.js';

const tables = [{ id: 'a', name: 'Mesa A' }, { id: 'b', name: 'Mesa B' }];

test('mantém a mesa preferida quando ela está na lista', () => {
  assert.equal(pickTable(tables, 'b').id, 'b');
});

test('seleção de outra ficha, ausente da lista atual, cai na primeira mesa', () => {
  assert.equal(pickTable(tables, 'mesa-da-ficha-antiga').id, 'a');
  assert.equal(pickTable(tables, '').id, 'a');
});

test('sem mesas não há seleção', () => {
  assert.equal(pickTable([], 'a'), null);
});
