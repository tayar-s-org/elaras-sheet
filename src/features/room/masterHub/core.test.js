import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  MASTER_MODULES, MODULE_GROUPS, LIMITS, previewAdjust, makePendingStore, runBatch, retryFailed, summarizeBatch,
  AUDIT_CATEGORIES, categoryLabel, auditDetails, auditTitle, experienceChips, walletChips,
} from './core.js';
import { IMAGE_ICONS, CURRENCY_ICONS, ALL_ICONS, isImageIcon, imageIconUrl, iconText, cleanIconKeys, DEFAULT_ICON } from '../../../market/experienceIcons.js';

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), size: () => m.size }; };
const seq = () => { let n = 0; return () => `id-${++n}`; };

test('os módulos pedidos existem, na ordem, sem chaves repetidas', () => {
  assert.deepEqual(MASTER_MODULES.map(m => m.label).sort(), ['Criaturas e Tokens', 'Experiências', 'Histórico', 'Itens', 'Jogadores', 'Mapas', 'Moedas', 'Música', 'Soundpad', 'Status e Condições']);
  // os 3 mais usados em destaque; o resto agrupado
  const by = g => MASTER_MODULES.filter(m => m.group === g).map(m => m.label);
  assert.deepEqual(by('rewards'), ['Moedas', 'Itens', 'Experiências']);
  assert.deepEqual(by('campaign'), ['Jogadores', 'Status e Condições']);
  assert.deepEqual(by('tools'), ['Criaturas e Tokens', 'Mapas', 'Música', 'Soundpad', 'Histórico']);
  assert.ok(MASTER_MODULES.every(m => MODULE_GROUPS.some(([g]) => g === m.group)));
  assert.equal(new Set(MASTER_MODULES.map(m => m.key)).size, MASTER_MODULES.length);
  assert.ok(MASTER_MODULES.some(m => m.key === 'history'));
});

test('prévia de dinheiro e XP segue os limites do servidor', () => {
  assert.deepEqual(previewAdjust('money', 500, 'add', 100), { ok: true, current: 500, next: 600, delta: 100 });
  assert.deepEqual(previewAdjust('money', 500, 'add', -9999), { ok: true, current: 500, next: 0, delta: -500 });
  assert.equal(previewAdjust('money', 999999999, 'add', 1000).delta, 0);
  assert.deepEqual(previewAdjust('money', 500, 'set', 50), { ok: true, current: 500, next: 50, delta: -450 });
  assert.equal(previewAdjust('money', 500, 'add', 0).ok, false);
  assert.equal(previewAdjust('money', 500, 'add', 1000001).ok, false);
  assert.equal(previewAdjust('money', 500, 'set', -1).ok, false);
  assert.equal(previewAdjust('money', 500, 'set', 1000000000).ok, false);
  assert.equal(previewAdjust('money', 500, 'add', '').ok, false);
  assert.equal(previewAdjust('xp', 42, 'add', 10001).ok, false);
  assert.equal(previewAdjust('xp', 5, 'add', -10).next, 0);
  assert.equal(previewAdjust('xp', 5, 'set', 1000000).next, 1000000);
  assert.equal(LIMITS.wallet.max, 999999999);
});

test('lote: resultado individual, falha parcial não vira sucesso total', async () => {
  const targets = [{ id: 'a', name: 'Aria' }, { id: 'b', name: 'Bruno' }, { id: 'c', name: 'Cris' }];
  const fn = async t => { if (t.id === 'b') throw new Error('Esta ficha não está vinculada.'); return { replayed: false, after: { money: 1 } }; };
  const { results } = await runBatch(targets, fn, { newId: seq() });
  assert.deepEqual(results.map(r => r.ok), [true, false, true]);
  assert.equal(results[1].error, 'Esta ficha não está vinculada.');
  const s = summarizeBatch(results);
  assert.equal(s.allOk, false);
  assert.equal(s.text, '2 de 3 concluídos; 1 falhou.');
  assert.match(summarizeBatch([{ ok: false }, { ok: false }]).text, /Nada foi aplicado/);
  assert.equal(summarizeBatch([{ ok: true }]).text, 'Concluído.');
  assert.equal(summarizeBatch([{ ok: true }, { ok: true }]).allOk, true);
  assert.equal(summarizeBatch([{ ok: true, replayed: true }]).replayed, 1);
});

test('lote: cada alvo tem o próprio request_id e o reenvio reaproveita o id sem repetir os já aplicados', async () => {
  const targets = [{ id: 'a' }, { id: 'b' }];
  const seen = [];
  let failB = true;
  const fn = async (t, rid) => { seen.push([t.id, rid]); if (t.id === 'b' && failB) { const e = new Error('Sem conexão'); e.uncertain = true; throw e; } return { replayed: false }; };
  const store = makePendingStore(memory());
  const first = await runBatch(targets, fn, { opKey: 'money', store, newId: seq() });
  assert.equal(new Set(seen.map(s => s[1])).size, 2); // ids diferentes por alvo
  assert.deepEqual(first.results.map(r => [r.id, r.ok, Boolean(r.uncertain)]), [['a', true, false], ['b', false, true]]);
  failB = false;
  const before = seen.length;
  const second = await retryFailed(first, targets, fn, { opKey: 'money', store, newId: seq() });
  assert.equal(seen.length, before + 1); // só o B foi reenviado
  assert.equal(seen.at(-1)[0], 'b');
  assert.equal(seen.at(-1)[1], seen.find(s => s[0] === 'b')[1]); // mesmo request_id
  assert.deepEqual(second.results.map(r => r.ok), [true, true]);
});

test('id pendente sobrevive a recarregar a página quando o resultado é incerto e some quando é definitivo', async () => {
  const storage = memory();
  const store = makePendingStore(storage);
  const uncertain = async () => { const e = new Error('timeout'); e.uncertain = true; throw e; };
  const a = await runBatch([{ id: 'x' }], uncertain, { opKey: 'xp', store, newId: () => 'rid-1' });
  assert.equal(a.results[0].uncertain, true);
  assert.equal(storage.size(), 1);
  // "recarrega": novo estado em memória, mesmo storage → reaproveita rid-1
  let used = null;
  const b = await runBatch([{ id: 'x' }], async (t, rid) => { used = rid; return { replayed: true }; }, { opKey: 'xp', store: makePendingStore(storage), newId: () => 'rid-2' });
  assert.equal(used, 'rid-1');
  assert.equal(b.results[0].replayed, true);
  assert.equal(storage.size(), 0);
  // erro definitivo libera o id (a próxima tentativa é uma operação nova)
  await runBatch([{ id: 'x' }], async () => { throw new Error('Apenas o mestre'); }, { opKey: 'xp', store, newId: () => 'rid-3' });
  assert.equal(storage.size(), 0);
});

test('histórico: categorias, rótulos e detalhes antes → depois', () => {
  assert.equal(AUDIT_CATEGORIES.length, 7);
  assert.equal(categoryLabel('wallet'), 'Carteira');
  assert.deepEqual(auditDetails({ category: 'money', before: { money: 500 }, after: { money: 600 } }), [['Dinheiro', '500 → 600']]);
  assert.deepEqual(auditDetails({ category: 'xp', before: { xp: 9 }, after: { xp: 12 } }), [['XP', '9 → 12'], ['Nível', '1 → 2']]);
  assert.deepEqual(auditDetails({ category: 'item', before: { item: 'adaga', qty: 1 }, after: { item: 'adaga', qty: 3, given: 2 } }, () => 'Adaga'), [['Adaga', 'quantidade 1 → 3 (entregues 2)']]);
  assert.deepEqual(auditDetails({ category: 'wallet', before: { name: 'Ouro', symbol: 'G', amount: 0 }, after: { name: 'Ouro', symbol: 'G', amount: 25 } }), [['G Ouro', '0 → 25']]);
  assert.deepEqual(auditDetails({ category: 'condition', before: { conditions: [] }, after: { conditions: [{ label: 'Cego' }, { label: 'Confuso' }] } }), [['Condições', 'nenhuma → Cego, Confuso']]);
  assert.deepEqual(auditDetails({ category: 'currency', kind: 'delete', before: { currency: { name: 'Ouro', symbol: 'G' }, wallets: [{}, {}] }, after: null }), [['Moeda', 'Ouro → —'], ['Símbolo', 'G → —'], ['Saldos apagados', '2 carteira(s)']]);
  assert.deepEqual(auditDetails({ category: 'experience', kind: 'add', before: { name: 'Fama', icon: '★', amount: 1 }, after: { name: 'Fama', icon: '★', amount: 4 } }), [['★ Fama', '1 → 4']]);
  assert.deepEqual(auditDetails({ category: 'item', kind: 'shop_buy', before: { name: 'Anel', qty: 1, wallet: 25, currency_name: 'Ouro' }, after: { name: 'Anel', qty: 2, bought: 1, total: 10, symbol: 'G', currency_name: 'Ouro', wallet: 15 } }),
    [['Anel', 'quantidade 1 → 2 (comprou 1 por 10 G)'], ['Carteira G Ouro', '25 → 15']]);
  assert.deepEqual(auditDetails({ category: 'item', kind: 'shop_update', before: { name: 'Anel', price: 10, symbol: 'G', active: true }, after: { name: 'Anel', price: 20, symbol: 'G', active: false } }),
    [['Item da loja', 'Anel'], ['Preço', '10 G → 20 G (pausado)']]);
  assert.deepEqual(auditDetails({ category: 'item', kind: 'shop_create', before: null, after: { name: 'Anel', price: 10, symbol: 'G', active: true } }), [['Item da loja', 'Anel'], ['Preço', '— → 10 G']]);
  assert.equal(auditTitle({ category: 'item', kind: 'shop_buy', summary: 'Comprou 1x Anel por 10 G', after: { name: 'Anel' } }, 'Aria'), 'Comprou na loja · Aria · Comprou 1x Anel por 10 G');
  assert.deepEqual(auditDetails({ category: '??' }), []);
  assert.equal(auditTitle({ kind: 'add', summary: 'Dinheiro: 500 → 600' }, 'Aria'), 'Somou · Aria · Dinheiro: 500 → 600');
  assert.equal(auditTitle({ category: 'item', kind: 'give', summary: 'Entregou 2x adaga', after: { item: 'adaga', given: 2 } }, 'Aria', () => 'Adaga'), 'Entregou · Aria · Entregou 2× Adaga');
  assert.equal(auditTitle({ category: 'item', kind: 'give', after: { item: 'x', name: 'Anel', given: 1 } }, 'Bruno'), 'Entregou · Bruno · Entregou 1× Anel');
});

test('a migração 0040 existe e protege os RPCs do mestre, o histórico e as carteiras', () => {
  const sql = readFileSync(new URL('../../../../supabase/migrations/0040_master_hub.sql', import.meta.url), 'utf8');
  for (const fn of ['gm_adjust_money', 'gm_adjust_xp', 'gm_give_items', 'gm_upsert_currency', 'gm_delete_currency', 'gm_wallet_adjust',
    'gm_upsert_experience_type', 'gm_delete_experience_type', 'gm_experience_adjust', 'gm_set_conditions']) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}\\(`), fn);
    assert.match(sql, new RegExp(`public\\.${fn}\\([^)]*\\)[^;]*to authenticated`, 's'), `${fn} concedida`);
  }
  assert.match(sql, /master_audit_select[^;]*is_gm\(table_id\)/s); // histórico só do mestre
  assert.match(sql, /wallets_select[^;]*is_gm\(table_id\) or public\.owns_character\(character_id\)/s); // carteira só dono e mestre
  assert.match(sql, /foreign key \(table_id, currency_id\) references public\.table_currencies/); // FK composta
  assert.match(sql, /pg_advisory_xact_lock/); // idempotência concorrente
  assert.match(sql, /state_keep_conditions/); // gatilho das condições
  assert.doesNotMatch(sql, /create or replace function public\.grant_money|create or replace function public\.grant_xp|create or replace function public\.gm_give_item\(/); // não reescreve o que está em uso
});

test('experiências personalizadas e carteira viram chips só com valor', () => {
  const extras = {
    types: [{ id: 't1', name: 'Reputação', icon: '🏅', description: 'fama' }, { id: 't2', name: 'Maestria', icon: '⚔' }],
    experience: { pc1: { t1: 7, t2: 0 } },
    currencies: [{ id: 'c1', name: 'Ouro', symbol: '🪙' }],
    wallets: { pc1: { c1: 25 } },
  };
  assert.deepEqual(experienceChips(extras, 'pc1').map(h => h.text), ['🏅 Reputação 7']);
  assert.equal(experienceChips(extras, 'pc1')[0].icon, '🏅');
  assert.equal(experienceChips(extras, 'pc1')[0].label, 'Reputação 7');
  assert.equal(experienceChips(extras, 'pc1')[0].title, 'fama');
  assert.deepEqual(experienceChips(extras, 'outro'), []);
  assert.deepEqual(walletChips(extras, 'pc1').map(h => h.text), ['🪙 25']);
  assert.deepEqual(experienceChips(undefined, 'x'), []);
});

test('a migração 0042 deixa as experiências públicas na mesa e mantém a carteira privada', () => {
  const sql = readFileSync(new URL('../../../../supabase/migrations/0042_experience_public.sql', import.meta.url), 'utf8');
  assert.match(sql, /experience_select on public\.character_experience[^;]*using \(public\.is_member\(table_id\)\)/s);
  assert.doesNotMatch(sql, /wallets_select/); // não mexe na política da carteira
});

test('ícones de experiência: imagens embutidas existem, cabem no limite do banco e têm símbolo de reserva', () => {
  assert.equal(new Set(IMAGE_ICONS.map(i => i.key)).size, IMAGE_ICONS.length);
  for (const i of IMAGE_ICONS) {
    assert.ok(i.key.startsWith('@') && i.key.length <= 8, i.key); // experience_types.icon aceita até 8 caracteres
    assert.ok(existsSync(new URL(`../../../../public/assets/experience/${i.file}`, import.meta.url)), i.file);
    assert.equal(i.dir, 'experience');
    assert.equal(isImageIcon(i.key), true);
    assert.match(imageIconUrl(i.key), new RegExp(`assets/experience/${i.file}$`));
    assert.equal(iconText(i.key), DEFAULT_ICON); // em listas de texto a imagem vira o símbolo padrão
  }
  assert.equal(IMAGE_ICONS.length, 5);
  assert.equal(isImageIcon('🏅'), false);
  assert.equal(isImageIcon('toString'), false);
  assert.equal(imageIconUrl('🏅'), null);
  assert.equal(iconText('🏅'), '🏅');
  assert.equal(iconText(''), DEFAULT_ICON);
  assert.deepEqual(auditDetails({ category: 'experience', kind: 'add', before: { name: 'Fama', icon: '@trofeu', amount: 1 }, after: { name: 'Fama', icon: '@trofeu', amount: 4 } }), [['★ Fama', '1 → 4']]);
  const chip = experienceChips({ types: [{ id: 't', name: 'Fama', icon: '@trofeu' }], experience: { p: { t: 3 } } }, 'p')[0];
  assert.equal(chip.icon, '@trofeu');
  assert.equal(chip.text, '★ Fama 3');
});

test('ícones de moeda: imagens existem, chaves únicas e dentro do limite do símbolo (8 caracteres)', () => {
  assert.equal(CURRENCY_ICONS.length, 5);
  assert.equal(new Set(ALL_ICONS.map(i => i.key)).size, ALL_ICONS.length); // chaves não colidem com as de experiência
  for (const i of CURRENCY_ICONS) {
    assert.ok(i.key.startsWith('@') && i.key.length <= 8, i.key); // table_currencies.symbol aceita até 8 caracteres
    assert.equal(i.dir, 'currency');
    assert.ok(existsSync(new URL(`../../../../public/assets/currency/${i.file}`, import.meta.url)), i.file);
    assert.match(imageIconUrl(i.key), new RegExp(`assets/currency/${i.file}$`));
    assert.equal(iconText(i.key, '¤'), '¤');
  }
  assert.equal(iconText('🪙', '¤'), '🪙'); // moeda antiga com emoji continua igual
  assert.equal(iconText('', '¤'), '¤');
  assert.equal(cleanIconKeys('Colocou à venda: Anel (10 @euro)'), 'Colocou à venda: Anel (10 ¤)');
  assert.equal(cleanIconKeys('Fama @trofeu 3'), 'Fama ★ 3');
  assert.equal(cleanIconKeys('email@teste e @desconhecido'), 'email@teste e @desconhecido');
  const w = walletChips({ currencies: [{ id: 'c', name: 'Euro', symbol: '@euro' }], wallets: { p: { c: 12 } } }, 'p')[0];
  assert.equal(w.icon, '@euro');
  assert.equal(w.text, '¤ 12');
  assert.equal(w.label, '12');
  assert.deepEqual(auditDetails({ category: 'wallet', before: { name: 'Euro', symbol: '@euro', amount: 0 }, after: { name: 'Euro', symbol: '@euro', amount: 5 } }), [['¤ Euro', '0 → 5']]);
  assert.equal(auditTitle({ kind: 'shop_create', summary: 'Colocou à venda: Anel (10 @euro)' }, ''), 'Pôs à venda · Colocou à venda: Anel (10 ¤)');
});

test('histórico no modo raw devolve a chave da imagem (a tela troca pela imagem da moeda)', () => {
  assert.deepEqual(auditDetails({ category: 'wallet', before: { name: 'Euro', symbol: '@euro', amount: 0 }, after: { name: 'Euro', symbol: '@euro', amount: 5 } }, id => id, { raw: true }), [['@euro Euro', '0 → 5']]);
  assert.equal(auditTitle({ kind: 'shop_create', summary: 'Colocou à venda: Anel (10 @euro)' }, '', id => id, { raw: true }), 'Pôs à venda · Colocou à venda: Anel (10 @euro)');
});
