import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotGuard, reconcileById, reconcileByKey } from './snapshotGuard.js';

test('so a leitura mais recente vale', () => {
  const guard = createSnapshotGuard();
  const first = guard.begin();
  const second = guard.begin();
  assert.equal(guard.isLatest(first), false);
  assert.equal(guard.isLatest(second), true);
});

test('touchedAfter so marca o que o tempo real alterou depois do inicio da leitura', () => {
  const guard = createSnapshotGuard();
  guard.touch('antes');
  const ticket = guard.begin();
  guard.touch('depois');
  assert.equal(guard.touchedAfter(ticket, 'antes'), false);
  assert.equal(guard.touchedAfter(ticket, 'depois'), true);
  assert.equal(guard.touchedAfter(ticket, 'nunca'), false);
});

test('reconcileByKey: o snapshot vence, menos nas chaves que o tempo real mudou depois dele', () => {
  const merged = reconcileByKey({ a: 'velho-a', b: 'servidor-b' }, { a: 'tempo-real-a', c: 'so-local' }, key => key === 'a');
  assert.deepEqual(merged, { a: 'tempo-real-a', b: 'servidor-b', c: 'so-local' });
});

test('reconcileById: remove o que sumiu no servidor durante a queda e traz o que mudou', () => {
  const snapshot = [{ id: 'a', x: 1 }, { id: 'b', x: 2 }];
  const current = [{ id: 'a', x: 0 }, { id: 'gone', x: 9 }];
  assert.deepEqual(reconcileById(snapshot, current, () => false), snapshot);
});

test('reconcileById: preserva linhas alteradas, criadas ou apagadas pelo tempo real depois do snapshot', () => {
  const snapshot = [{ id: 'moved', x: 1 }, { id: 'deleted', x: 1 }, { id: 'same', x: 1 }];
  const current = [{ id: 'moved', x: 5 }, { id: 'same', x: 1 }, { id: 'created', x: 7 }];
  const changed = id => ['moved', 'deleted', 'created'].includes(id);
  assert.deepEqual(reconcileById(snapshot, current, changed), [{ id: 'moved', x: 5 }, { id: 'same', x: 1 }, { id: 'created', x: 7 }]);
});
