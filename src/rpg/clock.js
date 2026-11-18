// Calendário e relógio da campanha. Tudo é calculado a partir de um contador contínuo de horas ("tick"),
// sem usar Date do JavaScript.
//
//   tick 0 = Primeiro Mês, dia 1, 06:00 (todo começo de mesa).
//   O dia da campanha vai de 06:00 até 05:59 do dia civil seguinte; por isso a atividade das 23:00 às 02:00
//   pertence a um único dia da rotina e os limites diários reiniciam às 06:00.
//   Semana = 6 dias · mês = 30 dias (5 semanas) · ano = 12 meses = 360 dias.

export const HOURS_PER_DAY = 24;
export const DAYS_PER_WEEK = 6;
export const WEEKS_PER_MONTH = 5;
export const DAYS_PER_MONTH = DAYS_PER_WEEK * WEEKS_PER_MONTH; // 30
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR; // 360
export const DAY_START_HOUR = 6;
export const MAX_DAY = DAYS_PER_YEAR * 100; // trava de sanidade: 100 anos de campanha

export const MONTH_NAMES = [
  'Primeiro Mês', 'Segundo Mês', 'Terceiro Mês', 'Quarto Mês', 'Quinto Mês', 'Sexto Mês',
  'Sétimo Mês', 'Oitavo Mês', 'Nono Mês', 'Décimo Mês', 'Décimo Primeiro Mês', 'Décimo Segundo Mês',
];

const int = (v, name) => {
  if (!Number.isInteger(v) || v < 0) throw new RangeError(`${name} inválido: ${v}`);
  return v;
};

// Rótulos das 24 linhas da rotina: 06:00 … 23:00, 00:00 … 05:00.
export const SLOT_HOURS = Array.from({ length: HOURS_PER_DAY }, (_, i) => (DAY_START_HOUR + i) % HOURS_PER_DAY);
export const SLOT_LABELS = SLOT_HOURS.map(h => `${String(h).padStart(2, '0')}:00`);

// Hora do relógio (0–23) de uma linha da rotina (0 = 06:00).
export const slotToHour = slot => SLOT_HOURS[int(slot, 'slot') % HOURS_PER_DAY];
// Linha da rotina (0–23) de uma hora do relógio.
export const hourToSlot = hour => (int(hour, 'hora') - DAY_START_HOUR + HOURS_PER_DAY) % HOURS_PER_DAY;

export const dayOfTick = tick => Math.floor(int(tick, 'tick') / HOURS_PER_DAY);
export const slotOfTick = tick => int(tick, 'tick') % HOURS_PER_DAY;
export const tickOfDay = (dayNo, slot = 0) => int(dayNo, 'dia') * HOURS_PER_DAY + int(slot, 'slot');

// Dia absoluto (0 = primeiro dia da campanha) → ano, mês (1–12), dia do mês (1–30), semana (1–5) e dia da semana (1–6).
export function dayParts(dayNo) {
  const d = int(dayNo, 'dia');
  const year = Math.floor(d / DAYS_PER_YEAR) + 1;
  const inYear = d % DAYS_PER_YEAR;
  const month = Math.floor(inYear / DAYS_PER_MONTH) + 1;
  const day = (inYear % DAYS_PER_MONTH) + 1;
  return { year, month, day, week: Math.floor((day - 1) / DAYS_PER_WEEK) + 1, weekday: ((day - 1) % DAYS_PER_WEEK) + 1 };
}

// Ano, mês e dia do mês → dia absoluto.
export function partsToDay({ year, month, day }) {
  if (!Number.isInteger(year) || year < 1) throw new RangeError('Ano inválido');
  if (!Number.isInteger(month) || month < 1 || month > MONTHS_PER_YEAR) throw new RangeError('Mês inválido');
  if (!Number.isInteger(day) || day < 1 || day > DAYS_PER_MONTH) throw new RangeError('Dia inválido');
  return (year - 1) * DAYS_PER_YEAR + (month - 1) * DAYS_PER_MONTH + (day - 1);
}

// Tick → data e hora completas. `hour` é a hora do relógio (06 … 23, 00 … 05).
export function tickToParts(tick) {
  const t = int(tick, 'tick');
  const dayNo = Math.floor(t / HOURS_PER_DAY);
  const slot = t % HOURS_PER_DAY;
  return { tick: t, dayNo, slot, hour: slotToHour(slot), ...dayParts(dayNo) };
}

export function partsToTick({ year, month, day, hour = DAY_START_HOUR }) {
  return tickOfDay(partsToDay({ year, month, day }), hourToSlot(hour));
}

// Navegação do calendário: 12 meses por ano, ano 1 é o primeiro. { year, month } com month de 1 a 12.
export function shiftMonth({ year, month }, delta) {
  const index = (year - 1) * MONTHS_PER_YEAR + (month - 1) + delta;
  const clamped = Math.max(0, index);
  return { year: Math.floor(clamped / MONTHS_PER_YEAR) + 1, month: (clamped % MONTHS_PER_YEAR) + 1 };
}

// Cinco semanas de seis dias; cada célula traz o dia do mês (1–30) e o dia absoluto da campanha.
export function monthGrid(year, month) {
  const first = partsToDay({ year, month, day: 1 });
  return Array.from({ length: WEEKS_PER_MONTH }, (_, w) => Array.from({ length: DAYS_PER_WEEK }, (_, i) => {
    const day = w * DAYS_PER_WEEK + i + 1;
    return { day, dayNo: first + day - 1 };
  }));
}

export const WEEKDAY_LABELS = Array.from({ length: DAYS_PER_WEEK }, (_, i) => `Dia ${i + 1}`);

export const monthName = month => MONTH_NAMES[int(month - 1, 'mês') % MONTHS_PER_YEAR];

export function formatDay(dayNo) {
  const p = dayParts(dayNo);
  return `${monthName(p.month)}, dia ${p.day}${p.year > 1 ? ` (ano ${p.year})` : ''}`;
}

export function formatClock(tick) {
  const p = tickToParts(tick);
  return `${formatDay(p.dayNo)}, ${String(p.hour).padStart(2, '0')}:00`;
}

// Avanço em horas ou em dias inteiros (dias = 24 h a partir do tick atual, mantendo o horário).
export function hoursFor({ unit, amount }) {
  const n = Number(amount);
  if (!Number.isInteger(n) || n < 1) throw new RangeError('Informe um número inteiro maior que zero.');
  return unit === 'days' ? n * HOURS_PER_DAY : n;
}

// Dias da campanha que um avanço de `fromTick` até `fromTick + hours` precisa ter preenchidos:
// do dia atual até o dia de destino, inclusive (o destino conta mesmo que só chegue às 06:00).
export function daysToCheck(fromTick, hours) {
  const from = dayOfTick(fromTick);
  const to = dayOfTick(int(fromTick, 'tick') + int(hours, 'horas'));
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

// Um dia fica travado (não pode mais ser trocado pelo jogador) depois que sua primeira hora passou.
export const isDayLocked = (dayNo, currentTick) => {
  const cur = dayOfTick(currentTick);
  return dayNo < cur || (dayNo === cur && slotOfTick(currentTick) > 0);
};
