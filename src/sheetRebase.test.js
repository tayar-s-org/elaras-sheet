import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRewards, rebaseSheet, applyRewardSync, rewardDelta } from './sheetRebase.js';
import { grantEach, grantSummary } from './lib/grantEach.js';

const base = { name: 'Aria', xp: 10, money: 500, notes: 'a' };
const cloudRow = (over, revision = 2) => ({ id: 'c1', revision, character: { ...base, ...over } });
const sheet = (character, revision = 1) => ({ id: 's1', character, cloud: { id: 'c1', revision, base: JSON.stringify(base) } });

test('soma o XP e o dinheiro da nuvem à ficha com edições pendentes', () => {
  const local = { ...base, notes: 'editei', xp: 12 };           // jogador ganhou 2 de XP e editou as notas
  const m = mergeRewards(base, local, { ...base, xp: 15, money: 400 });
  assert.equal(m.xp, 17);          // 12 + 5 do mestre
  assert.equal(m.money, 400);      // 500 - 100
  assert.equal(m.notes, 'editei');
});

test('se a nuvem mudou outra coisa, não reconcilia sozinho', () => {
  assert.equal(mergeRewards(base, { ...base, notes: 'x' }, { ...base, xp: 15, notes: 'outro' }), null);
  assert.equal(mergeRewards(base, base, { ...base, name: 'Outra' }), null);
});

test('a ordem das propriedades não importa e o XP respeita o limite', () => {
  const cloud = { money: 500, xp: 20, notes: 'a', name: 'Aria' };
  assert.ok(mergeRewards(base, { ...base }, cloud));
  assert.equal(mergeRewards({ ...base, xp: 999999 }, { ...base, xp: 999999 }, { ...base, xp: 1000010 }).xp, 1000000);
  assert.deepEqual(rewardDelta(base, { ...base, xp: 13, money: 450 }), { xp: 3, money: -50 });
});

test('aba sem edições passa a ser a da nuvem; com edições soma; sem linha nova nada muda', () => {
  const clean = rebaseSheet(sheet(base), cloudRow({ xp: 15 }));
  assert.equal(clean.character.xp, 15);
  assert.equal(clean.cloud.revision, 2);
  assert.deepEqual(clean.gained, { xp: 5, money: 0 });
  const dirty = rebaseSheet(sheet({ ...base, notes: 'novo' }), cloudRow({ xp: 15 }), { dirty: true });
  assert.equal(dirty.character.xp, 15);
  assert.equal(dirty.character.notes, 'novo');
  assert.equal(dirty.cloud.base, JSON.stringify(cloudRow({ xp: 15 }).character));   // a base passa a ser a da nuvem: o autosave envia a diferença
  assert.equal(rebaseSheet(sheet({ ...base, notes: 'novo' }), cloudRow({ xp: 15 })), null);   // com edições pendentes e sem conflito: não mexe
  assert.equal(rebaseSheet(sheet(base), cloudRow({ xp: 15 }, 1)), null);
  assert.equal(rebaseSheet(sheet({ ...base, notes: 'x' }), cloudRow({ notes: 'y', xp: 15 }), { dirty: true }), null);
});

test('applyRewardSync informa quem ganhou e deixa as outras abas como estão', () => {
  const other = { id: 's2', character: { name: 'B' }, cloud: { id: 'c2', revision: 1, base: '{"name":"B"}' } };
  const session = { sheets: [sheet(base), other] };
  const r = applyRewardSync(session, [cloudRow({ xp: 15, money: 600 })]);
  assert.equal(r.session.sheets[0].character.xp, 15);
  assert.equal(r.session.sheets[1], other);
  assert.equal(r.gains.length, 1);
  assert.deepEqual([r.gains[0].xp, r.gains[0].money], [5, 100]);
  assert.equal(applyRewardSync(session, []).session, session);
});

test('conceder a vários: uma falha não impede os outros e a mensagem diz quem falhou', async () => {
  const targets = [{ id: 1, name: 'Ana' }, { id: 2, name: 'Bia' }, { id: 3, name: 'Caio' }];
  const done = [];
  const res = await grantEach(targets, async t => { if (t.id === 2) throw new Error('sem vínculo'); done.push(t.id); });
  assert.deepEqual(done, [1, 3]);
  assert.equal(res.ok, 2);
  assert.match(grantSummary(res, 'ok'), /Enviado a 2.*Bia \(sem vínculo\)/);
  assert.equal(grantSummary({ ok: 3, failed: [] }, '+5 XP enviado a todos.'), '+5 XP enviado a todos.');
  assert.match(grantSummary({ ok: 0, failed: [{ name: 'Ana', message: 'x' }] }, 'ok'), /Não foi enviado: Ana/);
});
