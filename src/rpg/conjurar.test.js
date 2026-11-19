import test from 'node:test';
import assert from 'node:assert/strict';
import { ACT, processHour, newDay, blockedReason, CAST_MANA_COST } from './activities.js';
import { describeEvent } from './describe.js';

const stats = { maxStamina: 40, maxMana: 20, spirit: 6, conjurar: 6, skills: ['Conjurar', 'Lutar'], spells: [], customAttrs: {} };
const hour = (skill, state, day, mode = 'normal') => processHour({ dayNo: 1, row: { a: ACT.SKILL, skill, mode }, stats, state, day: day || null, rng: () => 0.5 });

test('treinar Conjurar gasta sempre 1 de mana por hora, mesmo quando a estamina custa mais', () => {
  assert.equal(CAST_MANA_COST, 1);
  let day = null; let state = { stamina: 40, mana: 20 };
  const mana = []; const stamina = [];
  for (let i = 0; i < 9; i++) {
    const r = hour('Conjurar', state, day);
    day = r.day; state = r.state;
    assert.equal(r.event.ok, true);
    mana.push(-r.event.manaDelta); stamina.push(-r.event.staminaDelta);
  }
  assert.deepEqual(mana, [1, 1, 1, 1, 1, 1, 1, 1, 1]);          // fixo em 1
  assert.deepEqual(stamina, [1, 1, 1, 1, 2, 2, 2, 2, 4]);        // a estamina continua progressiva
  assert.equal(state.mana, 11);
});

test('treino focado dobra a estamina mas a mana de Conjurar continua em 1', () => {
  const r = hour('Conjurar', { stamina: 20, mana: 20 }, null, 'focused');
  assert.deepEqual([r.event.staminaDelta, r.event.manaDelta], [-2, -1]);
});

test('outras perícias não gastam mana', () => {
  const r = hour('Lutar', { stamina: 20, mana: 20 });
  assert.equal(r.event.manaDelta, 0);
  assert.equal(r.event.staminaDelta, -1);
});

test('Conjurar com mana em 1 ou menos fica bloqueado; outras perícias seguem', () => {
  assert.match(blockedReason(ACT.SKILL, 10, 1, 'Conjurar'), /mana/);
  assert.equal(blockedReason(ACT.SKILL, 10, 1, 'Lutar'), '');
  assert.equal(blockedReason(ACT.SKILL, 10, 2, 'Conjurar'), '');
  const blocked = hour('Conjurar', { stamina: 10, mana: 1 });
  assert.equal(blocked.event.ok, false);
  assert.equal(blocked.event.manaDelta, 0);
});

test('com 2 de mana treina uma hora e a mana vai a 1', () => {
  const r = hour('Conjurar', { stamina: 10, mana: 2 });
  assert.equal(r.event.manaDelta, -1);
  assert.equal(r.state.mana, 1);
});

test('o texto da hora mostra o custo de mana só em Conjurar', () => {
  const conj = hour('Conjurar', { stamina: 20, mana: 20 });
  assert.match(describeEvent({ ...conj.event, row: { skill: 'Conjurar', mode: 'normal' } }, stats), /−1 de estamina e −1 de mana/);
  const lut = hour('Lutar', { stamina: 20, mana: 20 });
  assert.doesNotMatch(describeEvent({ ...lut.event, row: { skill: 'Lutar', mode: 'normal' } }, stats), /mana/);
});
