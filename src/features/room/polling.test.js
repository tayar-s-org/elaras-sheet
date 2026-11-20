import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoalescedRunner, pollWhileVisible } from './polling.js';

function fakeDocument() {
  const listeners = new Set();
  return {
    visibilityState: 'visible',
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
    show() { this.visibilityState = 'visible'; listeners.forEach(fn => fn()); },
    hide() { this.visibilityState = 'hidden'; listeners.forEach(fn => fn()); },
    listenerCount: () => listeners.size,
  };
}

test('pollWhileVisible pausa com a aba oculta, retoma ao voltar e limpa tudo ao parar', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const doc = fakeDocument();
  let calls = 0;
  const stop = pollWhileVisible(() => { calls += 1; }, 1000, doc);
  t.mock.timers.tick(2000);
  assert.equal(calls, 2);
  doc.hide();
  t.mock.timers.tick(3000);
  assert.equal(calls, 2);
  doc.show();
  assert.equal(calls, 3);
  stop();
  t.mock.timers.tick(5000);
  assert.equal(calls, 3);
  assert.equal(doc.listenerCount(), 0);
});

test('createCoalescedRunner nunca roda em paralelo e junta pedidos feitos durante a execucao', async () => {
  let running = 0, maxRunning = 0, runs = 0;
  let release;
  const run = createCoalescedRunner(async () => {
    runs += 1;
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await new Promise(resolve => { release = resolve; });
    running -= 1;
  });
  const first = run();
  run(); run(); run();
  assert.equal(runs, 1);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runs, 2); // os tres pedidos viraram uma unica releitura
  release();
  await first;
  assert.equal(runs, 2);
  assert.equal(maxRunning, 1);
});

test('createCoalescedRunner: falha da tarefa nao rejeita nem perde o pedido pendente', async () => {
  let runs = 0;
  let release;
  const run = createCoalescedRunner(async () => {
    runs += 1;
    if (runs === 1) {
      await new Promise(resolve => { release = resolve; });
      throw new Error('falhou');
    }
  });
  const first = run();
  run();
  release();
  await first; // nao rejeita
  assert.equal(runs, 2);
  await run();
  assert.equal(runs, 3);
});
