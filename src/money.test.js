import test from 'node:test';
import assert from 'node:assert/strict';
import { START_MONEY, MAX_MONEY, normalizeMoney, addMoney, formatMoney } from './money.js';
import { newCharacter, elaraCharacter, validateCharacter } from './rules.js';
import { createPdfBlob, importPdf } from './pdf.js';

test('toda ficha nova começa com 500 de dinheiro', () => {
  assert.equal(START_MONEY, 500);
  assert.equal(newCharacter().money, 500);
  assert.equal(elaraCharacter().money, 500);
  assert.equal(validateCharacter(newCharacter()).money, 500);
});

test('ficha antiga sem o campo passa a ter 500; valores inválidos são corrigidos', () => {
  const legacy = { ...newCharacter() };
  delete legacy.money;
  assert.equal(validateCharacter(legacy).money, 500);
  assert.equal(validateCharacter({ ...newCharacter(), money: null }).money, 500);
  assert.equal(validateCharacter({ ...newCharacter(), money: 0 }).money, 0);   // gastar tudo é válido
  assert.equal(validateCharacter({ ...newCharacter(), money: 1234 }).money, 1234);
  assert.equal(validateCharacter({ ...newCharacter(), money: -50 }).money, 0);
  assert.equal(validateCharacter({ ...newCharacter(), money: 'abc' }).money, 0);
  assert.equal(validateCharacter({ ...newCharacter(), money: 12.9 }).money, 12);
  assert.equal(validateCharacter({ ...newCharacter(), money: 1e15 }).money, MAX_MONEY);
});

test('addMoney soma, respeita o limite e ignora valores inválidos', () => {
  assert.equal(addMoney(500, 250), 750);
  assert.equal(addMoney(undefined, 100), 600);        // ficha sem o campo parte de 500
  assert.equal(addMoney(0, 1), 1);
  assert.equal(addMoney(MAX_MONEY - 5, 100), MAX_MONEY);
  assert.equal(addMoney(500, -10), 500);
  assert.equal(addMoney(500, 'x'), 500);
  assert.equal(addMoney(500, 2.9), 502);
});

test('formatMoney usa separador de milhar brasileiro', () => {
  assert.equal(formatMoney(500), '500');
  assert.equal(formatMoney(1250), '1.250');
  assert.equal(formatMoney(1234567), '1.234.567');
  assert.equal(formatMoney(undefined), '500');
});

test('o dinheiro sobrevive à exportação e reimportação do PDF', async () => {
  const c = { ...newCharacter(), name: 'Tester', money: 777 };
  const back = await importPdf(createPdfBlob(c));
  assert.equal(back.money, 777);
});
