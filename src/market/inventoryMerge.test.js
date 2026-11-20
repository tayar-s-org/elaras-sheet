import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKET_ITEMS } from './items.js';
import { consumeItem, setFill } from './inventory.js';
import { mergeInventory, mergeRewards, rebaseSheet, inventoryDelta } from '../sheetRebase.js';
import { newCharacter } from '../rules.js';

const flecha = MARKET_ITEMS.find(i => i.category === 'municao');
const cantil = MARKET_ITEMS.find(i => i.name === 'Cantil (odre)');
const adaga = MARKET_ITEMS.find(i => i.name === 'Adaga');
const cid = n => `custom-${String(n).repeat(8)}-1111-1111-1111-${String(n).repeat(12)}`;
const sheet = inventory => ({ ...newCharacter(), inventory });
const qtyOf = (inv, id) => inv.find(e => e.id === id)?.qty || 0;
const e = (id, qty, extra = {}) => ({ id, qty, equipped: false, ...extra });

test('ficha tira 1 flecha enquanto o mestre entrega 5: soma os dois', () => {
  const base = [e(flecha.id, 20)];
  const local = consumeItem(sheet(base), flecha.id, 1).inventory;
  const cloud = [e(flecha.id, 25)];
  assert.equal(qtyOf(mergeInventory(base, local, cloud), flecha.id), 24);
});

test('mestre entrega item novo enquanto o jogador edita outro', () => {
  const base = [e(flecha.id, 20)];
  const local = consumeItem(sheet(base), flecha.id, 5).inventory;
  const cloud = [e(flecha.id, 20), e(adaga.id, 1)];
  const merged = mergeInventory(base, local, cloud);
  assert.equal(qtyOf(merged, flecha.id), 15);
  assert.equal(qtyOf(merged, adaga.id), 1);
});

test('transferência recebida e saída local ao mesmo tempo não duplicam nem perdem', () => {
  const base = [e(flecha.id, 10)];
  const cloud = [e(flecha.id, 7)]; // enviou 3 pelo servidor
  const local = [e(flecha.id, 9)]; // gastou 1 pela ficha
  assert.equal(qtyOf(mergeInventory(base, local, cloud), flecha.id), 6);
});

test('a nuvem tirou tudo e o local não mexeu: sai; o local comprou mais: sobra o que comprou', () => {
  const base = [e(flecha.id, 4)];
  assert.deepEqual(mergeInventory(base, base, []), []);
  assert.equal(qtyOf(mergeInventory(base, [e(flecha.id, 6)], []), flecha.id), 2);
});

test('a quantidade nunca fica negativa nem passa de 99 depois do merge', () => {
  const base = [e(flecha.id, 5)];
  assert.deepEqual(mergeInventory(base, [], [e(flecha.id, 2)]), [], 'local vendeu tudo e a nuvem tirou 3: zero, não negativo');
  assert.equal(qtyOf(mergeInventory([e(flecha.id, 90)], [e(flecha.id, 95)], [e(flecha.id, 99)]), flecha.id), 99);
});

test('item novo só no local continua, item só da nuvem entra', () => {
  const merged = mergeInventory([], [e(flecha.id, 2)], [e(adaga.id, 1)]);
  assert.equal(qtyOf(merged, flecha.id), 2);
  assert.equal(qtyOf(merged, adaga.id), 1);
});

test('equipado: o que mudou localmente vence; senão vale o da nuvem', () => {
  const base = [e(adaga.id, 1)];
  const merged = mergeInventory(base, [{ ...base[0], equipped: true }], [e(adaga.id, 3)]);
  assert.equal(merged[0].qty, 3);
  assert.equal(merged[0].equipped, true);
  assert.equal(mergeInventory(base, base, [{ ...base[0], equipped: true, qty: 2 }])[0].equipped, true);
});

test('cantil: mexer no nível em um aparelho e receber outro cantil em outro', () => {
  const base = [e(cantil.id, 1, { fills: [0.2] })];
  const local = setFill(sheet(base), cantil.id, 0, 0.8).inventory;
  const cloud = [e(cantil.id, 2, { fills: [0.2, 1] })]; // recebeu um cantil cheio
  const merged = mergeInventory(base, local, cloud);
  assert.equal(merged[0].qty, 2);
  assert.deepEqual(merged[0].fills, [0.8, 1]);
});

test('cantil: nível alterado na nuvem (token) chega na ficha que não mexeu nele', () => {
  const base = [e(cantil.id, 2, { fills: [0.2, 0.5] })];
  const cloud = [e(cantil.id, 2, { fills: [0.2, 1] })];
  assert.deepEqual(mergeInventory(base, base, cloud)[0].fills, [0.2, 1]);
  const local = setFill(sheet(base), cantil.id, 0, 0.9).inventory; // mexeu em OUTRA unidade
  assert.deepEqual(mergeInventory(base, local, cloud)[0].fills, [0.9, 1]);
});

test('cantil: ficha e nuvem mexem no mesmo cantil: vale a ficha; a outra unidade segue a nuvem', () => {
  const base = [e(cantil.id, 2, { fills: [0.2, 0.5] })];
  const local = setFill(sheet(base), cantil.id, 1, 0.1).inventory;
  const cloud = [e(cantil.id, 2, { fills: [0.7, 0.9] })];
  assert.deepEqual(mergeInventory(base, local, cloud)[0].fills, [0.7, 0.1]);
});

test('cantil: nuvem tirou uma unidade e a ficha mudou o nível de outra', () => {
  const base = [e(cantil.id, 3, { fills: [0.2, 0.6, 1] })];
  const cloud = [e(cantil.id, 2, { fills: [0.2, 1] })]; // saiu a do meio (0,6)
  const local = setFill(sheet(base), cantil.id, 2, 0.4).inventory; // ficha esvaziou a de 1 L até 0,4
  const merged = mergeInventory(base, local, cloud)[0];
  assert.equal(merged.qty, 2);
  assert.deepEqual(merged.fills, [0.2, 0.4]);
});

test('item customizado: transferido para fora some; entregue duas vezes não duplica', () => {
  const custom = { name: 'Amuleto', weight: 0.2, effects: [], description: '' };
  const base = [{ id: cid(1), custom, qty: 1, equipped: false }];
  assert.deepEqual(mergeInventory(base, base, []), []);
  assert.equal(qtyOf(mergeInventory([], base, base), cid(1)), 1);
});

test('inventoryDelta lista só o que a nuvem mudou', () => {
  const d = inventoryDelta([e(flecha.id, 3), e(adaga.id, 1)], [e(flecha.id, 8), e(adaga.id, 1)]);
  assert.deepEqual(d.map(x => [x.id, x.delta]), [[flecha.id, 5]]);
});

test('mergeRewards: mudar só a mochila na nuvem não é mais conflito; outro campo continua sendo', () => {
  const base = sheet([e(flecha.id, 10)]);
  const cloud = { ...base, inventory: [e(flecha.id, 12)] };
  const local = { ...base, name: 'Novo nome', inventory: [e(flecha.id, 9)] };
  const out = mergeRewards(base, local, cloud);
  assert.equal(out.name, 'Novo nome');
  assert.equal(qtyOf(out.inventory, flecha.id), 11);
  assert.equal(mergeRewards(base, local, { ...cloud, notes: 'alguém mexeu aqui' }), null);
});

test('rebaseSheet reconcilia ficha com edição pendente e é idempotente', () => {
  const base = sheet([e(flecha.id, 20)]);
  const local = consumeItem(base, flecha.id, 1);
  const cloudChar = { ...base, inventory: [e(flecha.id, 25)] };
  const tab = { id: 's1', character: local, cloud: { id: 'c1', revision: 3, base: JSON.stringify(base) } };
  const row = { id: 'c1', revision: 4, character: cloudChar };
  const fix = rebaseSheet(tab, row, { dirty: true });
  assert.equal(qtyOf(fix.character.inventory, flecha.id), 24);
  assert.deepEqual(fix.items.map(x => x.delta), [5]);
  assert.equal(fix.cloud.revision, 4);
  // aplicar a mesma linha de novo (já na revisão 4) não soma de novo
  const again = rebaseSheet({ ...tab, character: fix.character, cloud: fix.cloud }, row, { dirty: true });
  assert.equal(again, null);
});

test('rebaseSheet: ficha sem edições passa a ser a da nuvem', () => {
  const base = sheet([e(flecha.id, 20)]);
  const tab = { id: 's1', character: base, cloud: { id: 'c1', revision: 3, base: JSON.stringify(base) } };
  const cloudChar = { ...base, inventory: [e(flecha.id, 19)] };
  const fix = rebaseSheet(tab, { id: 'c1', revision: 4, character: cloudChar });
  assert.equal(qtyOf(fix.character.inventory, flecha.id), 19);
});

test('cantil: ficha sem mexer aceita a nuvem inteira (dois cantis viram um cheio)', () => {
  const base = [e(cantil.id, 2, { fills: [0.2, 0.6] })];
  const cloud = [e(cantil.id, 1, { fills: [1] })];
  const merged = mergeInventory(base, base, cloud);
  assert.equal(merged[0].qty, 1);
  assert.deepEqual(merged[0].fills, [1]);
});

test('cantil: ficha alterou uma unidade e a nuvem trocou o nível de outra ao retirar uma', () => {
  const base = [e(cantil.id, 2, { fills: [0.2, 0.6] })];
  const local = setFill(sheet(base), cantil.id, 0, 0.3).inventory;
  const cloud = [e(cantil.id, 1, { fills: [1] })]; // sobrou uma unidade, agora cheia
  const merged = mergeInventory(base, local, cloud)[0];
  assert.equal(merged.qty, 1);
  assert.deepEqual(merged.fills, [0.3], 'a unidade que a ficha mexeu mantém o nível local; a outra foi retirada');
});

test('cantil: nível alterado na nuvem vale para a unidade mesmo com valores repetidos', () => {
  const base = [e(cantil.id, 2, { fills: [0.5, 0.5] })];
  const local = setFill(sheet(base), cantil.id, 0, 0.1).inventory;
  const cloud = [e(cantil.id, 2, { fills: [0.5, 0.9] })];
  assert.deepEqual(mergeInventory(base, local, cloud)[0].fills, [0.1, 0.9]);
});

test('cantil: mesma quantidade nos três lados compara por posição, mesmo com níveis repetidos', () => {
  const base = [e(cantil.id, 2, { fills: [0.5, 0.5] })];
  const local = setFill(sheet(base), cantil.id, 0, 0.1).inventory;
  const cloud = [e(cantil.id, 2, { fills: [0.9, 0.5] })]; // a nuvem mexeu na MESMA unidade 0
  assert.deepEqual(mergeInventory(base, local, cloud)[0].fills, [0.1, 0.5]);
});

test('cantil: a nuvem consumiu a unidade que a ficha acabou de alterar', () => {
  const base = [e(cantil.id, 2, { fills: [0.2, 0.6] })];
  const local = setFill(sheet(base), cantil.id, 0, 0.3).inventory;
  const cloud = [e(cantil.id, 1, { fills: [0.6] })]; // saiu a unidade 0
  const merged = mergeInventory(base, local, cloud)[0];
  assert.equal(merged.qty, 1);
  assert.deepEqual(merged.fills, [0.6]);
});

test('cantil: nível alterado na nuvem + cantil entregue enquanto a ficha mexeu em outra unidade', () => {
  const base = [e(cantil.id, 2, { fills: [0, 0] })];
  const local = setFill(sheet(base), cantil.id, 1, 0.25).inventory;
  const cloud = [e(cantil.id, 3, { fills: [0.6, 0, 0] })]; // unidade 0 enchida pelo token e um terceiro cantil
  const merged = mergeInventory(base, local, cloud)[0];
  assert.equal(merged.qty, 3);
  assert.deepEqual(merged.fills, [0.6, 0.25, 0]);
});
