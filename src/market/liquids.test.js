import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKET_ITEMS, inventoryEffects, entryWeight, unitFills, roundFill } from './items.js';
import { buyItem, sellItem, consumeItem, setFill } from './inventory.js';
import { newCharacter, validateCharacter } from '../rules.js';

const find = name => MARKET_ITEMS.find(i => i.name === name);
const cantil = find('Cantil (odre)');
const flecha = MARKET_ITEMS.find(i => i.category === 'municao');
const withMoney = () => ({ ...newCharacter(), money: 100000 });
const weight = c => inventoryEffects(c.inventory, 6).weight;

test('só o cantil é recipiente de líquido, com capacidade de 1 L', () => {
  assert.deepEqual(MARKET_ITEMS.filter(i => i.liquid).map(i => i.name), ['Cantil (odre)']);
  assert.equal(cantil.liquid.capacity, 1);
});

test('níveis: de 0 a 1 L em passos de 0,05', () => {
  assert.equal(roundFill(0.74), 0.75);
  assert.equal(roundFill(0.12), 0.1);
  assert.equal(roundFill(7), 1, 'nunca passa de 1 litro');
  assert.equal(roundFill(-3), 0);
  assert.equal(roundFill('abc'), 0);
});

test('peso do cantil = peso do cantil vazio + litros (1 L = 1 kg), sem mexer no peso-base', () => {
  let c = buyItem(withMoney(), cantil.id, 1);
  assert.deepEqual(c.inventory[0].fills, [0]);
  assert.equal(weight(c), 0.5, 'vazio: só o peso original');
  c = setFill(c, cantil.id, 0, 0.5);
  assert.equal(weight(c), 1);
  c = setFill(c, cantil.id, 0, 1);
  assert.equal(weight(c), 1.5);
  c = setFill(c, cantil.id, 0, 5);
  assert.equal(c.inventory[0].fills[0], 1, 'não passa de 1 litro');
  assert.equal(weight(c), 1.5);
  assert.equal(cantil.weight, 0.5, 'o peso-base do item não muda');
});

test('o peso não acumula depois de muitas mudanças de nível', () => {
  let c = buyItem(withMoney(), cantil.id, 1);
  for (let i = 0; i < 200; i++) c = setFill(c, cantil.id, 0, (i % 21) * 0.05);
  c = setFill(c, cantil.id, 0, 0.25);
  assert.equal(weight(c), 0.75);
  assert.equal(cantil.weight, 0.5);
});

test('cada cantil tem o seu nível e o peso soma os níveis', () => {
  let c = buyItem(withMoney(), cantil.id, 3);
  assert.deepEqual(c.inventory[0].fills, [0, 0, 0]);
  c = setFill(c, cantil.id, 0, 1);
  c = setFill(c, cantil.id, 2, 0.3);
  assert.deepEqual(c.inventory[0].fills, [1, 0, 0.3]);
  assert.equal(weight(c), 3 * 0.5 + 1.3);
  assert.equal(setFill(c, cantil.id, 3, 0.5), null, 'unidade que não existe');
  assert.equal(setFill(buyItem(withMoney(), flecha.id, 1), flecha.id, 0, 0.5), null, 'item sem líquido');
});

test('diminuir a quantidade remove o nível da unidade retirada', () => {
  let c = buyItem(withMoney(), cantil.id, 3);
  c = setFill(setFill(setFill(c, cantil.id, 0, 0.2), cantil.id, 1, 0.6), cantil.id, 2, 1);
  const last = consumeItem(c, cantil.id, 1);
  assert.deepEqual(last.inventory[0].fills, [0.2, 0.6], 'sem índice sai a última');
  const middle = consumeItem(c, cantil.id, 1, 1);
  assert.deepEqual(middle.inventory[0], { id: cantil.id, qty: 2, equipped: false, fills: [0.2, 1] });
  assert.equal(weight(middle), 2 * 0.5 + 1.2);
  assert.deepEqual(consumeItem(c, cantil.id, 2).inventory[0].fills, [0.2]);
  assert.equal(consumeItem(c, cantil.id, 2, 0), null, 'índice só vale para uma unidade');
});

test('vender e comprar cantil mantém um nível por unidade', () => {
  let c = buyItem(withMoney(), cantil.id, 2);
  c = setFill(setFill(c, cantil.id, 0, 0.4), cantil.id, 1, 0.9);
  c = buyItem(c, cantil.id, 1);
  assert.deepEqual(c.inventory[0].fills, [0.4, 0.9, 0]);
  c = sellItem(c, cantil.id, 1);
  assert.deepEqual(c.inventory[0].fills, [0.4, 0.9]);
});

test('gastar: só diminui, nunca fica negativo e zero tira da mochila', () => {
  let c = buyItem(withMoney(), flecha.id, 3);
  assert.equal(consumeItem(c, flecha.id, 1).inventory[0].qty, 2);
  assert.equal(consumeItem(c, flecha.id, 0), null, 'zero não faz nada');
  assert.equal(consumeItem(c, flecha.id, -1), null, 'não existe jeito de aumentar por aqui');
  assert.equal(consumeItem(c, flecha.id, 4), null, 'mais do que tem');
  assert.equal(consumeItem(c, flecha.id, 1.5), null);
  assert.equal(consumeItem(c, 'inexistente', 1), null);
  assert.deepEqual(consumeItem(c, flecha.id, 3).inventory, []);
  for (let i = 0; i < 3; i++) c = consumeItem(c, flecha.id, 1) || c;
  assert.deepEqual(c.inventory, []);
});

test('o último exemplar de item customizado não sai por "gastar" (só descartando)', () => {
  const entry = { id: 'custom-11111111-1111-1111-1111-111111111111', custom: { name: 'Amuleto', weight: 0.2, effects: [], description: '' }, qty: 2, equipped: false };
  let c = { ...newCharacter(), inventory: [entry] };
  c = consumeItem(c, entry.id, 1);
  assert.equal(c.inventory[0].qty, 1);
  assert.equal(consumeItem(c, entry.id, 1), null);
});

test('validateCharacter guarda e corrige os níveis do cantil', () => {
  const raw = { ...newCharacter(), inventory: [
    { id: cantil.id, qty: 3, equipped: false, fills: [0.5, 7, 'x'] },
    { id: flecha.id, qty: 5, equipped: false, fills: [1, 1] },
  ] };
  const ok = validateCharacter(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(ok.inventory[0].fills, [0.5, 1, 0]);
  assert.equal('fills' in ok.inventory[1], false, 'item sem líquido não guarda níveis');
  assert.deepEqual(unitFills({ qty: 2 }, cantil), [0, 0]);
  const old = validateCharacter(JSON.parse(JSON.stringify({ ...raw, inventory: [{ id: cantil.id, qty: 2, equipped: false }] })));
  assert.deepEqual(old.inventory[0].fills, [0, 0], 'ficha antiga sem níveis: cantis vazios');
  assert.equal(entryWeight({ id: cantil.id, qty: 2 }), 1);
});

test('a capacidade do cantil no SQL (0039) bate com o catálogo', async () => {
  const { readFileSync } = await import('node:fs');
  const { LIQUID_CONTAINERS } = await import('./items.js');
  const sql = readFileSync(new URL('../../supabase/migrations/0039_inventory_items.sql', import.meta.url), 'utf8');
  for (const [id, { capacity }] of Object.entries(LIQUID_CONTAINERS)) assert.ok(sql.includes(`'${id}' then ${capacity}`), id);
});
