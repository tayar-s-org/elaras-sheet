import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRewards, rewardAmount, customRewards } from './rewardsLog.js';

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

test('moedas e experiências personalizadas entram no registro com a diferença, o nome e o ícone', () => {
  const custom = [
    { id: 1, category: 'wallet', kind: 'add', character_id: 'c', created_at: '2026-01-01T12:00:00Z', before: { name: 'Prata', symbol: '@euro', amount: 5 }, after: { name: 'Prata', symbol: '@euro', amount: 25 } },
    { id: 2, category: 'experience', kind: 'subtract', character_id: 'c', created_at: '2026-01-01T13:00:00Z', before: { name: 'Fama', icon: '@xp', amount: 10 }, after: { name: 'Fama', icon: '@xp', amount: 4 } },
    { id: 3, category: 'wallet', kind: 'set', character_id: 'c', created_at: '2026-01-01T14:00:00Z', before: { name: 'Prata', amount: 25 }, after: { name: 'Prata', amount: 25 } },
  ];
  const list = customRewards(custom);
  assert.equal(list.length, 2); // 'definir' sem mudança some
  assert.deepEqual(list.map(r => [r.label, r.amount, r.icon]), [['Prata', 20, '@euro'], ['Fama', -6, '@xp']]);
  const out = mergeRewards([{ id: 'a', amount: 5, created_at: '2026-01-01T12:30:00Z' }], null, 80, custom);
  assert.deepEqual(out.map(e => e.key), ['c2', 'xa', 'c1']);
  assert.deepEqual(out.map(e => e.kind), ['experience', 'xp', 'wallet']);
  assert.equal(rewardAmount(out[0], fmt), '−6');
  assert.equal(rewardAmount(out[2], fmt), '+20');
});
