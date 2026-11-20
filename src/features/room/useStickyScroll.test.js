import test from 'node:test';
import assert from 'node:assert/strict';
import { isNearEnd } from './useStickyScroll.js';

test('isNearEnd: no fim ou ate 48px dele continua acompanhando', () => {
  assert.equal(isNearEnd({ scrollTop: 600, clientHeight: 400, scrollHeight: 1000 }), true);
  assert.equal(isNearEnd({ scrollTop: 552, clientHeight: 400, scrollHeight: 1000 }), true);
});

test('isNearEnd: lendo o historico acima do fim nao acompanha', () => {
  assert.equal(isNearEnd({ scrollTop: 100, clientHeight: 400, scrollHeight: 1000 }), false);
  assert.equal(isNearEnd({ scrollTop: 551, clientHeight: 400, scrollHeight: 1000 }), false);
});
