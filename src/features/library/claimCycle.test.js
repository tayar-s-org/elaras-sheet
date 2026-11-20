import test from 'node:test';
import assert from 'node:assert/strict';
import { runClaimCycle } from './claimCycle.js';
import { createStepGate } from './stepGate.js';

const sheet = (id, cloud = true) => ({ id, character: {}, ...(cloud ? { cloud: { id: `cloud-${id}` } } : {}) });

function setup({ sheets = [sheet('a'), sheet('b')], overrides = {}, current = () => true } = {}) {
  const calls = [];
  const sources = {
    peekBenefits: async () => { calls.push('peek'); return { evolutions: [] }; },
    listMyItems: async () => { calls.push('items'); return []; },
    claimXp: async (_ctx, s) => { calls.push(`xp:${s.id}`); },
    claimMoney: async (_ctx, s) => { calls.push(`money:${s.id}`); },
    claimItems: async (_ctx, s) => { calls.push(`claimItems:${s.id}`); },
    deliverBenefits: async (_ctx, id) => { calls.push(`deliver:${id}`); },
    ...overrides,
  };
  const ctx = { readSession: () => ({ sheets }), isCurrent: current };
  return { calls, sources, ctx, gate: createStepGate() };
}

test('shared lists are read once per cycle and every cloud sheet is processed', async () => {
  const { calls, sources, ctx, gate } = setup({ sheets: [sheet('a'), sheet('b'), sheet('local', false)] });
  await runClaimCycle(ctx, gate, sources);
  assert.equal(calls.filter(c => c === 'peek').length, 1);
  assert.equal(calls.filter(c => c === 'items').length, 1);
  assert.deepEqual(calls.filter(c => c.startsWith('deliver')), ['deliver:a', 'deliver:b']);
  assert.equal(calls.some(c => c.includes('local')), false);
});

test('no cloud sheet means no server call', async () => {
  const { calls, sources, ctx, gate } = setup({ sheets: [sheet('local', false)] });
  await runClaimCycle(ctx, gate, sources);
  assert.deepEqual(calls, []);
});

test('a benefits step missing on the server is skipped without stopping the other steps', async () => {
  const missing = async () => { throw Object.assign(new Error('x'), { code: 'PGRST202' }); };
  const { calls, sources, ctx, gate } = setup({ overrides: { peekBenefits: missing } });
  await runClaimCycle(ctx, gate, sources);
  assert.equal(gate.isDisabled('benefits'), true);
  assert.equal(calls.some(c => c.startsWith('deliver')), false);
  assert.deepEqual(calls.filter(c => c.startsWith('xp')), ['xp:a', 'xp:b']);
});

test('a business-rule failure in one sheet does not stop the others', async () => {
  const failsForA = async (_ctx, s) => { if (s.id === 'a') throw new Error('Ficha inválida.'); };
  const { calls, sources, ctx, gate } = setup({ overrides: { claimXp: failsForA } });
  await runClaimCycle(ctx, gate, sources);
  assert.deepEqual(calls.filter(c => c.startsWith('money')), ['money:a', 'money:b']);
});

test('a network failure ends the cycle quietly after the first failing call', async () => {
  const offline = async () => { throw new Error('Failed to fetch'); };
  const { calls, sources, ctx, gate } = setup({ overrides: { claimXp: offline } });
  await runClaimCycle(ctx, gate, sources);
  assert.equal(calls.some(c => c.startsWith('money')), false);
  assert.equal(calls.some(c => c.endsWith(':b')), false);
});

test('a cancelled cycle stops before touching the next sheet', async () => {
  let current = true;
  const { calls, sources, ctx, gate } = setup({ current: () => current });
  const claimXp = sources.claimXp;
  sources.claimXp = async (...args) => { await claimXp(...args); current = false; };
  await runClaimCycle(ctx, gate, sources);
  assert.deepEqual(calls.filter(c => c.startsWith('xp')), ['xp:a']);
});
