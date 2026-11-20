import test from 'node:test';
import assert from 'node:assert/strict';
import { createCycleRunner } from './cycleRunner.js';

const tick = () => new Promise(resolve => setImmediate(resolve));

test('requests during a cycle collapse into one repeat', async () => {
  let runs = 0;
  let release;
  const runner = createCycleRunner(() => { runs += 1; return new Promise(resolve => { release = resolve; }); });
  runner.request();
  runner.request();
  runner.request();
  assert.equal(runs, 1);
  release();
  await tick();
  assert.equal(runs, 2);
  release();
  await tick();
  assert.equal(runs, 2);
});

test('a failing cycle does not block the next one', async () => {
  let runs = 0;
  const runner = createCycleRunner(async () => { runs += 1; if (runs === 1) throw new Error('rede'); });
  await runner.request();
  await runner.request();
  assert.equal(runs, 2);
});

test('cancel stops new cycles and flips isCurrent for the one in flight', async () => {
  let current;
  let release;
  let runs = 0;
  const runner = createCycleRunner(({ isCurrent }) => { runs += 1; current = isCurrent; return new Promise(resolve => { release = resolve; }); });
  runner.request();
  runner.request();
  assert.equal(current(), true);
  runner.cancel();
  assert.equal(current(), false);
  release();
  await tick();
  runner.request();
  assert.equal(runs, 1);
});
