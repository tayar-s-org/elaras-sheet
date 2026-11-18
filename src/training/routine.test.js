import test from 'node:test';
import assert from 'node:assert/strict';
import { HOURS, ROUTINE_VERSION, migrateRoutineV1toV2, emptyRoutine, normalizeRoutine, simulateRoutine, routineProblems } from './routine.js';
import { ACT } from '../rpg/activities.js';

const stats = {
  maxStamina: 60, maxMana: 40, spirit: { die: 12, bonus: 0 }, conjurar: { die: 12, bonus: 0 }, meditar: { die: 8, bonus: 0 },
  skills: ['Atirar', 'Lutar', 'Conjurar'], spells: [{ id: 'p0-x', name: 'Bola de fogo' }], trainedSpells: ['p0-x'],
};
const plan = (acts, extra = {}) => {
  const r = { ...emptyRoutine(), ...extra };
  acts.forEach(([hour, row]) => { r.rows[HOURS.indexOf(hour)] = { a: '', skill: '', spell: '', mode: 'normal', n: '', ...row }; });
  return r;
};
const run = (row, hours, extra) => plan(HOURS.slice(0, hours).map(h => [h, row]), extra);

test('a grade da rotina começa às 06:00 e termina às 05:00', () => {
  assert.equal(HOURS.length, 24);
  assert.equal(HOURS[0], '06:00');
  assert.equal(HOURS[17], '23:00');
  assert.equal(HOURS[18], '00:00');
  assert.equal(HOURS[23], '05:00');
  assert.equal(emptyRoutine().v, ROUTINE_VERSION);
});

test('migração v1→v2: a hora antiga continua sendo a mesma hora, o original fica em legacy_v1', () => {
  const oldRows = Array.from({ length: 24 }, (_, i) => ({ a: '', n: `h${(i + 1) % 24}` }));
  oldRows[5] = { a: 'meditar', n: 'seis da manhã' };
  oldRows[23] = { a: 'descanso', n: 'meia-noite' };
  oldRows[0] = { a: 'simples', n: 'uma da manhã' };
  oldRows[10] = { a: 'fisico', n: 'sem perícia escolhida' };
  const old = { period: 'p', place: 'l', fed: true, rows: oldRows };
  const m = migrateRoutineV1toV2(old);
  assert.equal(m.v, 2);
  assert.equal(m.rows[0].n, 'seis da manhã');
  assert.equal(m.rows[HOURS.indexOf('00:00')].n, 'meia-noite');
  assert.equal(m.rows[HOURS.indexOf('01:00')].n, 'uma da manhã');
  assert.deepEqual(m.legacy_v1, old, 'dados originais preservados');
  assert.equal(migrateRoutineV1toV2(m), m, 'já migrada: não mexe de novo');
  const n = normalizeRoutine(old);
  assert.equal(n.rows[0].a, ACT.MEDITATE);
  assert.equal(n.rows[HOURS.indexOf('00:00')].a, ACT.REST);
  assert.equal(n.rows[HOURS.indexOf('01:00')].a, ACT.QUICK);
  assert.equal(n.rows[HOURS.indexOf('11:00')].a, '', 'treino físico antigo não tem perícia: vira linha vazia');
  assert.equal(n.rows[HOURS.indexOf('11:00')].n, 'sem perícia escolhida', 'a anotação continua');
  assert.deepEqual(n.legacy_v1, old);
});

test('rotina já convertida pelo SQL (v:2 com ids antigos) é lida com os mesmos equivalentes', () => {
  const rows = HOURS.map(() => ({ a: '', n: '' }));
  rows[0] = { a: 'descanso', n: '' };
  rows[1] = { a: 'aprimorar', n: '' };
  const n = normalizeRoutine({ v: 2, rows });
  assert.equal(n.rows[0].a, ACT.REST);
  assert.equal(n.rows[1].a, '');
});

test('normalizeRoutine corrige dados incompletos ou inválidos', () => {
  const n = normalizeRoutine({ v: 2, rows: [{ a: ACT.SKILL, skill: 'Atirar', mode: 'focused' }, { a: 'hack', skill: 'x' }, { a: ACT.REST, skill: 'Atirar', mode: 'focused' }], fed: false, period: 'x'.repeat(200) });
  assert.equal(n.rows.length, 24);
  assert.equal(n.rows[0].a, ACT.SKILL);
  assert.equal(n.rows[0].mode, 'focused');
  assert.equal(n.rows[1].a, '');
  assert.equal(n.rows[1].skill, '', 'campo de outra atividade é descartado');
  assert.equal(n.rows[2].skill, '');
  assert.equal(n.rows[2].mode, 'normal');
  assert.equal(n.fed, false);
  assert.equal(n.period.length, 60);
  assert.deepEqual(normalizeRoutine(null), emptyRoutine());
});

test('linhas incompletas são apontadas (perícia, feitiço e estudo)', () => {
  const r = plan([['06:00', { a: ACT.SKILL }], ['07:00', { a: ACT.SKILL, skill: 'Furtividade' }], ['08:00', { a: ACT.SPELL, spell: 'p0-x' }],
    ['09:00', { a: ACT.STUDY, spell: 'outro' }], ['10:00', { a: ACT.STUDY, spell: 'p0-x' }]]);
  const issues = routineProblems(r, stats);
  assert.deepEqual(issues.map(i => i.hour), ['06:00', '07:00', '09:00']);
});

test('descanso rápido preservado: +2 por hora, 4 horas por dia, exige alimentado', () => {
  const sim = simulateRoutine(run({ a: ACT.QUICK }, 6, { startStamina: 0 }), stats);
  assert.deepEqual(sim.rows.slice(0, 6).map(x => x.staminaDelta), [2, 2, 2, 2, 0, 0]);
  assert.equal(sim.endStamina, 8);
  const hungry = simulateRoutine(run({ a: ACT.QUICK }, 2, { startStamina: 0, fed: false }), stats);
  assert.equal(hungry.endStamina, 0);
  assert.ok(hungry.warnings.length === 2);
});

test('a simulação do editor bloqueia treino com estamina em 1 ou menos', () => {
  const sim = simulateRoutine(run({ a: ACT.SKILL, skill: 'Atirar' }, 2, { startStamina: 1 }), stats);
  assert.equal(sim.rows[0].ok, false);
  assert.equal(sim.endStamina, 1);
  assert.equal(sim.xp.length, 0);
});

test('simulação de um treino de 8 horas: custo, XP da perícia e do atributo ligado', () => {
  const sim = simulateRoutine(run({ a: ACT.SKILL, skill: 'Atirar' }, 8), stats);
  assert.equal(sim.totalStamina, -12);
  const skill = sim.xp.find(x => x.kind === 'skill');
  const attr = sim.xp.find(x => x.kind === 'attribute');
  assert.equal(skill.amount, 8);
  assert.equal(attr.name, 'Agilidade');
  assert.equal(attr.amount, 4);
});
