import test from 'node:test';
import assert from 'node:assert/strict';
import { HOURS, emptyRoutine, normalizeRoutine, physicalCost, meditationRate, maxMeditations, maxPracticeHours, simulateRoutine } from './routine.js';

const stats = { maxStamina: 40, maxMana: 30, spirit: 12, conjurar: 12 };
const plan = (acts, extra = {}) => {
  const r = { ...emptyRoutine(), ...extra };
  acts.forEach(([hour, a]) => { r.rows[HOURS.indexOf(hour)] = { a, n: '' }; });
  return r;
};
const run = (activity, hours, extra) => plan(HOURS.slice(0, hours).map(h => [h, activity]), extra);

test('treino físico custa 1, 2 e 4 por hora; 4h = 4, 8h = 12, 12h = 28', () => {
  assert.deepEqual([1, 4, 5, 8, 9, 12].map(physicalCost), [1, 1, 2, 2, 4, 4]);
  assert.equal(simulateRoutine(run('fisico', 4), stats).totalVE, -4);
  assert.equal(simulateRoutine(run('fisico', 8), stats).totalVE, -12);
  assert.equal(simulateRoutine(run('fisico', 12), stats).totalVE, -28);
  assert.equal(simulateRoutine(run('fisico', 13), { ...stats, maxStamina: 100 }).warnings.length, 1, 'mais de 12h avisa');
});

test('descanso completo: +12 na 8ª hora e reinicia o treino físico', () => {
  const r = plan([
    ['01:00', 'fisico'], ['02:00', 'fisico'], ['03:00', 'fisico'], ['04:00', 'fisico'], ['05:00', 'fisico'],
    ...HOURS.slice(5, 13).map(h => [h, 'descanso']),
    ['14:00', 'fisico'],
  ]);
  const sim = simulateRoutine(r, stats);
  assert.equal(sim.rows[4].ve, -2, 'a 5ª hora de treino custa 2');
  assert.equal(sim.rows[12].ve, 6, 'recupera 12, mas só cabem 6 até o máximo de 40 (34 → 40)');
  assert.equal(sim.rows[12].stamina, 40);
  assert.equal(simulateRoutine(plan(HOURS.slice(0, 8).map(h => [h, 'descanso']), { startStamina: 10 }), stats).rows[7].ve, 12);
  assert.equal(sim.rows[13].ve, -1, 'depois do descanso o treino recomeça custando 1');
  const hungry = simulateRoutine({ ...r, fed: false }, stats);
  assert.equal(hungry.rows[12].ve, 0, 'sem estar alimentado não recupera');
  assert.ok(hungry.warnings.some(w => w.includes('alimentado')));
});

test('descanso simples recupera 2 por hora, até 4 horas por dia', () => {
  const sim = simulateRoutine(run('simples', 6, { startStamina: 0 }), stats);
  assert.deepEqual(sim.rows.slice(0, 6).map(x => x.ve), [2, 2, 2, 2, 0, 0]);
  assert.equal(sim.endStamina, 8);
});

test('estudo custa 1 de mana por hora e prática respeita metade de Conjurar', () => {
  assert.equal(simulateRoutine(run('estudo', 5), stats).totalVM, -5);
  const sim = simulateRoutine(run('pratica', 8), { ...stats, conjurar: 12 });
  assert.equal(maxPracticeHours(12), 6);
  assert.equal(sim.totalVM, -6, 'só as 6 primeiras horas gastam mana');
  assert.equal(simulateRoutine(run('pratica', 2), { ...stats, conjurar: 0 }).totalVM, 0, 'sem Conjurar não pratica');
});

test('meditação recupera 1/(4 − x/4) por hora e limita as entradas por dia', () => {
  assert.equal(meditationRate(0), 0.25);
  assert.equal(meditationRate(12), 1);
  assert.equal(meditationRate(99), 1, 'a redução máxima é de 3h (rolagem 12)');
  assert.equal(maxMeditations(4), 1);
  assert.equal(maxMeditations(12), 2);
  const sim = simulateRoutine(run('meditar', 4, { startMana: 0, meditRoll: 12 }), stats);
  assert.equal(sim.totalVM, 4);
  // duas meditações separadas por uma hora livre: com Espírito d6 só a primeira conta
  const split = plan([['01:00', 'meditar'], ['02:00', 'meditar'], ['04:00', 'meditar']], { startMana: 0, meditRoll: 12 });
  const two = simulateRoutine(split, { ...stats, spirit: 6 });
  assert.equal(two.totalVM, 2);
  assert.ok(two.warnings.length >= 1);
  assert.equal(simulateRoutine(split, { ...stats, spirit: 12 }).totalVM, 3, 'Espírito d12 permite 2 meditações');
});

test('aprimoramento de mana exige mana cheia e conta horas por ponto', () => {
  const full = simulateRoutine(run('aprimorar', 5, { meditRoll: 12 }), stats);
  assert.equal(full.improvement.hours, 5);
  assert.equal(full.improvement.hoursPerPoint, 50, 'coeficiente 1/h: 50 horas por +1 de mana máxima');
  const low = simulateRoutine(run('aprimorar', 2, { startMana: 5 }), stats);
  assert.equal(low.improvement.hours, 0);
  assert.ok(low.warnings.length > 0);
});

test('normalizeRoutine corrige dados incompletos ou inválidos', () => {
  const n = normalizeRoutine({ rows: [{ a: 'fisico' }, { a: 'hack' }], meditRoll: 99, fed: false, period: 'x'.repeat(200) });
  assert.equal(n.rows.length, 24);
  assert.equal(n.rows[0].a, 'fisico');
  assert.equal(n.rows[1].a, '');
  assert.equal(n.meditRoll, 12);
  assert.equal(n.fed, false);
  assert.equal(n.period.length, 60);
  assert.deepEqual(normalizeRoutine(null), emptyRoutine());
});

test('estamina ou mana em 1 bloqueia atividades que as consomem', async () => {
  const { blockedReason, simulateRoutine, emptyRoutine } = await import('./routine.js');
  assert.ok(blockedReason('fisico', 1, 50));
  assert.equal(blockedReason('fisico', 2, 0), '');
  assert.ok(blockedReason('estudo', 10, 1));
  assert.ok(blockedReason('pratica', 10, 0));
  assert.equal(blockedReason('meditar', 0, 0), '');
  assert.equal(blockedReason('descanso', 0, 0), '');
  const routine = emptyRoutine();
  routine.startStamina = 1; routine.startMana = 1;
  routine.rows[0].a = 'fisico'; routine.rows[1].a = 'estudo'; routine.rows[2].a = 'simples';
  const sim = simulateRoutine(routine, { maxStamina: 10, maxMana: 10, spirit: 6, conjurar: 8 });
  assert.equal(sim.rows[0].blocked, true);
  assert.equal(sim.rows[1].blocked, true);
  assert.deepEqual([sim.rows[0].ve, sim.rows[1].vm], [0, 0]);
  assert.equal(sim.rows[2].ve, 2);                    // descansar continua permitido
  assert.equal(sim.rows[0].incap, 2);                 // estamina 1 de 10: abaixo de 25%
  assert.equal(sim.rows[0].exhaustion, 3);            // mana 1 de 10: no limite de 10%
  assert.equal(sim.warnings.length, 2);
});

test('Usar média: a rolagem de Meditar vira a média do dado da ficha', async () => {
  const { averageRoll, simulateRoutine, emptyRoutine } = await import('./routine.js');
  assert.deepEqual([4, 6, 8, 10, 12].map(averageRoll), [2.5, 3.5, 4.5, 5.5, 6.5]);
  assert.equal(averageRoll(0), 0.5);
  const routine = { ...emptyRoutine(), meditRoll: 12, meditAvg: true };
  const stats = { maxStamina: 10, maxMana: 10, spirit: 6, conjurar: 4, meditar: 8 };
  const sim = simulateRoutine(routine, stats);
  assert.equal(sim.roll, 4.5);
  assert.equal(sim.rate, Math.round(100 / (4 - 4.5 / 4)) / 100);          // usa a média, não os 12 digitados
  assert.equal(simulateRoutine({ ...routine, meditAvg: false }, stats).roll, 12);
});
