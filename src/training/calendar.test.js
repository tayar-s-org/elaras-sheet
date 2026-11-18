import test from 'node:test';
import assert from 'node:assert/strict';
import { monthKey, daysInMonth, monthWeeks, shiftMonth, sanitizeDays, setDay, countByRoutine, routineHue } from './calendar.js';

const A = '123e4567-e89b-12d3-a456-426614174000';
const B = '123e4567-e89b-12d3-a456-426614174001';

test('agosto de 2026 começa num sábado e tem 6 semanas, como no modelo', () => {
  const weeks = monthWeeks(2026, 7);
  assert.equal(daysInMonth(2026, 7), 31);
  assert.equal(weeks.length, 6);
  assert.deepEqual(weeks[0], [null, null, null, null, null, null, 1]);
  assert.deepEqual(weeks[1], [2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(weeks[5], [30, 31, null, null, null, null, null]);
  assert.equal(weeks.flat().filter(Boolean).length, 31);
  assert.ok(weeks.every(w => w.length === 7));
});

test('fevereiro e anos bissextos', () => {
  assert.equal(daysInMonth(2024, 1), 29);
  assert.equal(daysInMonth(2026, 1), 28);
  assert.equal(monthWeeks(2026, 1).flat().filter(Boolean).length, 28);
});

test('chave do mês e navegação entre meses', () => {
  assert.equal(monthKey(2026, 7), '2026-08');
  assert.equal(monthKey(2026, 11), '2026-12');
  assert.deepEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 });
});

test('uma rotina pode preencher vários dias; limpar um dia não mexe nos outros', () => {
  let days = {};
  for (const d of [3, 4, 5]) days = setDay(days, d, A);
  days = setDay(days, 10, B);
  assert.deepEqual(countByRoutine(days), { [A]: 3, [B]: 1 });
  days = setDay(days, 4, null);
  assert.deepEqual(Object.keys(days).sort(), ['10', '3', '5']);
  days = setDay(days, 3, B); // trocar a rotina de um dia
  assert.equal(days['3'], B);
});

test('sanitizeDays descarta dia fora do mês e valor que não é id', () => {
  const clean = sanitizeDays({ 1: A, 31: B, 32: A, 0: A, x: A, 5: 'não é id', 6: 99 }, 2026, 7);
  assert.deepEqual(clean, { 1: A, 31: B });
  assert.deepEqual(sanitizeDays({ 31: A }, 2026, 8), {}, 'setembro só tem 30 dias');
  assert.deepEqual(sanitizeDays(null, 2026, 7), {});
});

test('a cor da rotina é estável e diferente entre ids', () => {
  assert.equal(routineHue(A), routineHue(A));
  assert.notEqual(routineHue(A), routineHue(B));
  assert.ok(routineHue(A) >= 0 && routineHue(A) < 360);
});
