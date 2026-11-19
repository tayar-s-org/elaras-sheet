import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSubject, modulesAvailable } from './boardSheetAccess.js';

const characters = { mine: { data: { name: 'Cloud copy' } }, other: { data: { name: 'Outro' } } };
const sessionSheets = [{ id: 's1', cloud: { id: 'mine' }, character: { name: 'Local' } }];

test('sem seleção, quem tem personagem vê a própria ficha (aba da conta primeiro)', () => {
  const s = resolveSubject({ myCharacter: 'mine', characters, sessionSheets });
  assert.equal(s.kind, 'own');
  assert.equal(s.data.name, 'Local');
  assert.ok(s.editable && s.full && modulesAvailable(s));
});

test('sem seleção e sem personagem (mestre): estado vazio', () => {
  assert.equal(resolveSubject({ isGm: true, characters }).kind, 'none');
});

test('ficha própria sem aba aberta cai para leitura da nuvem', () => {
  const s = resolveSubject({ myCharacter: 'mine', characters, sessionSheets: [] });
  assert.equal(s.kind, 'own');
  assert.equal(s.data.name, 'Cloud copy');
  assert.equal(s.editable, false);
});

test('token de outro jogador: jogador vê só o limitado, mestre vê tudo em leitura', () => {
  const sel = { character_id: 'other' };
  const player = resolveSubject({ sel, myCharacter: 'mine', characters, sessionSheets });
  assert.equal(player.kind, 'limited');
  assert.equal(modulesAvailable(player), false);
  assert.equal(player.editable, false);
  const gm = resolveSubject({ sel, isGm: true, characters, sessionSheets });
  assert.equal(gm.kind, 'gm');
  assert.equal(modulesAvailable(gm), true);
  assert.equal(gm.editable, false);
});

test('token da própria ficha seleciona a ficha editável mesmo sendo mestre', () => {
  const s = resolveSubject({ sel: { character_id: 'mine' }, myCharacter: 'mine', isGm: true, characters, sessionSheets });
  assert.equal(s.kind, 'own');
  assert.ok(s.editable);
});

test('criatura ou token sem ficha: vazio, sem módulos', () => {
  const s = resolveSubject({ sel: { id: 't', character_id: null }, myCharacter: 'mine', characters, sessionSheets });
  assert.equal(s.kind, 'creature');
  assert.equal(modulesAvailable(s), false);
});

test('ficha ainda não carregada não quebra', () => {
  const s = resolveSubject({ sel: { character_id: 'ghost' }, isGm: true, characters: {} });
  assert.equal(s.kind, 'gm');
  assert.equal(s.data, null);
  assert.equal(modulesAvailable(s), false);
});
