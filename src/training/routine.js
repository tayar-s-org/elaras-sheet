import { SLOT_LABELS, HOURS_PER_DAY } from '../rpg/clock.js';
import { ACTIVITIES, ACT, ENABLED_ACTIVITIES, rowIssue, blockedReason } from '../rpg/activities.js';
import { simulateDay } from '../rpg/processor.js';

// Rotina de treino: um dia de 24 horas (06:00 → 05:00 do dia seguinte). Este módulo cuida do FORMATO gravado
// (normalização e migração do sistema antigo); as regras de custo e ganho ficam em src/rpg/.

export const HOURS = SLOT_LABELS;
export const ROUTINE_VERSION = 2;
export { ACTIVITIES, blockedReason };

// Atividades do sistema antigo que têm equivalente direto. As demais (treino físico, estudo, prática, aprimorar, outra)
// precisam ser refeitas pelo jogador (perícia/feitiço escolhido), então viram linha vazia.
const LEGACY_ACTIVITY = { meditar: ACT.MEDITATE, descanso: ACT.REST, simples: ACT.QUICK };

// Rotina do formato antigo → grade nova. A linha antiga i era a hora (i+1) e a nova é a hora 06:00 + i, então
// a linha nova i vem da antiga (i+5) mod 24. O original fica em `legacy_v1` e nada se perde.
export function migrateRoutineV1toV2(raw) {
  if (!raw || typeof raw !== 'object' || raw.v === ROUTINE_VERSION) return raw;
  const { legacy_v1: previous, ...rest } = raw;
  const old = Array.isArray(rest.rows) ? rest.rows : [];
  return {
    ...rest,
    v: ROUTINE_VERSION,
    rows: HOURS.map((_, i) => old[(i + 5) % HOURS_PER_DAY] ?? { a: '', n: '' }),
    legacy_v1: previous ?? raw,
  };
}

export const emptyRow = () => ({ a: '', skill: '', spell: '', job: '', mode: 'normal', n: '' });
export const emptyRoutine = () => ({
  v: ROUTINE_VERSION, period: '', place: '', fed: true, startStamina: null, startMana: null,
  rows: HOURS.map(emptyRow),
});

const text = (v, max) => String(v || '').slice(0, max);

// Garante o formato (dados vindos do banco podem estar incompletos, antigos ou adulterados).
export function normalizeRoutine(input) {
  if (!input || typeof input !== 'object') return emptyRoutine();
  const raw = migrateRoutineV1toV2(input);
  const num = (v, min, max) => (v === null || v === undefined || v === '' ? null : Math.min(max, Math.max(min, Math.trunc(Number(v)) || 0)));
  const known = new Set(ENABLED_ACTIVITIES);
  const out = {
    v: ROUTINE_VERSION,
    period: text(raw.period, 60),
    place: text(raw.place, 100),
    fed: raw.fed !== false,
    startStamina: num(raw.startStamina, 0, 1000),
    startMana: num(raw.startMana, 0, 100000),
    rows: HOURS.map((_, i) => {
      const r = Array.isArray(raw.rows) ? raw.rows[i] : null;
      const a = known.has(r?.a) ? r.a : (LEGACY_ACTIVITY[r?.a] || '');
      return {
        a,
        skill: a === ACT.SKILL ? text(r?.skill, 60) : '',
        spell: a === ACT.SPELL || a === ACT.STUDY ? text(r?.spell, 64) : '',
        job: a === ACT.WORK && /^[0-9a-f-]{36}$/i.test(r?.job || '') ? r.job : '',
        mode: (a === ACT.SKILL || a === ACT.SPELL) && r?.mode === 'focused' ? 'focused' : 'normal',
        n: text(r?.n, 200),
      };
    }),
  };
  if (raw.legacy_v1) out.legacy_v1 = raw.legacy_v1;
  return out;
}

// Linhas preenchidas que ainda têm problema (perícia/feitiço não escolhido etc.). Uma rotina com problema não deve ser enviada.
export function routineProblems(routine, stats) {
  return normalizeRoutine(routine).rows.flatMap((row, i) => {
    const issue = row.a ? rowIssue(row, stats) : '';
    return issue ? [{ slot: i, hour: HOURS[i], issue }] : [];
  });
}

// Simulação do dia (editor): custos, recuperação e XP, com as mesmas regras do processamento real.
export function simulateRoutine(routine, stats) {
  const r = normalizeRoutine(routine);
  const sim = simulateDay(r.rows, { stats, fed: r.fed, startStamina: r.startStamina ?? undefined, startMana: r.startMana ?? undefined });
  return { ...sim, hours: HOURS };
}
