import test from 'node:test';
import assert from 'node:assert/strict';
import { createSerialQueue } from './serialQueue.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

test('tarefas rodam na ordem de chegada, mesmo se a primeira for mais lenta', async () => {
  const enqueue = createSerialQueue();
  const log = [];
  const first = enqueue(async () => { await wait(15); log.push('primeira'); return 1; });
  const second = enqueue(async () => { log.push('segunda'); return 2; });
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(log, ['primeira', 'segunda']);
});

test('uma falha chega a quem pediu e não trava a fila', async () => {
  const enqueue = createSerialQueue();
  const failed = enqueue(async () => { throw new Error('recusado'); });
  const next = enqueue(async () => 'ok');
  await assert.rejects(failed, /recusado/);
  assert.equal(await next, 'ok');
});
