import test from 'node:test';
import assert from 'node:assert/strict';
import { newCharacter } from './rules.js';
import { blankDraft, draftFromSheet, isDraftDirty } from './archetypeDraft.js';

test('rascunho em branco ou igual ao ponto de partida não é sujo', () => {
  assert.equal(isDraftDirty(blankDraft(), blankDraft()), false);
  const fromSheet = draftFromSheet({ ...newCharacter(), concept: 'Bardo' });
  assert.equal(isDraftDirty({ ...fromSheet }, fromSheet), false);
});

test('qualquer edição de nome, atributo, perícia ou vantagem suja o rascunho', () => {
  const base = blankDraft();
  assert.equal(isDraftDirty({ ...base, name: 'Caçador' }, base), true);
  assert.equal(isDraftDirty({ ...base, attributes: { ...base.attributes, Força: 8 } }, base), true);
  assert.equal(isDraftDirty({ ...base, skills: { Luta: 6 } }, base), true);
  assert.equal(isDraftDirty({ ...base, advantages: ['Ambidestro'] }, base), true);
});

test('id gerado ao salvar e espaços no nome não contam como edição', () => {
  const saved = { ...blankDraft(), name: 'Bardo' };
  assert.equal(isDraftDirty({ ...saved, id: 'abc', name: 'Bardo  ' }, saved), false);
});
