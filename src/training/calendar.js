// Calendário mensal das rotinas de treino: cada dia do mês guarda, no máximo, uma rotina (por id).

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const UUID = /^[0-9a-f-]{36}$/i;

// Chave do mês no banco: "2026-08" (month de 0 a 11).
export const monthKey = (year, month) => `${year}-${String(month + 1).padStart(2, '0')}`;
export const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

// Semanas do mês começando no domingo: cada linha tem 7 posições, com null antes do dia 1 e depois do último dia.
export function monthWeeks(year, month) {
  const lead = new Date(year, month, 1).getDay();
  const total = daysInMonth(year, month);
  const cells = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

export function shiftMonth({ year, month }, delta) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

// Dias gravados (chave = dia do mês). Descarta dias fora do mês e valores que não são ids.
export function sanitizeDays(raw, year, month) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  const max = daysInMonth(year, month);
  for (const [k, v] of Object.entries(raw)) {
    const day = Number(k);
    if (Number.isInteger(day) && day >= 1 && day <= max && typeof v === 'string' && UUID.test(v)) out[String(day)] = v;
  }
  return out;
}

// Coloca (ou tira, com null) uma rotina num dia. Devolve um objeto novo.
export function setDay(days, day, routineId) {
  const next = { ...days };
  if (routineId) next[String(day)] = routineId; else delete next[String(day)];
  return next;
}

// Quantos dias do mês cada rotina ocupa: { id: n }.
export function countByRoutine(days) {
  const out = {};
  for (const id of Object.values(days || {})) out[id] = (out[id] || 0) + 1;
  return out;
}

// Cor estável por rotina (tom a partir do id).
export function routineHue(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
