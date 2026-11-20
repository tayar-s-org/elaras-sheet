import test from 'node:test';
import assert from 'node:assert/strict';
import { staleCharacterIds, mergeCharacters } from './characterRefresh.js';

const row = (id, revision) => ({ id, name: id, data: {}, revision });

test('só pede de novo as fichas com revisão diferente ou desconhecidas', () => {
  const known = { a: row('a', 1), b: row('b', 3) };
  const revisions = [{ id: 'a', revision: 1 }, { id: 'b', revision: 4 }, { id: 'c', revision: 1 }];
  assert.deepEqual(staleCharacterIds(known, revisions), ['b', 'c']);
});

test('sem mudanças devolve o mesmo objeto', () => {
  const known = { a: row('a', 1), b: row('b', 2) };
  assert.equal(mergeCharacters(known, [{ id: 'a', revision: 1 }, { id: 'b', revision: 2 }], {}), known);
});

test('troca só a ficha baixada e mantém as outras', () => {
  const known = { a: row('a', 1), b: row('b', 2) };
  const updated = row('b', 3);
  const next = mergeCharacters(known, [{ id: 'a', revision: 1 }, { id: 'b', revision: 3 }], { b: updated });
  assert.notEqual(next, known);
  assert.equal(next.a, known.a);
  assert.equal(next.b, updated);
});

test('ficha que saiu da mesa some do mapa', () => {
  const known = { a: row('a', 1), b: row('b', 2) };
  assert.deepEqual(Object.keys(mergeCharacters(known, [{ id: 'a', revision: 1 }], {})), ['a']);
});

test('sem fichas e sem cache devolve o cache vazio', () => {
  const known = {};
  assert.equal(mergeCharacters(known, [], {}), known);
});
