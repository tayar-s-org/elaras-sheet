import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HIDDEN_NAME, MAX_EFFECTS, MAX_EFFECT_LABEL, EFFECT_PRESETS, effectsOf, addEffect, removeEffect, effectBadges,
  isNameHidden, displayName, imageVisible, mergeSecrets, applyTokenRow, conditionsOf, tokenEffects,
} from './tokenState.js';

test('jogadores veem "?" enquanto o nome está oculto; o mestre sempre vê o real', () => {
  const t = { name: 'Dragão', name_hidden: true };
  assert.equal(displayName(t, false), HIDDEN_NAME);
  assert.equal(displayName(t, true), 'Dragão');
  assert.equal(displayName({ name: 'Goblin', name_hidden: false }, false), 'Goblin');
  assert.equal(displayName({ name: 'Goblin' }, false), 'Goblin');   // linha antiga, sem a coluna
  assert.equal(displayName({ name: '', name_hidden: false }, false, 'Criatura'), 'Criatura');
  assert.equal(isNameHidden({ name_hidden: true }), true);
  assert.equal(isNameHidden({}), false);
});

test('a foto também fica oculta para os jogadores', () => {
  assert.equal(imageVisible({ name_hidden: true }, false), false);
  assert.equal(imageVisible({ name_hidden: true }, true), true);
  assert.equal(imageVisible({ name_hidden: false }, false), true);
});

test('adicionar efeito pronto ou livre; sem vazio, sem repetido, com limite', () => {
  let list = addEffect([], { preset: 'poison' });
  assert.deepEqual(list, [{ id: 'poison', label: 'Envenenada', icon: '☠️' }]);
  assert.equal(addEffect(list, { preset: 'poison' }).length, 1);                  // repetido
  assert.equal(addEffect(list, { label: '  envenenada ' }).length, 1);            // repetido, outra caixa
  assert.equal(addEffect(list, { label: '   ' }).length, 1);                      // vazio
  list = addEffect(list, { label: '  Lenta   demais ' });
  assert.equal(list[1].label, 'Lenta demais');
  assert.ok(list[1].id.length > 0);
  assert.equal(addEffect([], { label: 'x'.repeat(100) })[0].label.length, MAX_EFFECT_LABEL);
  let full = [];
  for (let i = 0; i < MAX_EFFECTS + 3; i++) full = addEffect(full, { label: `Efeito ${i}` });
  assert.equal(full.length, MAX_EFFECTS);
  assert.equal(addEffect(full, { preset: 'burn' }).length, MAX_EFFECTS);
});

test('remover efeito pelo id', () => {
  const list = addEffect(addEffect([], { preset: 'burn' }), { preset: 'stun' });
  assert.deepEqual(removeEffect(list, 'burn').map(e => e.id), ['stun']);
  assert.equal(removeEffect(list, 'nao-existe').length, 2);
});

test('effectsOf descarta lixo vindo do banco', () => {
  assert.deepEqual(effectsOf(null), []);
  assert.deepEqual(effectsOf({ effects: 'x' }), []);
  const list = effectsOf({ effects: [null, {}, { label: '' }, { id: 'a', label: 'Cega', icon: '🙈' }, { id: 'b', label: 'cega' }, { label: 'Livre' }] });
  assert.equal(list.length, 2);
  assert.equal(list[1].icon, '✦');
});

test('selos do token: os primeiros e quantos ficaram de fora', () => {
  const list = EFFECT_PRESETS.slice(0, 5).map(p => ({ id: p.id, label: p.label, icon: p.icon }));
  const b = effectBadges(list, 3);
  assert.equal(b.shown.length, 3);
  assert.equal(b.extra, 2);
  assert.match(b.all, /Envenenada, Atordoada/);
  assert.deepEqual(effectBadges([], 3), { shown: [], extra: 0, all: '' });
});

test('mestre recompõe nome e imagem reais a partir dos segredos', () => {
  const tokens = [
    { id: 'a', name: '', image_path: null, name_hidden: true },
    { id: 'b', name: 'Visível', image_path: 'u/b.png', name_hidden: false },
    { id: 'c', name: '', image_path: null, name_hidden: true },
  ];
  const out = mergeSecrets(tokens, [{ token_id: 'a', name: 'Lich', image_path: 'u/lich.png' }, { token_id: 'b', name: 'Outro', image_path: 'x' }]);
  assert.equal(out[0].name, 'Lich');
  assert.equal(out[0].image_path, 'u/lich.png');
  assert.equal(out[1].name, 'Visível');       // não oculto: ignora o segredo
  assert.equal(out[2].name, '');              // sem segredo: continua em branco
  assert.equal(mergeSecrets(tokens, []), tokens);
});

test('evento em tempo real: token oculto chega em branco e o mestre mantém o real', () => {
  const gm = [{ id: 'a', name: 'Lich', image_path: 'u/lich.png', name_hidden: true, x: 1 }];
  const out = applyTokenRow(gm, { id: 'a', name: '', image_path: null, name_hidden: true, x: 5 });
  assert.equal(out[0].name, 'Lich');
  assert.equal(out[0].image_path, 'u/lich.png');
  assert.equal(out[0].x, 5);
  // Desocultar traz o real de volta, mesmo que o anterior fosse outro.
  assert.equal(applyTokenRow(out, { id: 'a', name: 'Lich', image_path: 'u/lich.png', name_hidden: false, x: 5 })[0].name_hidden, false);
  // Jogador: o token estava visível e passou a oculto; o nome antigo some.
  const player = [{ id: 'a', name: 'Lich', image_path: 'u/lich.png', name_hidden: false }];
  const hidden = applyTokenRow(player, { id: 'a', name: '', image_path: null, name_hidden: true });
  assert.equal(hidden[0].name, '');
  assert.equal(hidden[0].image_path, null);
  // Token novo entra na lista.
  assert.equal(applyTokenRow([], { id: 'z', name: 'Novo' }).length, 1);
});

test('a migração 0034 existe e protege o nome e a imagem (segredos só do mestre)', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0034_token_hidden_name_effects.sql', import.meta.url), 'utf8');
  assert.match(sql, /add column if not exists name_hidden/);
  assert.match(sql, /add column if not exists effects/);
  assert.match(sql, /create table if not exists public\.board_token_secrets/);
  assert.match(sql, /using \(public\.is_gm\(table_id\)\)/);
});

test('efeitos aceitam observação e duração opcionais, só quando preenchidas', () => {
  const list = addEffect([], { preset: 'stun', note: '  fica  zonzo ', duration: '3 rodadas' });
  assert.deepEqual(list[0], { id: 'stun', label: 'Atordoada', icon: '💫', note: 'fica zonzo', duration: '3 rodadas' });
  assert.deepEqual(addEffect([], { preset: 'stun' })[0], { id: 'stun', label: 'Atordoada', icon: '💫' });
  const long = effectsOf({ effects: [{ id: 'x', label: 'Teste', note: 'n'.repeat(500), duration: 'd'.repeat(500) }] })[0];
  assert.equal(long.note.length, 120);
  assert.equal(long.duration.length, 40);
});

test('rótulo no masculino para personagens e presets novos', () => {
  assert.equal(addEffect([], { preset: 'blind', gender: 'm' })[0].label, 'Cego');
  assert.equal(addEffect([], { preset: 'blind' })[0].label, 'Cega');
  for (const label of ['Confuso', 'Amaldiçoado', 'Abençoado', 'Exausto', 'Incapacitado', 'Atordoado', 'Envenenado', 'Sangrando', 'Paralisado']) {
    assert.ok(EFFECT_PRESETS.some(p => p.labelM === label), label);
  }
  for (const p of EFFECT_PRESETS) assert.ok(p.label.length <= MAX_EFFECT_LABEL && p.labelM.length <= MAX_EFFECT_LABEL);
});

test('condições do personagem usam o mesmo formato e o token mostra o certo', () => {
  const states = { pc1: { life: 3, conditions: [{ id: 'blind', label: 'Cego', icon: '🙈', duration: '1 cena' }] } };
  assert.equal(conditionsOf(states.pc1)[0].duration, '1 cena');
  assert.deepEqual(conditionsOf(undefined), []);
  assert.deepEqual(conditionsOf({ life: 1 }), []);
  assert.equal(tokenEffects({ character_id: 'pc1', effects: [{ id: 'o', label: 'Outro', icon: 'x' }] }, states)[0].label, 'Cego');
  assert.equal(tokenEffects({ character_id: null, effects: [{ id: 'o', label: 'Outro', icon: 'x' }] }, states)[0].label, 'Outro');
  assert.deepEqual(tokenEffects({ character_id: 'pc2' }, states), []);
});
