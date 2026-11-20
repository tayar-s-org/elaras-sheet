import test from 'node:test';
import assert from 'node:assert/strict';
import { ACT, processHour } from './activities.js';
import { processTicks, statsFromCharacter } from './processor.js';
import { ATTEMPT_DICE, DIFFICULTY, attemptDifficulty, judgeAttempt, astuciaDice, UPGRADE_XP_CHARGE } from './magicStudy.js';
import { normalizeRoutine, emptyRoutine } from '../training/routine.js';
import { newCharacter } from '../rules.js';
import { jobTotals } from './work.js';

const JOB = { id: '11111111-1111-1111-1111-111111111111', name: 'Ferreiro', staminaTiers: [1, 2, 3], manaTiers: [0, 0, 1], pay: 20, xp: 1.5, xpSkill: 'Consertar' };
const stats = (jobs = [JOB]) => ({
  maxStamina: 100, maxMana: 50, spirit: { die: 12, bonus: 0 }, conjurar: { die: 12, bonus: 0 }, meditar: { die: 8, bonus: 0 },
  skills: ['Atirar'], spells: [], trainedSpells: [], jobs: Object.fromEntries(jobs.map(j => [j.id, j])),
});
function run(rows, st = stats(), start = { stamina: 100, mana: 50 }) {
  let state = { ...start }; let day = null;
  return rows.map(row => { const r = processHour({ dayNo: 0, row, stats: st, state, day, rng: s => s }); state = r.state; day = r.day; return r.event; });
}
const work = (extra = {}) => ({ a: ACT.WORK, job: JOB.id, ...extra });

test('trabalhar: custos de estamina e mana por faixa (1–4, 5–8, 9–12), pagamento e XP por hora', () => {
  const ev = run(Array.from({ length: 12 }, () => work()));
  assert.deepEqual(ev.map(e => e.staminaDelta), [-1, -1, -1, -1, -2, -2, -2, -2, -3, -3, -3, -3]);
  assert.deepEqual(ev.map(e => e.manaDelta), [0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1]);
  assert.ok(ev.every(e => e.ok && e.pay === 20));
  assert.deepEqual(ev[0].xp, [{ kind: 'skill', name: 'Consertar', modality: 'normal', amount: 1.5 }]);
  assert.equal(ev.reduce((s, e) => s + e.pay, 0), 240);
});

test('trabalhar: limite de 12 horas por dia', () => {
  const ev = run(Array.from({ length: 14 }, () => work()));
  assert.equal(ev.filter(e => e.ok).length, 12);
  assert.equal(ev[12].ok, false);
  assert.match(ev[12].reason, /12 horas/);
  assert.equal(ev[12].pay, undefined, 'hora sem efeito não paga');
});

test('trabalho não escolhido, não aprovado ou de outro personagem não funciona', () => {
  assert.equal(run([{ a: ACT.WORK, job: '' }])[0].ok, false);
  assert.equal(run([work()], stats([]))[0].ok, false);
  assert.match(run([work()], stats([]))[0].reason, /não está aprovado/);
});

test('trabalho que gasta estamina bloqueia com estamina em 1; sem custo de mana não bloqueia por mana', () => {
  assert.equal(run([work()], stats(), { stamina: 1, mana: 50 })[0].ok, false);
  assert.equal(run([work()], stats(), { stamina: 50, mana: 0 })[0].ok, true, 'a faixa 1 não gasta mana');
  const onlyMana = { ...JOB, staminaTiers: [0, 0, 0], manaTiers: [2, 2, 2] };
  assert.equal(run([work()], stats([onlyMana]), { stamina: 0, mana: 50 })[0].ok, true);
  assert.equal(run([work()], stats([onlyMana]), { stamina: 50, mana: 1 })[0].ok, false);
});

test('trabalho nunca deixa a estamina abaixo de 1: o custo é limitado ao que passa de 1', () => {
  const heavy = { ...JOB, staminaTiers: [5, 5, 5], manaTiers: [0, 0, 0] };
  const ev = run([work(), work()], stats([heavy]), { stamina: 3, mana: 50 });
  assert.equal(ev[0].ok, true);
  assert.equal(ev[0].staminaDelta, -2);
  assert.equal(ev[0].staminaAfter, 1);
  assert.equal(ev[1].ok, false, 'com 1 de estamina o trabalho bloqueia');
  assert.equal(ev[1].staminaAfter, 1);
});

test('trabalho sem XP configurado não gera XP', () => {
  const noXp = { ...JOB, xp: 0, xpSkill: '' };
  assert.deepEqual(run([work()], stats([noXp]))[0].xp, []);
});

test('o editor só guarda o id de trabalho em linhas de Trabalhar', () => {
  const r = emptyRoutine();
  r.rows[0] = { a: ACT.WORK, job: JOB.id, skill: 'x', spell: '', mode: 'focused', n: '' };
  r.rows[1] = { a: ACT.REST, job: JOB.id, skill: '', spell: '', mode: 'normal', n: '' };
  r.rows[2] = { a: ACT.WORK, job: 'nao-e-id', skill: '', spell: '', mode: 'normal', n: '' };
  const n = normalizeRoutine(r);
  assert.equal(n.rows[0].job, JOB.id);
  assert.equal(n.rows[0].mode, 'normal');
  assert.equal(n.rows[1].job, '');
  assert.equal(n.rows[2].job, '');
});

test('o processamento carrega o trabalho aprovado da ficha e registra o salário no evento', () => {
  const c = newCharacter();
  c.attributes.Vigor = 12;
  const st = statsFromCharacter(c, [], [JOB]);
  assert.equal(st.jobs[JOB.id].pay, 20);
  const entries = [{ characterId: 'A', stats: st, state: { stamina: 12, mana: 20 }, day: null, rowAt: () => ({ row: work(), routineId: 'r', fed: true }) }];
  const out = processTicks({ entries, fromTick: 0, hours: 3, rng: s => s })[0].events;
  assert.equal(out.reduce((s, e) => s + (e.pay || 0), 0), 60);
  assert.equal(out[0].row.job, JOB.id);
  assert.equal(out[0].job, JOB.id);
});

test('prévia do mestre: custo e ganhos totais em 4, 8 e 12 horas', () => {
  assert.deepEqual(jobTotals(JOB, 4), { stamina: 4, mana: 0, pay: 80, xp: 6 });
  assert.deepEqual(jobTotals(JOB, 8), { stamina: 12, mana: 0, pay: 160, xp: 12 });
  assert.deepEqual(jobTotals(JOB, 12), { stamina: 24, mana: 4, pay: 240, xp: 18 });
});

test('tabela de dificuldade das melhorias (1ª a 10ª)', () => {
  assert.deepEqual(DIFFICULTY, [150, 225, 340, 510, 760, 1140, 1710, 2565, 3845, 5770]);
  assert.equal(attemptDifficulty(0).base, 150);
  assert.equal(attemptDifficulty(9).base, 5770);
  assert.equal(attemptDifficulty(10), null, 'depois da 10ª não há mais melhoria');
});

test('Pity reduz 10% por ponto, até 50%', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(p => attemptDifficulty(0, p).effective), [150, 135, 120, 105, 90, 75]);
  assert.equal(attemptDifficulty(0, 9).effective, 75, 'o Pity não passa de 5');
  assert.equal(attemptDifficulty(2, 3).effective, 340 * 0.7);
});

test('tentativa: sucesso exige soma MAIOR que a dificuldade e zera o Pity', () => {
  assert.deepEqual(judgeAttempt(150, 0, 0), { success: false, pityAfter: 1, base: 150, effective: 150, pity: 0 }, 'igual não basta; mas 150 ≥ 50% rende Pity');
  const win = judgeAttempt(151, 0, 3);
  assert.equal(win.success, true);
  assert.equal(win.pityAfter, 0);
  assert.equal(judgeAttempt(106, 0, 3).success, true, 'com Pity 3 a dificuldade é 105');
  assert.equal(judgeAttempt(105, 0, 3).success, false);
});

test('falha com pelo menos 50% do valor da tabela dá +1 de Pity (máx. 5); abaixo disso não dá', () => {
  assert.equal(judgeAttempt(75, 0, 0).pityAfter, 1, 'exatamente 50% conta');
  assert.equal(judgeAttempt(74, 0, 0).pityAfter, 0);
  assert.equal(judgeAttempt(80, 0, 4).pityAfter, 5, 'dificuldade 90 com Pity 4; 80 falha mas passa de 50% de 150');
  assert.equal(judgeAttempt(75, 0, 5).pityAfter, 5, 'Pity máximo 5 (dificuldade 75: 75 não é maior)');
  assert.equal(judgeAttempt(10, 0, 2).pityAfter, 2, 'falha ruim mantém o Pity que já tinha');
  assert.equal(judgeAttempt(113, 3, 2).pityAfter, 2, '113 < 50% de 510');
  assert.equal(judgeAttempt(260, 3, 2).pityAfter, 3);
});

test('dados de Astúcia: 25 h = 1, sem teto; precisa de 16 para tentar e cada tentativa gasta 16', () => {
  assert.equal(ATTEMPT_DICE, 16);
  assert.equal(astuciaDice(24).available, 0);
  assert.equal(astuciaDice(25).available, 1);
  assert.equal(astuciaDice(100).earned, 4);
  assert.equal(astuciaDice(399).canAttempt, false);
  assert.equal(astuciaDice(400).canAttempt, true, '16 dados = 400 h');
  assert.equal(astuciaDice(400, 16).available, 0, 'tentativa gasta 16');
  assert.equal(astuciaDice(5000).earned, 200, 'sem teto no total ganho');
  assert.equal(astuciaDice(5000, 16).available, 184);
  assert.equal(astuciaDice(425, 0).hoursToNext, 25);
  assert.equal(astuciaDice(410, 0).hoursToNext, 15);
});

test('depois de uma tentativa o saldo se recompõe e permite a próxima (sem teto de 24)', () => {
  assert.deepEqual(
    (({ available, canAttempt }) => ({ available, canAttempt }))(astuciaDice(100000, 16)),
    { available: 3984, canAttempt: true });
  const afterFirstAttempt = astuciaDice(600, ATTEMPT_DICE);
  assert.equal(afterFirstAttempt.canAttempt, false, '24 ganhos - 16 gastos = 8');
  assert.equal(astuciaDice(1000, ATTEMPT_DICE).canAttempt, true, '40 ganhos - 16 gastos = 24');
});

test('o custo de XP da melhoria ainda não é cobrado (decisão pendente)', () => {
  assert.equal(UPGRADE_XP_CHARGE, 'none');
});
