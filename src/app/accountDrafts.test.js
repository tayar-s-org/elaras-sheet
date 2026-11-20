import test from 'node:test';
import assert from 'node:assert/strict';
import { newCharacter } from '../rules.js';
import { openSheet, openCloudSheet, editSheet, emptySession } from '../sheets.js';
import { hasUnsavedChanges, stashAccountDrafts, takeAccountDrafts, mergeDraftSheets } from './accountDrafts.js';

const CLOUD_ID = '11111111-1111-4111-8111-111111111111';
const memoryStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};
const savedSession = () => openCloudSheet(emptySession(), { id: CLOUD_ID, revision: 2, character: { ...newCharacter(), name: 'Salva' } });
const editedSession = () => { const saved = savedSession(); return editSheet(saved, saved.activeId, c => ({ ...c, name: 'Editada' })); };

test('só conta como pendente o que ainda não chegou à conta', () => {
  const saved = savedSession();
  assert.equal(hasUnsavedChanges(saved.sheets[0]), false);
  const edited = editSheet(saved, saved.activeId, c => ({ ...c, name: 'Editada' }));
  assert.equal(hasUnsavedChanges(edited.sheets[0]), true);
  assert.equal(hasUnsavedChanges(openSheet(emptySession()).sheets[0]), false, 'rascunho em branco não vale guardar');
  assert.equal(hasUnsavedChanges(openSheet(emptySession(), { ...newCharacter(), name: 'Rascunho' }).sheets[0]), true);
});

test('ao sair com edição pendente, o rascunho volta quando a mesma conta entra', () => {
  const storage = memoryStorage();
  const edited = editedSession();
  stashAccountDrafts(storage, 'conta-a', edited);
  assert.deepEqual(takeAccountDrafts(storage, 'conta-b'), [], 'outra conta não recebe rascunhos alheios');
  const recovered = takeAccountDrafts(storage, 'conta-a');
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].character.name, 'Editada');
  assert.equal(recovered[0].cloud.id, CLOUD_ID);
  assert.deepEqual(takeAccountDrafts(storage, 'conta-a'), [], 'cada rascunho volta uma vez só');
});

test('sem pendências, sair não deixa rascunho guardado', () => {
  const storage = memoryStorage();
  const edited = editedSession();
  stashAccountDrafts(storage, 'conta-a', edited);
  stashAccountDrafts(storage, 'conta-a', savedSession());
  assert.deepEqual(takeAccountDrafts(storage, 'conta-a'), []);
});

test('mesclar rascunhos substitui a única aba em branco e não duplica abas', () => {
  const edited = editedSession();
  const drafts = edited.sheets;
  const fromBlank = mergeDraftSheets(openSheet(emptySession(), newCharacter(), 'em-branco'), drafts);
  assert.deepEqual(fromBlank.sheets.map(s => s.character.name), ['Editada']);
  assert.equal(fromBlank.activeId, fromBlank.sheets[0].id);

  const withWork = openSheet(emptySession(), { ...newCharacter(), name: 'Outra' }, 'outra');
  const merged = mergeDraftSheets(withWork, drafts);
  assert.deepEqual(merged.sheets.map(s => s.character.name), ['Outra', 'Editada']);
  assert.equal(merged.activeId, 'outra');
  assert.equal(mergeDraftSheets(merged, drafts), merged, 'repetir não duplica');
});
