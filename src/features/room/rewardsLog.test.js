import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRewards, rewardAmount } from './rewardsLog.js';

const fmt = n => String(n);

test('mergeRewards: mistura XP e dinheiro, mais recente primeiro', () => {
  const xp = [{ id: 'a', amount: 5, created_at: '2026-01-01T10:00:00Z' }];
  const money = [{ id: 'b', amount: 100, created_at: '2026-01-01T11:00:00Z' }, { id: 'c', amount: -50, created_at: '2026-01-01T09:00:00Z' }];
  const out = mergeRewards(xp, money);
  assert.deepEqual(out.map(e => e.key), ['db', 'xa', 'dc']);
  assert.deepEqual(out.map(e => e.kind), ['money', 'xp', 'money']);
});

test('mergeRewards: aceita listas ausentes e respeita o limite', () => {
  assert.deepEqual(mergeRewards(null, null), []);
  const many = Array.from({ length: 5 }, (_, i) => ({ id: String(i), amount: 1, created_at: `2026-01-0${i + 1}T00:00:00Z` }));
  assert.equal(mergeRewards(many, null, 3).length, 3);
});

test('rewardAmount: sinal e unidade', () => {
  assert.equal(rewardAmount({ kind: 'xp', amount: 50 }, fmt), '+50 XP');
  assert.equal(rewardAmount({ kind: 'money', amount: 300 }, fmt), '+$300');
  assert.equal(rewardAmount({ kind: 'money', amount: -300 }, fmt), '−$300');
});
