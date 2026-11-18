import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAdvance, dayState } from './readiness.js';

const chars = [
  { characterId: 'A', userId: 'ua', name: 'Ana' },
  { characterId: 'B', userId: 'ub', name: 'Bruno' },
];
const routines = {
  r1: { status: 'approved', character_id: 'A', name: 'Treino' },
  r2: { status: 'approved', character_id: 'B', name: 'Estudo' },
  rp: { status: 'pending', character_id: 'B', name: 'Pendente' },
  rr: { status: 'draft', character_id: 'A', name: 'Devolvida', review_note: 'Ajuste as 14h' },
  rd: { status: 'draft', character_id: 'A', name: 'Editada' },
};
const full = days => Object.fromEntries(days.map(d => [d, 'r1']));

test('estados de um dia: aprovado, pendente, devolvido, rascunho e vazio', () => {
  assert.equal(dayState(routines.r1, 'A'), 'ok');
  assert.equal(dayState(routines.rp, 'B'), 'pending');
  assert.equal(dayState(routines.rr, 'A'), 'rejected');
  assert.equal(dayState(routines.rd, 'A'), 'draft');
  assert.equal(dayState(undefined, 'A'), 'empty');
  assert.equal(dayState(routines.r1, 'B'), 'empty', 'rotina de outra ficha não vale');
});

test('todos preenchidos e aprovados até o dia de destino: libera', () => {
  const r = checkAdvance({
    characters: chars, routines, fromTick: 0, hours: 24 * 4,
    assignments: { A: full([0, 1, 2, 3, 4]), B: Object.fromEntries([0, 1, 2, 3, 4].map(d => [d, 'r2'])) },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.days, [0, 1, 2, 3, 4]);
  assert.equal(r.summary.characters, 2);
  assert.equal(r.summary.days, 5);
  assert.equal(r.summary.complete, 2);
  assert.equal(r.summary.withIssues, 0);
});

test('o dia de destino também precisa estar preenchido (sem exceção)', () => {
  const r = checkAdvance({
    characters: [chars[0]], routines, fromTick: 0, hours: 24 * 4,
    assignments: { A: full([0, 1, 2, 3]) }, // falta o dia 5 (índice 4)
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.players[0].empty, [4]);
});

test('dia vazio nunca vira descanso automático', () => {
  const r = checkAdvance({ characters: [chars[0]], routines, assignments: {}, fromTick: 0, hours: 1 });
  assert.equal(r.ok, false);
  assert.deepEqual(r.players[0].empty, [0]);
});

test('aponta quem tem dias vazios, pendentes e devolvidos', () => {
  const r = checkAdvance({
    characters: chars, routines, fromTick: 0, hours: 24 * 3,
    assignments: {
      A: { 0: 'r1', 1: 'rr', 3: 'r1' }, // dia 3 vazio, dia 2 devolvido
      B: { 0: 'r2', 1: 'rp', 2: 'r2', 3: 'r2' }, // dia 2 pendente
    },
  });
  assert.equal(r.ok, false);
  const [a, b] = r.players;
  assert.deepEqual(a.empty, [2]);
  assert.deepEqual(a.rejected.map(x => [x.dayNo, x.note]), [[1, 'Ajuste as 14h']]);
  assert.deepEqual(b.pending.map(x => x.dayNo), [1]);
  assert.deepEqual(b.empty, []);
  assert.equal(r.summary.withIssues, 2);
  assert.equal(r.summary.pendingRoutines, 1);
});

test('rotina apagada ou rotina de outro personagem no dia conta como vazio', () => {
  const r = checkAdvance({
    characters: chars, routines, fromTick: 0, hours: 1,
    assignments: { A: { 0: 'sumiu' }, B: { 0: 'r1' } },
  });
  assert.deepEqual(r.players[0].empty, [0]);
  assert.deepEqual(r.players[1].empty, [0], 'r1 é da ficha A, não vale para B');
});

test('trocar de ficha não herda a agenda: cada personagem tem a sua', () => {
  const r = checkAdvance({
    characters: [{ characterId: 'C', userId: 'ua', name: 'Nova ficha da Ana' }], routines, fromTick: 0, hours: 1,
    assignments: { A: { 0: 'r1' } }, // agenda da ficha antiga A
  });
  assert.equal(r.ok, false, 'a ficha nova começa vazia');
  assert.deepEqual(r.players[0].empty, [0]);
});

test('mesa sem personagens: nada a verificar', () => {
  const r = checkAdvance({ characters: [], routines, assignments: {}, fromTick: 0, hours: 5 });
  assert.equal(r.ok, true);
  assert.equal(r.summary.characters, 0);
});
