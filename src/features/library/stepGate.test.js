import test from 'node:test';
import assert from 'node:assert/strict';
import { createStepGate, runStep, STEP_RETRY_MS } from './stepGate.js';

const notInstalled = () => Object.assign(new Error('x'), { code: 'PGRST202' });
const offline = () => new Error('Failed to fetch');

function clockedGate() {
  const clock = { time: 0 };
  return { clock, gate: createStepGate(() => clock.time) };
}

test('a step missing on the server is disabled, then retried after the wait', async () => {
  const { clock, gate } = clockedGate();
  let calls = 0;
  const action = async () => { calls += 1; throw notInstalled(); };
  await runStep('benefits', gate, action);
  await runStep('benefits', gate, action);
  assert.equal(calls, 1);
  clock.time = STEP_RETRY_MS;
  await runStep('benefits', gate, action);
  assert.equal(calls, 2);
});

test('a retried step works again once the migration is applied', async () => {
  const { clock, gate } = clockedGate();
  gate.disable('benefits');
  clock.time = STEP_RETRY_MS + 1;
  assert.equal(await runStep('benefits', gate, async () => 'ok'), 'ok');
  assert.equal(gate.isDisabled('benefits'), false);
});

test('reset re-enables every step (account change)', () => {
  const { gate } = clockedGate();
  gate.disable('xp');
  gate.reset();
  assert.equal(gate.isDisabled('xp'), false);
});

test('whole-cycle failures are rethrown and do not disable the step', async () => {
  const { gate } = clockedGate();
  await assert.rejects(runStep('xp', gate, async () => { throw offline(); }));
  assert.equal(gate.isDisabled('xp'), false);
});

test('other failures only skip the step', async () => {
  const { gate } = clockedGate();
  assert.equal(await runStep('xp', gate, async () => { throw new Error('Ficha inválida.'); }), undefined);
  assert.equal(gate.isDisabled('xp'), false);
});
