import test from 'node:test';
import assert from 'node:assert/strict';
import { IDLE_STATUS, statusOf, summarizeOtherSheets, describeOtherSheets } from './saveStatus.js';

const sheets = ['a', 'b', 'c', 'd'].map(id => ({ id }));

test('o salvamento de outra ficha não troca o erro da ficha com conflito', () => {
  const statuses = { a: { state: 'error', message: 'conflito' } };
  statuses.b = { state: 'saved', message: 'Salvo na nuvem' };
  assert.equal(statusOf(statuses, 'a').state, 'error');
  assert.equal(statusOf(statuses, 'b').state, 'saved');
  assert.equal(statusOf(statuses, 'c'), IDLE_STATUS);
});

test('resumo agregado conta salvando e com erro nas outras fichas, sem a ativa', () => {
  const statuses = { a: { state: 'error', message: 'x' }, b: { state: 'error', message: 'y' }, c: { state: 'saving', message: '' }, d: { state: 'saved', message: '' } };
  assert.deepEqual(summarizeOtherSheets(statuses, sheets, 'a'), { saving: 1, failed: 1 });
  assert.deepEqual(summarizeOtherSheets(statuses, sheets, 'd'), { saving: 1, failed: 2 });
});

test('ficha fechada deixa de contar no resumo', () => {
  const statuses = { gone: { state: 'error', message: 'x' } };
  assert.deepEqual(summarizeOtherSheets(statuses, sheets, 'a'), { saving: 0, failed: 0 });
});

test('texto agregado só aparece quando há pendências nas outras fichas', () => {
  assert.equal(describeOtherSheets({ saving: 0, failed: 0 }), '');
  assert.equal(describeOtherSheets({ saving: 1, failed: 2 }), '2 outra(s) ficha(s) com problema para salvar · 1 outra(s) salvando');
});
