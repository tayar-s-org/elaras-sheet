import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecords, summarize, todayStatus, meditationSessions, groupPools } from './history.js';
import { ACT } from './activities.js';
import { processTicks } from './processor.js';

const stats = { maxStamina: 100, maxMana: 60, spirit: { die: 12, bonus: 0 }, conjurar: { die: 12, bonus: 0 }, meditar: { die: 8, bonus: 0 }, skills: ['Atirar'], spells: [{ id: 's1', name: 'Fogo' }], trainedSpells: ['s1'], jobs: {} };
const row = (a, extra = {}) => ({ a, skill: '', spell: '', job: '', mode: 'normal', n: '', ...extra });

// Gera "linhas do ledger" como o servidor guardaria, a partir do motor.
function ledger(plan, { start = { stamina: 100, mana: 60 }, hours = 24 } = {}) {
  const [res] = processTicks({ entries: [{ characterId: 'A', stats, state: start, day: null, rowAt: (_d, slot) => ({ row: plan[slot] || row(''), routineId: 'r', fed: true }) }], fromTick: 0, hours, rng: s => s });
  const pools = {};
  return res.events.map(e => ({
    tick: e.tick, day_no: e.dayNo, slot: e.slot, activity: e.activity, ok: e.ok, reason: e.reason, routine_name: 'Dia 1',
    stamina_delta: e.staminaDelta, mana_delta: e.manaDelta, row_snapshot: e.row,
    xp: e.xp.map(x => { const k = `${x.kind}:${x.name}:${x.modality}`; pools[k] = (pools[k] || 0) + x.amount; return { ...x, kept: x.amount, discarded: 0, availableAfter: pools[k], earnedAfter: pools[k] }; }),
    detail: { rest: e.rest, meditation: e.meditation, pay: e.pay, study: e.study },
  }));
}
const slots = (from, n, r) => Array.from({ length: n }, (_, i) => [from + i, r]);
const plan = parts => { const p = []; parts.flat().forEach(([i, r]) => { p[i] = r; }); return p; };

test('horas seguidas da mesma atividade e alvo viram um registro; XP depois do registro vem do ledger', () => {
  const runs = ledger(plan([slots(0, 4, row(ACT.SKILL, { skill: 'Atirar' })), slots(4, 3, row(ACT.SPELL, { spell: 's1', mode: 'focused' })), slots(7, 4, row(ACT.REST))]), { start: { stamina: 50, mana: 60 } });
  const rec = buildRecords(runs, { spell: id => (id === 's1' ? 'Fogo' : '?') });
  assert.equal(rec.length, 3);
  const [rest, spell, skill] = rec; // mais recente primeiro
  assert.equal(skill.activity, ACT.SKILL);
  assert.equal(skill.hours, 4);
  assert.equal(skill.staminaSpent, 4);
  assert.equal(skill.targetLabel, 'Atirar');
  assert.deepEqual(skill.xp.map(x => [x.name, x.amount, x.availableAfter]), [['Atirar', 4, 4], ['Agilidade', 2, 2]]);
  assert.equal(skill.mode, 'normal');
  assert.equal(spell.targetLabel, 'Fogo');
  assert.equal(spell.mode, 'focused');
  assert.equal(spell.manaSpent, 6, 'focado: 2 por hora × 3');
  assert.deepEqual(spell.xp.map(x => [x.name, x.modality, x.amount]), [['s1', 'focused', 3], ['Conjurar', 'focused', 1.5], ['Espírito', 'focused', 0.75]]);
  assert.equal(rest.staminaGained, 6);
  assert.equal(rest.maxStreak, 4);
  assert.equal(rest.resultText, 'Concluído');
  assert.equal(skill.startTick, 0); assert.equal(skill.endTick, 4);
});

test('perícias ou alvos diferentes, ou horas separadas, geram registros separados; horas vazias não aparecem', () => {
  const runs = ledger(plan([slots(0, 2, row(ACT.SKILL, { skill: 'Atirar' })), slots(3, 2, row(ACT.SKILL, { skill: 'Atirar' })), slots(5, 1, row(ACT.SKILL, { skill: 'Atirar', mode: 'focused' }))]));
  const rec = buildRecords(runs);
  assert.equal(rec.length, 3, 'a hora vazia no meio separa; normal e focado não se misturam');
  assert.ok(rec.every(r => r.activity === ACT.SKILL));
});

test('horas sem efeito entram no registro com o motivo', () => {
  const runs = ledger(plan([slots(0, 14, row(ACT.SKILL, { skill: 'Atirar' }))]), { start: { stamina: 1000, mana: 60 } });
  const [rec] = buildRecords(runs);
  assert.equal(rec.hours, 14);
  assert.equal(rec.okHours, 12);
  assert.equal(rec.failedHours, 2);
  assert.match(rec.reasons[0], /12 horas/);
  assert.equal(rec.resultText, '12 de 14 h com efeito');
});

test('indicadores do topo', () => {
  const runs = ledger(plan([slots(0, 4, row(ACT.SKILL, { skill: 'Atirar' })), slots(4, 3, row(ACT.SPELL, { spell: 's1' })), slots(7, 2, row(ACT.STUDY, { spell: 's1' })), slots(9, 4, row(ACT.REST)), slots(13, 2, row(ACT.QUICK)), slots(15, 2, row(ACT.MEDITATE)), slots(18, 1, row(ACT.MEDITATE))]), { start: { stamina: 50, mana: 10 } });
  const s = summarize({
    runs, progress: [{ earned_total: 4 }, { earned_total: 2 }, { earned_total: 3.5 }], training: { study_hours: 40 },
    spellProgress: { s1: { improvements: 2, pity: 1 }, s2: { improvements: 1, pity: 0 } },
  });
  assert.equal(s.trainedHours, 7);
  assert.equal(s.xpReceived, 9.5);
  assert.equal(s.skillsTrained, 1);
  assert.equal(s.spellsTrained, 1);
  assert.equal(s.studyHours, 40);
  assert.equal(s.improvements, 3);
  assert.equal(s.restHours, 6);
  assert.equal(s.meditationSessions, 2, 'duas sessões encerradas (a segunda fechou na virada)');
  assert.equal(s.workHours, 0);
});

test('sessões de meditação: início, duração e rolagem; mais recente primeiro', () => {
  const runs = ledger(plan([slots(0, 2, row(ACT.MEDITATE)), slots(3, 3, row(ACT.MEDITATE))]), { start: { stamina: 10, mana: 0 } });
  const list = meditationSessions(runs);
  assert.equal(list.length, 2);
  assert.equal(list[1].hours, 2);
  assert.equal(list[0].hours, 3);
  assert.equal(list[0].startTick, 3);
  assert.equal(list[0].sides, 8);
  assert.equal(list[0].closed, true);
});

test('sessões de meditação: na virada do dia fecha a sessão antiga e mantém a nova aberta', () => {
  const runs = ledger(plan([slots(0, 24, row(ACT.MEDITATE))]), { start: { stamina: 10, mana: 0 }, hours: 26 });
  const [current, previous] = meditationSessions(runs);
  assert.deepEqual([previous.startTick, previous.hours, previous.closed], [0, 24, true]);
  assert.deepEqual([current.startTick, current.hours, current.closed], [24, 2, false]);
});

test('situação de hoje: descanso em andamento, sessões e limites que sobram', () => {
  const day = { dayNo: 3, restStreak: 2, restHours: 2, trainHours: 5, spellHours: 1, medClosed: 1, medActive: true };
  const limits = { restMax: 12, trainMax: 12, spellMax: 6, sessions: 3 };
  const t = todayStatus({ training: { day_no: 3, day_state: day }, dayNo: 3, runs: [], limits });
  assert.equal(t.restStreak, 2);
  assert.equal(t.restLeft, 10);
  assert.equal(t.trainLeft, 7);
  assert.equal(t.spellLeft, 5);
  assert.equal(t.meditationUsed, 1);
  assert.equal(t.meditationLeft, 1, '3 sessões − 1 usada − 1 em andamento');
  assert.match(t.streakText, /completar 4 h/);
  const fresh = todayStatus({ training: { day_no: 2, day_state: day }, dayNo: 3, runs: [], limits });
  assert.equal(fresh.meditationUsed, 0, 'dia novo: sessões renovadas');
  assert.equal(fresh.meditationLeft, 3);
});

test('acumuladores agrupados por alvo, com Normal e Focado lado a lado', () => {
  const g = groupPools([
    { kind: 'spell', name: 's1', modality: 'normal', available: 1 },
    { kind: 'skill', name: 'Atirar', modality: 'focused', available: 5 },
    { kind: 'skill', name: 'Atirar', modality: 'normal', available: 7 },
    { kind: 'attribute', name: 'Agilidade', modality: 'normal', available: 3 },
  ]);
  assert.deepEqual(g.map(x => x.name), ['Atirar', 'Agilidade', 's1']);
  assert.equal(g[0].normal.available, 7);
  assert.equal(g[0].focused.available, 5);
  assert.equal(g[1].focused, null);
});

import { lastTrainedTicks, xpSheetRows, sortXpRows, xpSheetTotals } from './history.js';

const pool = (kind, name, modality, available, earned, spent) => ({ kind, name, modality, available, earned_total: earned, spent_total: spent });

test('planilha de XP: soma Normal e Focado por característica e calcula os totais', () => {
  const progress = [
    pool('skill', 'Atirar', 'normal', 100, 300, 200), pool('skill', 'Atirar', 'focused', 50, 80, 30),
    pool('attribute', 'Agilidade', 'normal', 10, 40, 30), pool('spell', 's1', 'normal', 5, 5, 0),
  ];
  const rows = xpSheetRows(progress, { dieOf: (k, n) => (n === 'Atirar' ? 8 : 0), nameOf: (k, n) => (k === 'spell' ? 'Fogo' : n), lastTicks: { 'skill:Atirar': 40 } });
  const atirar = rows.find(r => r.name === 'Atirar');
  assert.deepEqual([atirar.earned, atirar.spent, atirar.available, atirar.die, atirar.lastTick], [380, 230, 150, 8, 40]);
  assert.equal(rows.find(r => r.kind === 'spell').label, 'Fogo');
  assert.equal(rows.find(r => r.name === 'Agilidade').lastTick, null);
  assert.deepEqual(xpSheetTotals(rows), { earned: 425, spent: 260, available: 165 });
});

test('planilha de XP: ordena por coluna, com vazios no fim, e é estável pelo nome', () => {
  const rows = [
    { label: 'Atirar', kind: 'skill', earned: 5, lastTick: 9 }, { label: 'Agilidade', kind: 'attribute', earned: 5, lastTick: null },
    { label: 'Fogo', kind: 'spell', earned: 9, lastTick: 20 },
  ];
  assert.deepEqual(sortXpRows(rows, 'earned', 'desc').map(r => r.label), ['Fogo', 'Agilidade', 'Atirar']);
  assert.deepEqual(sortXpRows(rows, 'lastTick', 'desc').map(r => r.label), ['Fogo', 'Atirar', 'Agilidade']);
  assert.deepEqual(sortXpRows(rows, 'lastTick', 'asc').map(r => r.label), ['Atirar', 'Fogo', 'Agilidade'], 'sem treino sempre por último');
  assert.deepEqual(sortXpRows(rows, 'kind').map(r => r.kind), ['attribute', 'skill', 'spell']);
});

test('último treino: maior tick com XP do alvo, ignorando horas sem efeito', () => {
  const runs = [
    { tick: 5, ok: true, xp: [{ kind: 'skill', name: 'Atirar' }, { kind: 'attribute', name: 'Agilidade' }] },
    { tick: 9, ok: true, xp: [{ kind: 'skill', name: 'Atirar' }] },
    { tick: 12, ok: false, xp: [{ kind: 'skill', name: 'Atirar' }] },
    { tick: 14, ok: true, xp: [] },
  ];
  assert.deepEqual(lastTrainedTicks(runs), { 'skill:Atirar': 9, 'attribute:Agilidade': 5 });
});
