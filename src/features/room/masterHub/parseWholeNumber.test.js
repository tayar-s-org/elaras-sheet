import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWholeNumber } from './core.js';

test('campo vazio ou em branco nunca vira zero', () => {
  for (const text of ['', '   ', null, undefined]) assert.equal(parseWholeNumber(text).ok, false);
});

test('aceita inteiros com ou sem sinal e ignora espaços nas pontas', () => {
  assert.deepEqual(parseWholeNumber('50'), { ok: true, value: 50 });
  assert.deepEqual(parseWholeNumber(' -10 '), { ok: true, value: -10 });
  assert.deepEqual(parseWholeNumber('0'), { ok: true, value: 0 });
});

test('recusa decimais, notação científica, texto e números fora da faixa segura', () => {
  for (const text of ['1.5', '1,5', '1e3', 'abc', '--1', '9007199254740993']) assert.equal(parseWholeNumber(text).ok, false, text);
});
