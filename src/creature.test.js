import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_HP, parseHp, newCreatureMeta, creatureOf, metaWithHp, metaWithMaxHp, hpTone, hpLabel, uniqueName } from './creature.js';

const token = (hp, maxHp, extra = {}) => ({ id: 't', meta: { creature: true, hp, maxHp, ...extra } });

test('parseHp aceita só inteiros de 1 a 9999', () => {
  assert.equal(parseHp('25'), 25);
  assert.equal(parseHp(1), 1);
  assert.equal(parseHp(MAX_HP), MAX_HP);
  for (const bad of ['', '0', '-3', '10000', '1.5', 'abc', null, undefined, NaN]) assert.equal(parseHp(bad), null, String(bad));
});

test('criatura nova começa com a vida cheia', () => {
  assert.deepEqual(newCreatureMeta(30), { creature: true, hp: 30, maxHp: 30 });
  const c = creatureOf({ meta: newCreatureMeta(30) });
  assert.deepEqual(c, { hp: 30, maxHp: 30, ratio: 1 });
});

test('creatureOf só reconhece tokens de criatura e corrige valores fora da faixa', () => {
  assert.equal(creatureOf(null), null);
  assert.equal(creatureOf({}), null);
  assert.equal(creatureOf({ meta: {} }), null);
  assert.equal(creatureOf({ meta: { hp: 5, maxHp: 5 } }), null);          // sem a marca creature
  assert.equal(creatureOf(token(99, 20)).hp, 20);                          // vida acima da máxima é limitada
  assert.equal(creatureOf(token(-4, 20)).hp, 0);
  assert.equal(creatureOf(token(5, 0)).maxHp, 1);
  assert.equal(creatureOf(token(undefined, 12)).hp, 12);                   // sem vida atual: cheia
  assert.equal(creatureOf(token(5, 20)).ratio, 0.25);
});

test('metaWithHp limita de 0 até a vida máxima e preserva o resto do meta', () => {
  const t = token(10, 30, { nota: 'x' });
  assert.deepEqual(metaWithHp(t, 12), { creature: true, hp: 12, maxHp: 30, nota: 'x' });
  assert.equal(metaWithHp(t, -50).hp, 0);
  assert.equal(metaWithHp(t, 500).hp, 30);
  assert.equal(metaWithHp(t, 'abc').hp, 30);
});

test('metaWithMaxHp nunca deixa a vida atual acima da nova máxima', () => {
  const t = token(25, 30);
  assert.deepEqual(metaWithMaxHp(t, 40), { creature: true, hp: 25, maxHp: 40 });
  assert.deepEqual(metaWithMaxHp(t, 10), { creature: true, hp: 10, maxHp: 10 });
  assert.equal(metaWithMaxHp(t, 0).maxHp, 1);
  assert.equal(metaWithMaxHp(t, 99999).maxHp, MAX_HP);
});

test('faixas de vida: tons e textos para os jogadores', () => {
  assert.deepEqual([1, 0.75, 0.5, 0.25, 0.1, 0].map(hpTone), ['ok', 'ok', 'warn', 'bad', 'bad', 'down']);
  assert.deepEqual([1, 0.75, 0.5, 0.25, 0].map(hpLabel), ['Ilesa', 'Ferida', 'Muito ferida', 'Quase derrotada', 'Derrotada']);
});

test('a moldura das criaturas existe como PNG 400x400 (o criador depende dela)', () => {
  const png = readFileSync('public/assets/frames/creature-frame.png');
  assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
  assert.equal(png.readUInt32BE(16), 400);   // largura (chunk IHDR)
  assert.equal(png.readUInt32BE(20), 400);   // altura
  assert.ok(png.length < 200 * 1024, 'moldura deveria ser leve');
});

test('uniqueName acrescenta (2), (3)... sem diferenciar maiúsculas', () => {
  assert.equal(uniqueName('Goblin', []), 'Goblin');
  assert.equal(uniqueName('Goblin', ['Goblin']), 'Goblin (2)');
  assert.equal(uniqueName(' goblin ', ['Goblin', 'Goblin (2)']), 'goblin (3)');
  assert.equal(uniqueName('Orc', ['Goblin']), 'Orc');
  assert.ok(uniqueName('a'.repeat(60), ['a'.repeat(60)]).length <= 60);
});

test('criatura sem vida: mesma moldura, sem números de vida, e dá para devolver a vida', async () => {
  const { newCreatureMeta, creatureOf, metaWithoutHp, metaWithMaxHp, metaWithHp } = await import('./creature.js');
  const meta = newCreatureMeta(null);
  assert.deepEqual(meta, { creature: true, noHp: true });
  const token = { meta };
  assert.equal(creatureOf(token).noHp, true, 'continua sendo criatura');
  assert.equal(creatureOf({ meta: newCreatureMeta(30) }).noHp, undefined);
  const withHp = { meta: newCreatureMeta(30) };
  assert.deepEqual(metaWithoutHp(withHp), { creature: true, noHp: true });
  const back = metaWithMaxHp(token, 12);
  assert.deepEqual(back, { creature: true, maxHp: 12, hp: 12 });
  assert.equal(metaWithHp({ meta: back }, 5).hp, 5);
});
