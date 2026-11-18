import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAYS_PER_WEEK, DAYS_PER_MONTH, MONTHS_PER_YEAR, DAYS_PER_YEAR, MONTH_NAMES, SLOT_LABELS,
  tickToParts, partsToTick, dayParts, partsToDay, monthGrid, shiftMonth, formatClock, hoursFor,
  daysToCheck, isDayLocked, hourToSlot, slotToHour, dayOfTick, slotOfTick,
} from './clock.js';

test('estrutura: semana de 6 dias, mês de 30, ano de 12 meses e 360 dias', () => {
  assert.equal(DAYS_PER_WEEK, 6);
  assert.equal(DAYS_PER_MONTH, 30);
  assert.equal(MONTHS_PER_YEAR, 12);
  assert.equal(DAYS_PER_YEAR, 360);
  assert.equal(MONTH_NAMES.length, 12);
  assert.equal(MONTH_NAMES[0], 'Primeiro Mês');
  assert.equal(MONTH_NAMES[10], 'Décimo Primeiro Mês');
  assert.equal(MONTH_NAMES[11], 'Décimo Segundo Mês');
});

test('toda mesa começa no Primeiro Mês, dia 1, 06:00', () => {
  const p = tickToParts(0);
  assert.deepEqual([p.year, p.month, p.day, p.hour, p.slot, p.dayNo], [1, 1, 1, 6, 0, 0]);
  assert.equal(formatClock(0), 'Primeiro Mês, dia 1, 06:00');
});

test('mês grade: 5 semanas de 6 colunas, dias 1 a 30 em ordem', () => {
  const grid = monthGrid(1, 1);
  assert.equal(grid.length, 5);
  assert.ok(grid.every(w => w.length === 6));
  assert.deepEqual(grid.flat().map(c => c.day), Array.from({ length: 30 }, (_, i) => i + 1));
  assert.deepEqual(grid.flat().map(c => c.dayNo), Array.from({ length: 30 }, (_, i) => i));
  assert.equal(monthGrid(1, 2)[0][0].dayNo, 30);
  assert.equal(monthGrid(2, 1)[0][0].dayNo, 360);
});

test('transição entre meses e entre anos', () => {
  assert.deepEqual(dayParts(29), { year: 1, month: 1, day: 30, week: 5, weekday: 6 });
  assert.deepEqual(dayParts(30), { year: 1, month: 2, day: 1, week: 1, weekday: 1 });
  assert.deepEqual(dayParts(359), { year: 1, month: 12, day: 30, week: 5, weekday: 6 });
  assert.deepEqual(dayParts(360), { year: 2, month: 1, day: 1, week: 1, weekday: 1 });
  assert.equal(dayParts(6).weekday, 1, 'o dia 7 abre a segunda semana');
  assert.equal(dayParts(6).week, 2);
  assert.deepEqual(shiftMonth({ year: 1, month: 12 }, 1), { year: 2, month: 1 });
  assert.deepEqual(shiftMonth({ year: 2, month: 1 }, -1), { year: 1, month: 12 });
  assert.deepEqual(shiftMonth({ year: 1, month: 1 }, -1), { year: 1, month: 1 }, 'não existe ano 0');
  assert.deepEqual(shiftMonth({ year: 1, month: 3 }, 24), { year: 3, month: 3 });
});

test('conversão de ida e volta entre contador e data (sem Date do JS)', () => {
  for (const tick of [0, 1, 17, 18, 23, 24, 719, 720, 8639, 8640, 8641, 123456]) {
    const p = tickToParts(tick);
    assert.equal(partsToTick(p), tick, `tick ${tick}`);
  }
  assert.equal(partsToDay({ year: 3, month: 5, day: 7 }), 2 * 360 + 4 * 30 + 6);
  assert.throws(() => partsToDay({ year: 1, month: 13, day: 1 }), RangeError);
  assert.throws(() => partsToDay({ year: 1, month: 1, day: 31 }), RangeError);
  assert.throws(() => tickToParts(-1), RangeError);
  assert.throws(() => tickToParts(1.5), RangeError);
});

test('24 horários: 06:00 … 23:00, 00:00 … 05:00', () => {
  assert.equal(SLOT_LABELS.length, 24);
  assert.deepEqual(SLOT_LABELS, [
    '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
    '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00', '05:00',
  ]);
  assert.equal(hourToSlot(6), 0);
  assert.equal(hourToSlot(0), 18);
  assert.equal(hourToSlot(5), 23);
  assert.equal(slotToHour(18), 0);
});

test('virada de 23:00 para 00:00 mantém o mesmo dia; 05:00 para 06:00 troca o dia', () => {
  const t2300 = partsToTick({ year: 1, month: 1, day: 1, hour: 23 });
  const t0000 = t2300 + 1;
  const t0500 = partsToTick({ year: 1, month: 1, day: 1, hour: 5 });
  assert.equal(tickToParts(t2300).hour, 23);
  assert.equal(tickToParts(t0000).hour, 0);
  assert.equal(dayOfTick(t2300), dayOfTick(t0000), 'meia-noite não troca o dia da campanha');
  assert.equal(tickToParts(t0500).hour, 5);
  assert.equal(tickToParts(t0500).day, 1);
  assert.equal(tickToParts(t0500 + 1).hour, 6);
  assert.equal(tickToParts(t0500 + 1).day, 2, 'às 06:00 começa o dia seguinte');
  assert.equal(slotOfTick(t0500 + 1), 0);
});

test('avançar: 1 hora, várias horas, 1 dia e vários dias', () => {
  assert.equal(hoursFor({ unit: 'hours', amount: 1 }), 1);
  assert.equal(hoursFor({ unit: 'hours', amount: 7 }), 7);
  assert.equal(hoursFor({ unit: 'days', amount: 1 }), 24);
  assert.equal(hoursFor({ unit: 'days', amount: 4 }), 96);
  assert.throws(() => hoursFor({ unit: 'hours', amount: 0 }), RangeError);
  assert.throws(() => hoursFor({ unit: 'days', amount: 1.5 }), RangeError);
  assert.equal(formatClock(0 + 1), 'Primeiro Mês, dia 1, 07:00');
  assert.equal(formatClock(24 * 30), 'Segundo Mês, dia 1, 06:00');
  assert.equal(formatClock(24 * 360 + 3), 'Primeiro Mês, dia 1 (ano 2), 09:00');
});

test('dias que precisam estar preenchidos: do dia atual ao dia de destino, inclusive', () => {
  assert.deepEqual(daysToCheck(0, 1), [0], '+1 h no dia 1');
  assert.deepEqual(daysToCheck(0, 23), [0], 'até 05:00 do dia 1');
  assert.deepEqual(daysToCheck(0, 24), [0, 1], 'chegar às 06:00 do dia 2 exige o dia 2');
  assert.deepEqual(daysToCheck(0, 24 * 4), [0, 1, 2, 3, 4], 'do dia 1 ao dia 5');
  assert.deepEqual(daysToCheck(5, 20), [0, 1], 'no meio do dia 1 (11:00), +20 h cai no dia 2');
  assert.deepEqual(daysToCheck(24 * 29 + 3, 24), [29, 30], 'atravessa o mês');
});

test('dia travado: depois que a primeira hora passou', () => {
  assert.equal(isDayLocked(0, 0), false, 'dia 1 às 06:00 ainda está livre');
  assert.equal(isDayLocked(0, 1), true, 'dia 1 depois de uma hora');
  assert.equal(isDayLocked(1, 24), false);
  assert.equal(isDayLocked(0, 24), true);
  assert.equal(isDayLocked(5, 24), false);
});
