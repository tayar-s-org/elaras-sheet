import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignedUrlCache } from './signedUrlCache.js';

const HOUR = 3600 * 1000;

function setup(overrides = {}) {
  const clock = { t: 0 };
  const calls = [];
  const sign = async key => { calls.push(key); return `${key}?n=${calls.length}`; };
  const cache = createSignedUrlCache({ sign, ttlMs: 6 * HOUR, marginMs: 10 * 60 * 1000, now: () => clock.t, ...overrides });
  return { clock, calls, cache };
}

test('reaproveita o link enquanto ele vale', async () => {
  const { clock, calls, cache } = setup();
  const first = await cache.get('a.mp3');
  clock.t = 5 * HOUR;
  assert.equal(await cache.get('a.mp3'), first);
  assert.equal(calls.length, 1);
});

test('renova antes de expirar, dentro da margem de segurança', async () => {
  const { clock, calls, cache } = setup();
  await cache.get('a.mp3');
  clock.t = 6 * HOUR - 5 * 60 * 1000;
  const renewed = await cache.get('a.mp3');
  assert.equal(calls.length, 2);
  assert.match(renewed, /n=2$/);
});

test('pedidos simultâneos da mesma chave viram um só', async () => {
  const { calls, cache } = setup();
  const [a, b] = await Promise.all([cache.get('a.mp3'), cache.get('a.mp3')]);
  assert.equal(a, b);
  assert.equal(calls.length, 1);
});

test('falha não fica em cache e a próxima tentativa pede de novo', async () => {
  let fail = true;
  const sign = async () => { if (fail) throw new Error('sem rede'); return 'ok'; };
  const cache = createSignedUrlCache({ sign, ttlMs: HOUR });
  await assert.rejects(cache.get('a'), /sem rede/);
  fail = false;
  assert.equal(await cache.get('a'), 'ok');
});

test('forget obriga a pedir um link novo', async () => {
  const { calls, cache } = setup();
  await cache.get('a.mp3');
  cache.forget('a.mp3');
  await cache.get('a.mp3');
  assert.equal(calls.length, 2);
});

test('chaves diferentes não se misturam', async () => {
  const { calls, cache } = setup();
  await cache.get('a.mp3');
  await cache.get('b.mp3');
  assert.deepEqual(calls, ['a.mp3', 'b.mp3']);
});

test('forget durante um pedido em andamento impede que o link velho volte para o cache', async () => {
  let release;
  const calls = [];
  const sign = key => new Promise(resolve => { calls.push(key); release = () => resolve(`link-${calls.length}`); });
  const cache = createSignedUrlCache({ sign, ttlMs: HOUR });
  const stale = cache.get('a');
  cache.forget('a');
  release();
  assert.equal(await stale, 'link-1');
  const fresh = cache.get('a');
  release();
  assert.equal(await fresh, 'link-2');
  assert.equal(calls.length, 2);
});
