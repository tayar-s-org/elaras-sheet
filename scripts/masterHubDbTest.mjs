// Teste de banco da Central do Mestre (migração 0040) contra o Supabase de verdade: permissões, dinheiro/XP exatos e
// compatibilidade com o rebase da ficha, itens, moedas/carteiras, experiências, condições (gatilho), idempotência e concorrência.
// NÃO entra no `npm test` (precisa de rede e cria contas descartáveis elara.teste.mh*).
//
//   node scripts/masterHubDbTest.mjs
//
// Usa só a chave publicável (VITE_SUPABASE_ANON_KEY, em .env.local). No fim apaga as contas, mesas e fichas que criou
// (SUPABASE_ACCESS_TOKEN via scripts/db.mjs; passe --keep para não apagar).
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { newCharacter, validateCharacter } from '../src/rules.js';
import { MARKET_ITEMS } from '../src/market/items.js';
import { rebaseSheet, sameSheet } from '../src/sheetRebase.js';

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const URL_ = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY;
const stamp = Date.now().toString(36);
const PASSWORD = `Teste-${stamp}-Mh!9`;
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ADAGA = MARKET_ITEMS.find(i => i.name === 'Adaga').id;

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { if (cond) pass += 1; else { fail += 1; console.log(`  FALHOU: ${name} ${extra}`); } };
const rpc = (u, fn, args) => u.sb.rpc(fn, args);
const ok = async (name, p) => { const r = await p; check(name, !r.error, r.error?.message); return r; };
const denied = async (name, p, re = null) => { const r = await p; check(name, Boolean(r.error) && (!re || re.test(r.error.message)), r.error ? r.error.message : 'deveria ter falhado'); return r; };
const rid = () => randomUUID();

async function user(label) {
  const sb = client();
  const email = `elara.teste.mh${label}${stamp}@mailinator.com`;
  const { data, error } = await sb.auth.signUp({ email, password: PASSWORD, options: { data: { display_name: `Mh ${label}` } } });
  if (error) throw new Error(`signUp ${label}: ${error.message}`);
  let session = data.session;
  if (!session) ({ data: { session } } = await sb.auth.signInWithPassword({ email, password: PASSWORD }));
  if (!session) throw new Error(`Sem sessão para ${label} (confirmação de e-mail ligada?)`);
  return { sb, id: session.user.id, email };
}
const row = async (u, id) => (await u.sb.from('characters').select('data,revision').eq('id', id).single()).data;
const money = async (u, id) => (await row(u, id)).data.money;
const xp = async (u, id) => (await row(u, id)).data.xp;
const stateOf = async (u, t, ch) => (await u.sb.from('table_character_state').select('state').eq('table_id', t).eq('character_id', ch).maybeSingle()).data?.state;
const audit = async (gm, t, ch, category) => (await gm.sb.from('master_audit_log').select('*').eq('table_id', t).eq('character_id', ch).eq('category', category).order('created_at')).data || [];
const sql = q => execFileSync('node', ['scripts/db.mjs', '--query', q], { encoding: 'utf8' });
// Roda um SQL que deve falhar e devolve a mensagem de erro (ou 'OK' se passou).
const sqlTry = q => { try { return `OK ${sql(q)}`; } catch (e) { return `${e.stderr || ''}${e.stdout || ''}${e.message}`; } };

async function makeChar(u, name, extra = {}) {
  const c = validateCharacter({ ...newCharacter(), name, ...extra });
  const { data, error } = await u.sb.from('characters').insert({ name, data: c, schema_version: 1, table_id: null }).select('id').single();
  if (error) throw new Error(`personagem ${name}: ${error.message}`);
  return data.id;
}

const cleanup = [];
try {
  console.log('Criando contas, mesas e personagens descartáveis…');
  const [gm, a, b, c] = [await user('gm'), await user('a'), await user('b'), await user('c')];
  cleanup.push(gm.id, a.id, b.id, c.id);
  const mkTable = async (u, name) => {
    const { data, error } = await u.sb.from('tables').insert({ name, description: '', visibility: 'public', auto_approve: true, max_players: 6 }).select('id').single();
    if (error) throw new Error(`mesa: ${error.message}`);
    return data.id;
  };
  const T1 = await mkTable(gm, `Teste mh ${stamp}`);
  const T2 = await mkTable(c, `Teste mh outra ${stamp}`);
  const chA = await makeChar(a, 'Aria');
  const chB = await makeChar(b, 'Bruno');
  const chC = await makeChar(c, 'Cris');
  for (const [u, ch, t] of [[a, chA, T1], [b, chB, T1], [c, chC, T2]]) {
    await ok('entrar na mesa', u.sb.rpc('join_public_table', { p_table: t, p_message: '', p_character: ch }));
    await u.sb.from('characters').update({ table_id: t }).eq('id', ch);
  }
  const ver = await ok('master_hub_version', rpc(gm, 'master_hub_version', {}));
  check('versão 4 (Central + Loja do Mestre + preço em $ + Loja aprovada)', ver.data === 4);

  console.log('— permissões —');
  const mon = (u, ch, mode, amount, req = rid(), t = T1) => rpc(u, 'gm_adjust_money', { p_table: t, p_character: ch, p_mode: mode, p_amount: amount, p_note: '', p_request_id: req });
  await denied('jogador não ajusta dinheiro', mon(a, chA, 'add', 100), /Apenas o mestre/);
  await denied('jogador não ajusta o dinheiro do outro', mon(a, chB, 'add', 100), /Apenas o mestre/);
  await denied('estranho (outra mesa) não ajusta', mon(c, chA, 'add', 100), /Apenas o mestre/);
  await denied('mestre de outra mesa não mexe no personagem de T1', mon(c, chA, 'add', 100, rid(), T2), /não está vinculado/);
  await denied('jogador não ajusta XP', rpc(a, 'gm_adjust_xp', { p_table: T1, p_character: chA, p_mode: 'add', p_amount: 5, p_note: '', p_request_id: rid() }), /Apenas o mestre/);
  await denied('jogador não entrega item', rpc(a, 'gm_give_items', { p_table: T1, p_character: chA, p_id: ADAGA, p_custom: null, p_qty: 1, p_note: '', p_request_id: rid() }), /Apenas o mestre/);
  await denied('jogador não cria moeda', rpc(a, 'gm_upsert_currency', { p_table: T1, p_id: null, p_name: 'Ouro', p_symbol: 'G', p_description: '', p_rate: null, p_request_id: rid() }), /Apenas o mestre/);
  await denied('jogador não aplica condição', rpc(a, 'gm_set_conditions', { p_table: T1, p_character: chA, p_conditions: [{ label: 'X' }], p_note: '', p_request_id: rid() }), /Apenas o mestre/);
  await denied('jogador não cria tipo de experiência', rpc(a, 'gm_upsert_experience_type', { p_table: T1, p_id: null, p_name: 'Rep', p_description: '', p_icon: '', p_category: '', p_request_id: rid() }), /Apenas o mestre/);
  await denied('sem request_id', rpc(gm, 'gm_adjust_money', { p_table: T1, p_character: chA, p_mode: 'add', p_amount: 1, p_note: '', p_request_id: null }), /request_id/);
  check('nada mudou nas tentativas negadas', await money(a, chA) === 500 && await money(b, chB) === 500);

  console.log('— dinheiro: valores, limites e equivalência com grant_money —');
  await ok('mestre soma 100 a A', mon(gm, chA, 'add', 100));
  check('A = 600', await money(a, chA) === 600);
  await ok('grant_money antigo soma 100 a B', rpc(gm, 'grant_money', { p_table: T1, p_character: chB, p_amount: 100, p_note: '' }));
  check('B = 600 (mesmo efeito)', await money(b, chB) === 600);
  const ma = (await gm.sb.from('money_awards').select('*').eq('character_id', chA).order('created_at', { ascending: false }).limit(1)).data[0];
  const mb = (await gm.sb.from('money_awards').select('*').eq('character_id', chB).order('created_at', { ascending: false }).limit(1)).data[0];
  check('money_awards: mesmo formato (amount, claimed, granted_by)', ma.amount === mb.amount && ma.amount === 100 && ma.claimed_at && mb.claimed_at && ma.granted_by === mb.granted_by);
  let r = await ok('retira 50', mon(gm, chA, 'add', -50)); check('A = 550', await money(a, chA) === 550);
  check('retorno traz antes/depois do servidor', r.data?.before?.money === 600 && r.data?.after?.money === 550 && r.data?.replayed === false);
  await ok('define 1234', mon(gm, chA, 'set', 1234)); check('A = 1234', await money(a, chA) === 1234);
  const lastSet = (await gm.sb.from('money_awards').select('amount').eq('character_id', chA).order('created_at', { ascending: false }).limit(1)).data[0];
  check('definir grava o delta efetivo (1234−550=684)', lastSet.amount === 684, JSON.stringify(lastSet));
  await ok('retirar além do saldo limita em 0', mon(gm, chA, 'add', -1000000)); check('A = 0', await money(a, chA) === 0);
  const clampAward = (await gm.sb.from('money_awards').select('amount').eq('character_id', chA).order('created_at', { ascending: false }).limit(1)).data[0];
  check('delta efetivo do clamp = −1234', clampAward.amount === -1234, JSON.stringify(clampAward));
  const before = (await gm.sb.from('money_awards').select('id', { count: 'exact', head: true }).eq('character_id', chA)).count;
  await ok('definir o mesmo valor não muda nada', mon(gm, chA, 'set', 0));
  const after = (await gm.sb.from('money_awards').select('id', { count: 'exact', head: true }).eq('character_id', chA)).count;
  check('definir igual não cria concessão', before === after);
  await denied('valor zero', mon(gm, chA, 'add', 0));
  await denied('acima do limite', mon(gm, chA, 'add', 1000001));
  await denied('saldo negativo', mon(gm, chA, 'set', -1));
  await denied('modo inválido', mon(gm, chA, 'mult', 2));
  await ok('define 999999999', mon(gm, chA, 'set', 999999999));
  await ok('somar passa do teto e limita', mon(gm, chA, 'add', 1000)); check('teto 999.999.999', await money(a, chA) === 999999999);
  const bigAward = (await gm.sb.from('money_awards').select('amount,note').eq('character_id', chA).order('created_at', { ascending: false }).limit(5)).data;
  check('variação acima do limite da fila: fila no teto, nota com a variação real', bigAward.some(x => x.amount === 1000000 && /variação real: 999999999/.test(x.note)), JSON.stringify(bigAward));
  await ok('XP definido com variação enorme', rpc(gm, 'gm_adjust_xp', { p_table: T1, p_character: chA, p_mode: 'set', p_amount: 500000, p_note: '', p_request_id: rid() }));
  check('XP 500000 na ficha', await xp(a, chA) === 500000);
  const bigXp = (await gm.sb.from('xp_awards').select('amount,note').eq('character_id', chA).order('created_at', { ascending: false }).limit(1)).data[0];
  check('fila de XP no teto (10000) com a variação real na nota', bigXp.amount === 10000 && /variação real: 500000/.test(bigXp.note), JSON.stringify(bigXp));
  await ok('XP volta a 0', rpc(gm, 'gm_adjust_xp', { p_table: T1, p_character: chA, p_mode: 'set', p_amount: 0, p_note: '', p_request_id: rid() }));

  console.log('— XP exato —');
  await ok('XP +30', rpc(gm, 'gm_adjust_xp', { p_table: T1, p_character: chA, p_mode: 'add', p_amount: 30, p_note: '', p_request_id: rid() }));
  check('XP 30', await xp(a, chA) === 30);
  await ok('XP −50 limita em 0', rpc(gm, 'gm_adjust_xp', { p_table: T1, p_character: chA, p_mode: 'add', p_amount: -50, p_note: '', p_request_id: rid() }));
  check('XP 0', await xp(a, chA) === 0);
  await ok('XP definido em 42', rpc(gm, 'gm_adjust_xp', { p_table: T1, p_character: chA, p_mode: 'set', p_amount: 42, p_note: '', p_request_id: rid() }));
  check('XP 42', await xp(a, chA) === 42);
  const xa = (await gm.sb.from('xp_awards').select('amount,claimed_at').eq('character_id', chA).order('created_at', { ascending: false }).limit(1)).data[0];
  check('xp_awards recebe o delta efetivo e já vem recebido', xa.amount === 42 && xa.claimed_at);

  console.log('— compatibilidade com o rebase da ficha (useRewardSync/sheetRebase) —');
  await ok('A volta a 600', mon(gm, chA, 'set', 600));
  // O jogador tem a ficha aberta na revisão atual com edição local não salva; o mestre mexe em dinheiro e XP; o rebase tem de somar sem conflito.
  const scenarios = [['add', 200, 800], ['add', -100, 500], ['set', 50, 50], ['add', -9999, 0], ['set', 999999999, 999999999], ['set', 0, 0]];
  for (const [mode, amount, expected] of scenarios) {
    await ok('prepara A em 600', mon(gm, chA, 'set', 600));
    const base = await row(a, chA);
    const sheet = { character: { ...base.data, name: 'Aria (editada)' }, cloud: { id: chA, revision: base.revision, base: JSON.stringify(base.data) } };
    await ok(`mestre ${mode} ${amount}`, mon(gm, chA, mode, amount));
    const cloud = await row(a, chA);
    const rest = ({ xp: _x, money: _m, inventory: _i, ...o }) => o;
    check(`${mode} ${amount}: só xp/money/inventory mudaram na ficha`, sameSheet(rest(base.data), rest(cloud.data)));
    const fix = rebaseSheet(sheet, { id: chA, revision: cloud.revision, character: cloud.data }, { dirty: true });
    const want = expected - 600; // delta efetivo esperado (vem da ficha, não da fila)
    check(`${mode} ${amount}: rebase reconcilia (sem conflito)`, Boolean(fix));
    check(`${mode} ${amount}: dinheiro local+delta = ${expected}`, fix?.character.money === expected, JSON.stringify(fix?.character.money));
    check(`${mode} ${amount}: mantém a edição local`, fix?.character.name === 'Aria (editada)');
    check(`${mode} ${amount}: ganho reportado = ${want}`, fix?.gained.money === want, JSON.stringify(fix?.gained));
  }
  {
    // Salvamento do jogador em revisão antiga perde para o servidor (otimista) e o rebase resolve.
    await ok('prepara A', mon(gm, chA, 'set', 600));
    const base = await row(a, chA);
    await ok('mestre +40 enquanto o jogador edita', mon(gm, chA, 'add', 40));
    const stale = await a.sb.from('characters').update({ data: { ...base.data, name: 'Aria 2' } }).eq('id', chA).eq('revision', base.revision).select('revision');
    check('salvamento com revisão antiga não grava (conflito)', !stale.error && stale.data.length === 0);
    const cloud = await row(a, chA);
    const fix = rebaseSheet({ character: { ...base.data, name: 'Aria 2' }, cloud: { id: chA, revision: base.revision, base: JSON.stringify(base.data) } }, { id: chA, revision: cloud.revision, character: cloud.data }, { dirty: true });
    check('rebase após o conflito soma o +40', fix?.character.money === 640 && fix?.character.name === 'Aria 2');
    const saved = await a.sb.from('characters').update({ data: fix.character }).eq('id', chA).eq('revision', cloud.revision).select('revision');
    check('novo salvamento do jogador passa', saved.data?.length === 1 && await money(a, chA) === 640);
  }
  {
    // XP: mesma checagem
    await ok('XP A = 10', rpc(gm, 'gm_adjust_xp', { p_table: T1, p_character: chA, p_mode: 'set', p_amount: 10, p_note: '', p_request_id: rid() }));
    const base = await row(a, chA);
    await ok('mestre XP +15', rpc(gm, 'gm_adjust_xp', { p_table: T1, p_character: chA, p_mode: 'add', p_amount: 15, p_note: '', p_request_id: rid() }));
    const cloud = await row(a, chA);
    const fix = rebaseSheet({ character: { ...base.data, concept: 'editado' }, cloud: { id: chA, revision: base.revision, base: JSON.stringify(base.data) } }, { id: chA, revision: cloud.revision, character: cloud.data }, { dirty: true });
    check('rebase de XP soma 15 e mantém a edição', fix?.character.xp === 25 && fix?.character.concept === 'editado');
  }

  console.log('— itens: entrega com histórico —');
  let g = await ok('entrega 2 adagas', rpc(gm, 'gm_give_items', { p_table: T1, p_character: chB, p_id: ADAGA, p_custom: null, p_qty: 2, p_note: 'recompensa', p_request_id: rid() }));
  check('retorno antes/depois', g.data?.before?.qty === 0 && g.data?.after?.qty === 2 && g.data?.after?.item === ADAGA);
  g = await ok('entrega +1 adaga', rpc(gm, 'gm_give_items', { p_table: T1, p_character: chB, p_id: ADAGA, p_custom: null, p_qty: 1, p_note: '', p_request_id: rid() }));
  check('antes 2, depois 3', g.data?.before?.qty === 2 && g.data?.after?.qty === 3);
  check('mochila na ficha: 3', (await row(b, chB)).data.inventory.find(e => e.id === ADAGA)?.qty === 3);
  g = await ok('entrega item customizado', rpc(gm, 'gm_give_items', { p_table: T1, p_character: chB, p_id: null, p_custom: { name: 'Anel do Teste', weight: 0.1, effects: [{ kind: 'attribute', target: 'Força', bonus: 1 }], description: 'brilha' }, p_qty: 1, p_note: '', p_request_id: rid() }));
  check('customizado: nome no histórico e quantidade 1', g.data?.after?.name === 'Anel do Teste' && g.data?.after?.qty === 1 && /^custom-/.test(g.data?.after?.item || ''));
  await denied('quantidade 0', rpc(gm, 'gm_give_items', { p_table: T1, p_character: chB, p_id: ADAGA, p_custom: null, p_qty: 0, p_note: '', p_request_id: rid() }));
  await denied('item inválido', rpc(gm, 'gm_give_items', { p_table: T1, p_character: chB, p_id: 'Item Ruim!', p_custom: null, p_qty: 1, p_note: '', p_request_id: rid() }));
  await denied('personagem de outra mesa', rpc(gm, 'gm_give_items', { p_table: T1, p_character: chC, p_id: ADAGA, p_custom: null, p_qty: 1, p_note: '', p_request_id: rid() }), /não está vinculado/);
  check('falhas não deixaram histórico', (await audit(gm, T1, chB, 'item')).length === 3);

  console.log('— moedas e carteiras —');
  const cur = (u, name, id = null, t = T1, req = rid()) => rpc(u, 'gm_upsert_currency', { p_table: t, p_id: id, p_name: name, p_symbol: 'G', p_description: 'Moeda de ouro', p_rate: 10, p_request_id: req });
  let cr = await ok('cria Ouro', cur(gm, 'Ouro'));
  const gold = cr.data?.id;
  check('moeda criada', Boolean(gold));
  await denied('nome repetido (sem diferenciar maiúsculas)', cur(gm, 'ouro'), /já existe/i);
  cr = await ok('cria Prata', cur(gm, 'Prata')); const silver = cr.data?.id;
  const otherCur = (await cur(c, 'Moeda de C', null, T2)).data?.id;
  check('mestre de outra mesa cria a própria moeda', Boolean(otherCur));
  await ok('edita a moeda', cur(gm, 'Ouro Real', gold));
  check('membros leem as definições', ((await a.sb.from('table_currencies').select('id').eq('table_id', T1)).data || []).length === 2);
  check('estranho não lê as moedas de T1', ((await c.sb.from('table_currencies').select('id').eq('table_id', T1)).data || []).length === 0);
  const wal = (u, ch, cu, mode, amount, req = rid(), t = T1) => rpc(u, 'gm_wallet_adjust', { p_table: t, p_character: ch, p_currency: cu, p_mode: mode, p_amount: amount, p_note: '', p_request_id: req });
  r = await ok('A ganha 25 de Ouro', wal(gm, chA, gold, 'add', 25));
  check('antes 0, depois 25', r.data?.before?.amount === 0 && r.data?.after?.amount === 25);
  await ok('A: define 7 de Prata', wal(gm, chA, silver, 'set', 7));
  await ok('B ganha 3 de Ouro', wal(gm, chB, gold, 'add', 3));
  await ok('retira além do saldo limita em 0', wal(gm, chB, gold, 'add', -50));
  check('B = 0', ((await gm.sb.from('character_wallets').select('amount').eq('character_id', chB).eq('currency_id', gold).single()).data || {}).amount === 0);
  await denied('moeda de outra mesa não vale em T1', wal(gm, chA, otherCur, 'add', 1), /Moeda não encontrada/);
  await denied('jogador não mexe na carteira', wal(a, chA, gold, 'add', 1), /Apenas o mestre/);
  check('A lê a própria carteira (2 linhas)', ((await a.sb.from('character_wallets').select('amount').eq('character_id', chA)).data || []).length === 2);
  check('A NÃO lê a carteira de B', ((await a.sb.from('character_wallets').select('amount').eq('character_id', chB)).data || []).length === 0);
  check('mestre lê todas', ((await gm.sb.from('character_wallets').select('amount').eq('table_id', T1)).data || []).length === 3);
  check('estranho não lê carteiras', ((await c.sb.from('character_wallets').select('amount').eq('table_id', T1)).data || []).length === 0);
  const direct = await a.sb.from('character_wallets').insert({ table_id: T1, character_id: chA, currency_id: gold, amount: 999 });
  check('escrita direta na carteira é negada (RLS)', Boolean(direct.error));
  const fk = sqlTry(`insert into public.character_wallets (table_id, character_id, currency_id, amount) values ('${T1}', '${chA}', '${otherCur}', 1)`);
  check('FK composta recusa moeda de outra mesa', /foreign key/i.test(fk) && !/^OK/.test(fk), fk.slice(0, 160));
  await denied('apagar moeda com saldo exige confirmação', rpc(gm, 'gm_delete_currency', { p_table: T1, p_id: gold, p_force: false, p_request_id: rid() }), /carteira/);
  r = await ok('apaga moeda com force', rpc(gm, 'gm_delete_currency', { p_table: T1, p_id: gold, p_force: true, p_request_id: rid() }));
  check('histórico guarda os saldos apagados', (r.data?.before?.wallets || []).some(w => w.character_id === chA && w.amount === 25));
  check('carteiras da moeda sumiram em cascata', ((await gm.sb.from('character_wallets').select('amount').eq('currency_id', gold)).data || []).length === 0);

  console.log('— tipos de experiência e contadores —');
  const ety = (u, name, id = null, t = T1) => rpc(u, 'gm_upsert_experience_type', { p_table: t, p_id: id, p_name: name, p_description: 'd', p_icon: '⚔', p_category: 'combate', p_request_id: rid() });
  const rep = (await ok('cria Reputação', ety(gm, 'Reputação'))).data?.id;
  await denied('nome repetido', ety(gm, 'reputação'), /já existe/i);
  const exp = (u, ch, ty, mode, amount, req = rid(), t = T1) => rpc(u, 'gm_experience_adjust', { p_table: t, p_character: ch, p_type: ty, p_mode: mode, p_amount: amount, p_note: '', p_request_id: req });
  r = await ok('A +15 de Reputação', exp(gm, chA, rep, 'add', 15)); check('antes 0, depois 15', r.data?.before?.amount === 0 && r.data?.after?.amount === 15);
  await ok('A −100 limita em 0', exp(gm, chA, rep, 'add', -100));
  await ok('A define 9', exp(gm, chA, rep, 'set', 9));
  check('A lê o próprio contador = 9', ((await a.sb.from('character_experience').select('amount').eq('character_id', chA)).data || [])[0]?.amount === 9);
  check('B (membro da mesa) lê o contador de A: experiências são públicas como o XP', ((await b.sb.from('character_experience').select('amount').eq('character_id', chA)).data || [])[0]?.amount === 9);
  check('estranho (outra mesa) não lê os contadores', ((await c.sb.from('character_experience').select('amount').eq('character_id', chA)).data || []).length === 0);
  check('escrita direta no contador negada (RLS)', Boolean((await b.sb.from('character_experience').update({ amount: 999 }).eq('character_id', chA).select()).error) || ((await gm.sb.from('character_experience').select('amount').eq('character_id', chA)).data || [])[0]?.amount === 9);
  check('XP de evolução de A não mudou com o contador', await xp(a, chA) === 25);
  await denied('jogador não mexe no contador', exp(a, chA, rep, 'add', 1), /Apenas o mestre/);
  await denied('tipo de outra mesa', exp(gm, chA, (await ety(c, 'Fama', null, T2)).data?.id, 'add', 1), /não encontrado nesta mesa/);
  await denied('apagar tipo com valor exige confirmação', rpc(gm, 'gm_delete_experience_type', { p_table: T1, p_id: rep, p_force: false, p_request_id: rid() }), /personagem/);
  await ok('apaga tipo com force', rpc(gm, 'gm_delete_experience_type', { p_table: T1, p_id: rep, p_force: true, p_request_id: rid() }));
  check('contadores sumiram em cascata', ((await gm.sb.from('character_experience').select('amount').eq('type_id', rep)).data || []).length === 0);

  console.log('— condições e o gatilho que as preserva —');
  const cond = (u, ch, list, req = rid()) => rpc(u, 'gm_set_conditions', { p_table: T1, p_character: ch, p_conditions: list, p_note: '', p_request_id: req });
  r = await ok('aplica Atordoado e Cego', cond(gm, chA, [{ id: 'stun', label: 'Atordoado', icon: '💫', duration: '3 rodadas' }, { label: 'Cego', note: 'sem visão' }, { label: 'cego' }]));
  const set = (await stateOf(a, T1, chA))?.conditions || [];
  check('2 condições (duplicata ignorada), com duração e nota', set.length === 2 && set[0].duration === '3 rodadas' && set[1].note === 'sem visão', JSON.stringify(set));
  check('resumo do histórico', /Aplicou: Atordoado, Cego/.test(r.data?.summary || ''), r.data?.summary);
  const stateRowsB = await b.sb.from('table_character_state').select('state').eq('character_id', chA);
  check('outro jogador lê as condições (públicas)', (stateRowsB.data?.[0]?.state?.conditions || []).length === 2);
  const keep = async (name, p) => { await p; check(name, JSON.stringify((await stateOf(gm, T1, chA)).conditions) === JSON.stringify(set)); };
  await keep('dono sobrescreve o estado sem conditions → preservadas', a.sb.from('table_character_state').upsert({ table_id: T1, character_id: chA, state: { life: 5, stamina: 5, mana: 5 } }, { onConflict: 'table_id,character_id' }));
  await keep('dono tenta forjar conditions → ignorado', a.sb.from('table_character_state').upsert({ table_id: T1, character_id: chA, state: { life: 4, stamina: 5, mana: 5, conditions: [{ id: 'f', label: 'Falsa', icon: 'x' }] } }, { onConflict: 'table_id,character_id' }));
  await keep('dono tenta apagar com conditions vazias → ignorado', a.sb.from('table_character_state').upsert({ table_id: T1, character_id: chA, state: { life: 4, stamina: 5, mana: 5, conditions: [] } }, { onConflict: 'table_id,character_id' }));
  await keep('mestre grava como o PartyPanel (sem conditions) → preservadas', gm.sb.from('table_character_state').upsert({ table_id: T1, character_id: chA, state: { life: 3, stamina: 5, mana: 5, faint: { hours: 1, fainted: false } } }, { onConflict: 'table_id,character_id' }));
  await keep('UPDATE estilo advance_time (stamina/mana) → preservadas', a.sb.from('table_character_state').update({ state: { life: 3, stamina: 2, mana: 2 } }).eq('table_id', T1).eq('character_id', chA));
  check('os valores de vida/stamina das escritas diretas valeram', (await stateOf(gm, T1, chA)).stamina === 2);
  r = await ok('remove Cego', cond(gm, chA, [set[0]]));
  check('Cego saiu; Atordoado ficou', ((await stateOf(a, T1, chA)).conditions || []).map(x => x.label).join() === 'Atordoado' && /Removeu: Cego/.test(r.data?.summary || ''));
  await ok('limpa tudo', cond(gm, chA, []));
  check('lista vazia', ((await stateOf(a, T1, chA)).conditions || []).length === 0);
  const many = Array.from({ length: 12 }, (_, i) => ({ label: `C${i}` }));
  await ok('mais de 8 → corta em 8', cond(gm, chA, many)); check('8 condições', ((await stateOf(a, T1, chA)).conditions || []).length === 8);
  await denied('lista inválida', cond(gm, chA, 'x'));
  await denied('condição em personagem de outra mesa', cond(gm, chC, [{ label: 'X' }]), /não está vinculado/);
  await ok('limpa', cond(gm, chA, []));
  const fresh = await ok('condição em personagem sem estado salvo (B)', cond(gm, chB, [{ label: 'Abençoado' }]));
  check('estado criado só com conditions', (await stateOf(b, T1, chB)).conditions?.[0]?.label === 'Abençoado' && fresh.data?.before?.conditions?.length === 0);

  console.log('— idempotência (reenvio, timeout, paralelo) —');
  const req1 = rid();
  const m0 = await money(b, chB);
  const first = await ok('1ª chamada', mon(gm, chB, 'add', 70, req1));
  const second = await ok('reenvio com o mesmo request_id', mon(gm, chB, 'add', 70, req1));
  check('segunda devolveu o mesmo resultado, replayed=true', second.data?.replayed === true && second.data?.after?.money === first.data?.after?.money && first.data?.replayed === false);
  check('dinheiro aplicado UMA vez', await money(b, chB) === m0 + 70);
  check('um só registro no histórico', (await gm.sb.from('master_audit_log').select('id').eq('request_id', req1)).data.length === 1);
  const par = rid();
  const parRes = await Promise.all(Array.from({ length: 8 }, () => mon(gm, chB, 'add', 11, par)));
  check('8 chamadas paralelas com o mesmo id sem erro', parRes.every(x => !x.error), JSON.stringify(parRes.find(x => x.error)?.error));
  check('exatamente uma aplicada e sete repetidas', parRes.filter(x => x.data?.replayed === false).length === 1 && parRes.filter(x => x.data?.replayed === true).length === 7);
  check('dinheiro +11 uma vez só', await money(b, chB) === m0 + 70 + 11);
  await denied('mesmo id em outra categoria', rpc(gm, 'gm_adjust_xp', { p_table: T1, p_character: chB, p_mode: 'add', p_amount: 1, p_note: '', p_request_id: par }), /já foi usado/);
  const sharedReq = rid();
  await ok('mesmo id em outro personagem é outra operação', mon(gm, chA, 'add', 1, sharedReq));
  await ok('… e vale para B também', mon(gm, chB, 'add', 1, sharedReq));
  const ireq = rid(); const arg = { p_table: T1, p_character: chB, p_id: ADAGA, p_custom: null, p_qty: 1, p_note: '', p_request_id: ireq };
  const qBefore = (await row(b, chB)).data.inventory.find(e => e.id === ADAGA).qty;
  await ok('item: 1ª', rpc(gm, 'gm_give_items', arg)); await ok('item: reenvio', rpc(gm, 'gm_give_items', arg));
  check('item entregue uma vez', (await row(b, chB)).data.inventory.find(e => e.id === ADAGA).qty === qBefore + 1);

  console.log('— concorrência —');
  await ok('A = 1000', mon(gm, chA, 'set', 1000));
  const log0 = (await audit(gm, T1, chA, 'money')).length;
  const adds = await Promise.all(Array.from({ length: 20 }, () => mon(gm, chA, 'add', 10)));
  check('20 somas simultâneas sem erro', adds.every(x => !x.error), JSON.stringify(adds.find(x => x.error)?.error));
  check('total exato = 1200', await money(a, chA) === 1200);
  const rows = (await audit(gm, T1, chA, 'money')).slice(log0);
  const befores = rows.map(x => x.before.money).sort((x, y) => x - y), afters = rows.map(x => x.after.money).sort((x, y) => x - y);
  check('cadeia do histórico consistente (cada depois = antes de outra)', befores.join() === Array.from({ length: 20 }, (_, i) => 1000 + i * 10).join() && afters.join() === Array.from({ length: 20 }, (_, i) => 1010 + i * 10).join(), `${befores}|${afters}`);
  // set vs add
  await ok('A = 100', mon(gm, chA, 'set', 100));
  const sa = await Promise.all([mon(gm, chA, 'set', 500), mon(gm, chA, 'add', 7)]);
  const finalM = await money(a, chA);
  const [sx, ax] = [sa[0].data, sa[1].data];
  check('set × add: antes/depois encadeados', (sx.after.money === 500 && ax.before.money === 500 && ax.after.money === 507) || (ax.before.money === 100 && ax.after.money === 107 && sx.before.money === 107 && sx.after.money === 500), JSON.stringify([sx, ax]));
  // mistura no mesmo personagem
  const m1 = await money(a, chA), x1 = await xp(a, chA);
  const goldAgain = (await cur(gm, 'Cobre')).data?.id, repAgain = (await ety(gm, 'Maestria')).data?.id;
  const mix = await Promise.all([
    mon(gm, chA, 'add', 5), rpc(gm, 'gm_adjust_xp', { p_table: T1, p_character: chA, p_mode: 'add', p_amount: 9, p_note: '', p_request_id: rid() }),
    rpc(gm, 'gm_give_items', { p_table: T1, p_character: chA, p_id: ADAGA, p_custom: null, p_qty: 2, p_note: '', p_request_id: rid() }),
    cond(gm, chA, [{ label: 'Confuso' }]), wal(gm, chA, goldAgain, 'add', 11), exp(gm, chA, repAgain, 'add', 13),
    mon(gm, chA, 'add', 5), rpc(gm, 'gm_adjust_xp', { p_table: T1, p_character: chA, p_mode: 'add', p_amount: 9, p_note: '', p_request_id: rid() }),
  ]);
  check('mistura simultânea sem erro', mix.every(x => !x.error), JSON.stringify(mix.find(x => x.error)?.error));
  const cA = await row(a, chA);
  check('nada se perdeu: dinheiro, XP, item, condição, carteira e contador', cA.data.money === m1 + 10 && cA.data.xp === x1 + 18 && cA.data.inventory.find(e => e.id === ADAGA)?.qty === 2
    && (await stateOf(a, T1, chA)).conditions?.[0]?.label === 'Confuso'
    && ((await a.sb.from('character_wallets').select('amount').eq('currency_id', goldAgain).single()).data || {}).amount === 11
    && ((await a.sb.from('character_experience').select('amount').eq('type_id', repAgain).single()).data || {}).amount === 13, JSON.stringify(cA.data.inventory));
  // ordem oposta, vários personagens (sem deadlock)
  const cross = await Promise.all([
    ...Array.from({ length: 6 }, (_, i) => mon(gm, i % 2 ? chA : chB, 'add', 1)),
    ...Array.from({ length: 6 }, (_, i) => mon(gm, i % 2 ? chB : chA, 'add', 1)),
    a.sb.rpc('inventory_transfer', { p_table: T1, p_from: chA, p_to: chB, p_id: ADAGA, p_qty: 1, p_index: null }),
    b.sb.rpc('inventory_transfer', { p_table: T1, p_from: chB, p_to: chA, p_id: ADAGA, p_qty: 1, p_index: null }),
  ]);
  check('ordens opostas sem deadlock', cross.every(x => !x.error || !/deadlock/i.test(x.error.message)), JSON.stringify(cross.find(x => x.error)?.error));
  // jogador salva a ficha enquanto o mestre ajusta: 10 rodadas, o valor do mestre nunca se perde
  let lost = 0;
  for (let i = 0; i < 5; i++) {
    const base = await row(a, chA);
    const [save, adj] = await Promise.all([
      a.sb.from('characters').update({ data: { ...base.data, concept: `rodada ${i}` } }).eq('id', chA).eq('revision', base.revision).select('revision'),
      mon(gm, chA, 'add', 3),
    ]);
    const now = await row(a, chA);
    if (now.data.money !== base.data.money + 3) lost += 1;
    check(`rodada ${i}: sem erro`, !save.error && !adj.error);
  }
  check('o ajuste do mestre nunca se perdeu para o salvamento da ficha', lost === 0, `perdidos: ${lost}`);

  console.log('— Loja do Mestre —');
  const coin = (await cur(gm, 'Cobre Loja')).data?.id;
  const item = { name: 'Anel da Sorte', weight: 0.1, effects: [{ kind: 'attribute', target: 'Força', bonus: 1 }], description: 'brilha' };
  const up = (u, extra = {}) => rpc(u, 'gm_shop_upsert', { p_table: T1, p_id: null, p_custom: item, p_currency: coin, p_price: 10, p_active: true, p_request_id: rid(), ...extra });
  await denied('jogador não coloca item à venda', up(a), /Apenas o mestre/);
  await denied('preço zero', up(gm, { p_price: 0 }), /preço/);
  await denied('moeda de outra mesa', up(gm, { p_currency: otherCur }), /moeda desta mesa/);
  await denied('item sem nome', up(gm, { p_custom: { name: '  ' } }), /nome/);
  await denied('sem item', up(gm, { p_custom: null }), /inválido/);
  r = await ok('mestre põe o anel à venda', up(gm));
  const L1 = r.data?.id;
  check('anúncio criado, com moeda e preço no histórico', Boolean(L1) && r.data?.after?.price === 10 && r.data?.after?.symbol === 'G' && r.data?.kind === 'shop_create', JSON.stringify(r.data));
  const L2 = (await ok('item pausado', up(gm, { p_active: false, p_custom: { ...item, name: 'Poção Secreta' } }))).data?.id;
  check('jogador lê só os anúncios ativos', ((await a.sb.from('table_shop_items').select('id').eq('table_id', T1)).data || []).map(x => x.id).join() === L1);
  check('mestre lê todos', ((await gm.sb.from('table_shop_items').select('id').eq('table_id', T1)).data || []).length === 2);
  check('estranho não lê a loja', ((await c.sb.from('table_shop_items').select('id').eq('table_id', T1)).data || []).length === 0);
  check('escrita direta na loja negada (RLS)', Boolean((await a.sb.from('table_shop_items').insert({ table_id: T1, currency_id: coin, price: 1, name: 'x' })).error));
  const buy = (u, ch, listing, qty = 1, req = rid()) => rpc(u, 'shop_buy', { p_table: T1, p_character: ch, p_listing: listing, p_qty: qty, p_request_id: req });
  const bal = async (ch = chA) => ((await gm.sb.from('character_wallets').select('amount').eq('character_id', ch).eq('currency_id', coin).maybeSingle()).data || {}).amount ?? 0;
  const owned = async () => (await row(a, chA)).data.inventory.find(e => e.id === `custom-${L1}`);
  await ok('A recebe 25 de Cobre Loja', wal(gm, chA, coin, 'set', 25));
  await denied('B não compra para o personagem de A', buy(b, chA, L1), /próprio personagem/);
  await denied('estranho não compra', buy(c, chA, L1), /próprio personagem/);
  await denied('item pausado não se compra', buy(a, chA, L2), /não está mais à venda/);
  await denied('quantidade 0', buy(a, chA, L1, 0), /quantidade/);
  await denied('quantidade 100', buy(a, chA, L1, 100), /quantidade/);
  await denied('anúncio inexistente', buy(a, chA, rid()), /não está mais à venda/);
  check('tentativas negadas não cobraram nada', await bal() === 25 && !(await owned()));
  const rq = rid();
  r = await ok('A compra o anel', buy(a, chA, L1, 1, rq));
  check('carteira 25 → 15 e retorno antes/depois do servidor', await bal() === 15 && r.data?.before?.wallet === 25 && r.data?.after?.wallet === 15 && r.data?.after?.qty === 1 && r.data?.replayed === false);
  const ring = await owned();
  check('item na mochila como custom do anúncio (nome, peso, efeito, descrição)', ring?.qty === 1 && ring.custom?.name === 'Anel da Sorte' && ring.custom?.effects?.[0]?.bonus === 1 && ring.custom?.description === 'brilha');
  r = await ok('reenvio com o mesmo request_id', buy(a, chA, L1, 1, rq));
  check('reenvio devolve o resultado sem cobrar de novo', r.data?.replayed === true && await bal() === 15 && (await owned()).qty === 1);
  await ok('segunda compra empilha', buy(a, chA, L1));
  check('carteira 5 e quantidade 2', await bal() === 5 && (await owned()).qty === 2);
  await denied('saldo insuficiente', buy(a, chA, L1), /Saldo insuficiente/);
  check('compra recusada não mudou nada', await bal() === 5 && (await owned()).qty === 2);
  await ok('A: saldo 50', wal(gm, chA, coin, 'set', 50));
  const race = await Promise.all(Array.from({ length: 10 }, () => buy(a, chA, L1)));
  check('10 compras simultâneas com saldo para 5: exatamente 5 passam', race.filter(x => !x.error).length === 5 && race.filter(x => x.error && /Saldo insuficiente/.test(x.error.message)).length === 5, JSON.stringify(race.map(x => x.error?.message)));
  check('saldo zerado e 5 itens a mais (nunca gasta além do saldo)', await bal() === 0 && (await owned()).qty === 7);
  await ok('A: saldo 100', wal(gm, chA, coin, 'set', 100));
  const sameId = rid();
  const dup = await Promise.all(Array.from({ length: 6 }, () => buy(a, chA, L1, 1, sameId)));
  check('6 cliques com o mesmo request_id: uma cobrança só', dup.every(x => !x.error) && dup.filter(x => x.data?.replayed === false).length === 1 && await bal() === 90 && (await owned()).qty === 8);
  await denied('mesmo id em outra operação', rpc(gm, 'gm_adjust_money', { p_table: T1, p_character: chA, p_mode: 'add', p_amount: 1, p_note: '', p_request_id: sameId }), /já foi usado/);
  r = await ok('mestre muda o preço e pausa', up(gm, { p_id: L1, p_custom: null, p_price: 20, p_active: false }));
  check('edição mantém o item e registra antes/depois', r.data?.kind === 'shop_update' && r.data?.before?.price === 10 && r.data?.after?.price === 20 && r.data?.after?.active === false && r.data?.after?.name === 'Anel da Sorte', JSON.stringify(r.data));
  await denied('pausado: ninguém compra', buy(a, chA, L1), /não está mais à venda/);
  await ok('reativa', up(gm, { p_id: L1, p_custom: null, p_price: 20, p_active: true }));
  await ok('compra pelo novo preço', buy(a, chA, L1)); check('90 − 20 = 70', await bal() === 70);
  const fkDel = await rpc(gm, 'gm_delete_currency', { p_table: T1, p_id: coin, p_force: true, p_request_id: rid() });
  check('não apaga a moeda enquanto houver item à venda nela', Boolean(fkDel.error), JSON.stringify(fkDel.data));
  await denied('jogador não remove anúncio', rpc(a, 'gm_shop_delete', { p_table: T1, p_id: L1, p_request_id: rid() }), /Apenas o mestre/);
  await ok('mestre remove o anúncio', rpc(gm, 'gm_shop_delete', { p_table: T1, p_id: L1, p_request_id: rid() }));
  check('o item já comprado continua na mochila', (await owned())?.qty === 9);
  await ok('mestre remove também o pausado', rpc(gm, 'gm_shop_delete', { p_table: T1, p_id: L2, p_request_id: rid() }));
  await ok('agora a moeda pode ser apagada', rpc(gm, 'gm_delete_currency', { p_table: T1, p_id: coin, p_force: true, p_request_id: rid() }));
  const shopLog = (await gm.sb.from('master_audit_log').select('kind,actor_id,character_id,summary').eq('table_id', T1).like('kind', 'shop_%')).data || [];
  check('histórico: criação, edição, compras e remoção (o comprador aparece como responsável da compra)', ['shop_create', 'shop_update', 'shop_buy', 'shop_delete'].every(k => shopLog.some(x => x.kind === k)) && shopLog.filter(x => x.kind === 'shop_buy').every(x => x.actor_id === a.id && x.character_id === chA), JSON.stringify(shopLog.slice(0, 3)));
  check('jogador não lê o histórico da loja', ((await a.sb.from('master_audit_log').select('id').eq('table_id', T1).like('kind', 'shop_%')).data || []).length === 0);

  console.log('— Loja do Mestre: preço em dinheiro ($) —');
  const moneyA = async () => (await row(a, chA)).data.money;
  const upMoney = (extra = {}) => up(gm, { p_currency: null, p_price: 10, p_custom: { ...item, name: 'Mapa Antigo' }, ...extra });
  await denied('jogador não põe item à venda em $', up(a, { p_currency: null }), /Apenas o mestre/);
  await denied('preço zero em $', upMoney({ p_price: 0 }), /preço/);
  r = await ok('mestre põe o mapa à venda em $ (sem moeda)', upMoney());
  const M1 = r.data?.id;
  check('anúncio em $: currency_id nulo e histórico com símbolo $', Boolean(M1) && r.data?.after?.symbol === '$' && r.data?.after?.currency_name === 'Dinheiro' && r.data?.after?.currency === null, JSON.stringify(r.data));
  check('o jogador lê o anúncio em $', ((await a.sb.from('table_shop_items').select('id,currency_id').eq('id', M1)).data || []).length === 1);
  await denied('moeda de outra mesa continua recusada', up(gm, { p_currency: otherCur }), /moeda desta mesa/);
  const buyM = (u, ch, qty = 1, req = rid()) => rpc(u, 'shop_buy', { p_table: T1, p_character: ch, p_listing: M1, p_qty: qty, p_request_id: req });
  const awards = async () => ((await gm.sb.from('money_awards').select('amount,note,claimed_at').eq('character_id', chA).like('note', 'Loja do Mestre%')).data || []);
  await ok('A: dinheiro 25', mon(gm, chA, 'set', 25));
  await denied('B não compra em $ para A', buyM(b, chA), /próprio personagem/);
  check('tentativa negada não cobrou', await moneyA() === 25);
  const rqM = rid();
  r = await ok('A compra o mapa com $', buyM(a, chA, 1, rqM));
  check('dinheiro 25 → 15, retorno antes/depois do servidor e item na mochila', await moneyA() === 15 && r.data?.before?.wallet === 25 && r.data?.after?.wallet === 15 && r.data?.after?.symbol === '$' && r.data?.replayed === false);
  const awM = await awards();
  check('compra em $ grava a linha em money_awards (negativa, já resgatada) como o grant_money', awM.length === 1 && awM[0].amount === -10 && Boolean(awM[0].claimed_at), JSON.stringify(awM));
  check('o mapa foi para a mochila', (await row(a, chA)).data.inventory.some(e => e.id === `custom-${M1}` && e.qty === 1));
  r = await ok('reenvio com o mesmo request_id', buyM(a, chA, 1, rqM));
  check('reenvio em $ não cobra de novo', r.data?.replayed === true && await moneyA() === 15 && (await awards()).length === 1);
  await denied('saldo em $ insuficiente', buyM(a, chA, 2), /Saldo insuficiente: você tem 15 \$/);
  check('compra recusada em $ não mudou nada', await moneyA() === 15);
  await ok('A: dinheiro 25', mon(gm, chA, 'set', 25));
  const raceM = await Promise.all(Array.from({ length: 10 }, () => buyM(a, chA)));
  check('10 compras simultâneas em $ com dinheiro para 2: exatamente 2 passam', raceM.filter(x => !x.error).length === 2 && raceM.filter(x => x.error && /Saldo insuficiente/.test(x.error.message)).length === 8, JSON.stringify(raceM.map(x => x.error?.message)));
  check('dinheiro 5 (nunca fica negativo) e 3 mapas na mochila', await moneyA() === 5 && (await row(a, chA)).data.inventory.find(e => e.id === `custom-${M1}`)?.qty === 3);
  // compra simultânea com ajuste do mestre: o dinheiro nunca se perde nem fica negativo
  await ok('A: dinheiro 100', mon(gm, chA, 'set', 100));
  const mixM = await Promise.all([buyM(a, chA), mon(gm, chA, 'add', 7), buyM(a, chA), mon(gm, chA, 'add', 3)]);
  check('compras e ajustes simultâneos: 100 − 20 + 10 = 90', mixM.every(x => !x.error) && await moneyA() === 90, JSON.stringify(mixM.map(x => x.error?.message)));
  // edição troca entre $ e moeda da mesa
  const coin2 = (await cur(gm, 'Prata Loja')).data?.id;
  r = await ok('mestre passa o anúncio de $ para a moeda Prata', rpc(gm, 'gm_shop_upsert', { p_table: T1, p_id: M1, p_custom: null, p_currency: coin2, p_price: 4, p_active: true, p_request_id: rid() }));
  check('histórico da edição: antes em $ → depois em moeda', r.data?.before?.symbol === '$' && r.data?.after?.currency_name === 'Prata Loja', JSON.stringify(r.data));
  await denied('agora o anúncio cobra a moeda (sem saldo)', buyM(a, chA), /Saldo insuficiente/);
  check('o dinheiro $ não foi tocado ao falhar a compra em moeda', await moneyA() === 90);
  r = await ok('mestre volta o anúncio para $', rpc(gm, 'gm_shop_upsert', { p_table: T1, p_id: M1, p_custom: null, p_currency: null, p_price: 15, p_active: true, p_request_id: rid() }));
  check('volta para $ (currency_id nulo)', ((await gm.sb.from('table_shop_items').select('currency_id').eq('id', M1).single()).data || {}).currency_id === null);
  await ok('compra pelo novo preço em $', buyM(a, chA)); check('90 − 15 = 75', await moneyA() === 75);
  await ok('mestre remove o anúncio em $', rpc(gm, 'gm_shop_delete', { p_table: T1, p_id: M1, p_request_id: rid() }));
  await ok('apaga a moeda Prata (sem anúncio nela)', rpc(gm, 'gm_delete_currency', { p_table: T1, p_id: coin2, p_force: true, p_request_id: rid() }));

  console.log('— Loja aprovada (0044): todo item aprovado entra na loja —');
  const submit = (u, ch, name) => u.sb.from('table_custom_items').insert({ table_id: T1, character_id: ch, name, weight: 1, effects: [], description: 'item de jogador' }).select('id').single();
  const listing = async id => (await gm.sb.from('table_shop_items').select('*').eq('id', id).maybeSingle()).data;
  const approve = (id, price) => rpc(gm, 'approve_custom_item', { p_id: id, p_price: price, p_note: '' });
  const buyAp = (u, ch, id, qty = 1, req = rid()) => rpc(u, 'shop_buy', { p_table: T1, p_character: ch, p_listing: id, p_qty: qty, p_request_id: req });
  await ok('B: dinheiro 100 (para pagar a aprovação)', mon(gm, chB, 'set', 100));
  r = await submit(b, chB, 'Amuleto Aprovado'); const AP1 = r.data?.id;
  check('B envia o pedido', Boolean(AP1), r.error?.message);
  check('pedido pendente NÃO vira anúncio', !(await listing(AP1)));
  await ok('mestre aprova por $ 12', approve(AP1, 12));
  let l1 = await listing(AP1);
  check('aprovado vira anúncio em $ com o mesmo id, o preço da aprovação e origem no pedido', Boolean(l1) && l1.currency_id === null && l1.price === 12 && l1.source_id === AP1 && l1.active && l1.name === 'Amuleto Aprovado', JSON.stringify(l1));
  check('outro jogador (A) lê o anúncio aprovado', ((await a.sb.from('table_shop_items').select('id,source_id').eq('id', AP1)).data || []).length === 1);
  check('estranho (fora da mesa) não lê', ((await c.sb.from('table_shop_items').select('id').eq('id', AP1)).data || []).length === 0);
  await ok('A: dinheiro 50', mon(gm, chA, 'set', 50));
  await denied('B não compra para A', buyAp(b, chA, AP1), /próprio personagem/);
  r = await ok('A compra o item aprovado', buyAp(a, chA, AP1));
  check('A pagou 12 ($ 50 → 38) e recebeu custom-<id do pedido>', await moneyA() === 38 && (await row(a, chA)).data.inventory.some(e => e.id === `custom-${AP1}` && e.qty === 1 && e.custom?.name === 'Amuleto Aprovado'), JSON.stringify(r.data));
  check('o mesmo item de B (id igual) fica intacto', (await row(b, chB)).data.money <= 100);
  await ok('mestre pausa o anúncio aprovado', rpc(gm, 'gm_shop_upsert', { p_table: T1, p_id: AP1, p_custom: null, p_currency: null, p_price: 12, p_active: false, p_request_id: rid() }));
  check('pausado: o jogador não lê mais', ((await a.sb.from('table_shop_items').select('id').eq('id', AP1)).data || []).length === 0);
  await denied('pausado: não dá para comprar', buyAp(a, chA, AP1), /não está mais à venda/);
  await ok('mestre reativa', rpc(gm, 'gm_shop_upsert', { p_table: T1, p_id: AP1, p_custom: null, p_currency: null, p_price: 12, p_active: true, p_request_id: rid() }));
  // grátis (preço 0): só para item aprovado
  r = await submit(b, chB, 'Pedra Grátis'); const AP0 = r.data?.id;
  await ok('mestre aprova por $ 0', approve(AP0, 0));
  const l0 = await listing(AP0);
  check('preço 0 vira anúncio grátis', Boolean(l0) && l0.price === 0 && l0.source_id === AP0, JSON.stringify(l0));
  const moneyBefore = await moneyA();
  r = await ok('A compra grátis (2 unidades)', buyAp(a, chA, AP0, 2));
  check('grátis: dinheiro não muda, entra na mochila e não grava money_awards', await moneyA() === moneyBefore && (await row(a, chA)).data.inventory.find(e => e.id === `custom-${AP0}`)?.qty === 2
    && ((await gm.sb.from('money_awards').select('id').eq('character_id', chA).like('note', '%Pedra Grátis%')).data || []).length === 0, JSON.stringify(r.data));
  await ok('preço 0 aceito ao editar anúncio aprovado', rpc(gm, 'gm_shop_upsert', { p_table: T1, p_id: AP0, p_custom: null, p_currency: null, p_price: 5, p_active: true, p_request_id: rid() }));
  await ok('...e ao voltar para grátis', rpc(gm, 'gm_shop_upsert', { p_table: T1, p_id: AP0, p_custom: null, p_currency: null, p_price: 0, p_active: true, p_request_id: rid() }));
  const manual = (await up(gm, { p_currency: null, p_price: 3, p_custom: { ...item, name: 'Item do Mestre 0044' } })).data?.id;
  await denied('item do mestre continua sem preço 0 ao editar', rpc(gm, 'gm_shop_upsert', { p_table: T1, p_id: manual, p_custom: null, p_currency: null, p_price: 0, p_active: true, p_request_id: rid() }), /preço/);
  check('o anúncio do mestre não tem origem (source_id nulo)', (await listing(manual))?.source_id === null);
  const zeroManual = sqlTry(`insert into public.table_shop_items (table_id, currency_id, price, name) values ('${T1}', null, 0, 'sem origem')`);
  check('banco recusa preço 0 em anúncio sem origem', /check|violates/i.test(zeroManual), zeroManual);
  // recusado nunca entra; revogado sai, mas quem comprou fica
  r = await submit(b, chB, 'Item Recusado'); const APR = r.data?.id;
  await ok('mestre recusa', gm.sb.from('table_custom_items').update({ status: 'rejected' }).eq('id', APR));
  check('recusado não vira anúncio', !(await listing(APR)));
  await ok('mestre revoga o amuleto', rpc(gm, 'revoke_custom_item', { p_id: AP1, p_note: '' }));
  check('revogado sai da loja', !(await listing(AP1)));
  await denied('revogado: não dá para comprar', buyAp(a, chA, AP1), /não está mais à venda/);
  check('quem já comprou continua com o item', (await row(a, chA)).data.inventory.some(e => e.id === `custom-${AP1}`));
  check('todo item aprovado do banco tem anúncio (preenchimento da 0044)', /"n":\s*0|"missing":\s*0/.test(sql(`select count(*) as missing from public.table_custom_items t where t.status = 'approved' and not exists (select 1 from public.table_shop_items s where s.id = t.id)`)));
  await ok('mestre tira o item dele da loja', rpc(gm, 'gm_shop_delete', { p_table: T1, p_id: manual, p_request_id: rid() }));

  console.log('— registro da mesa: moedas e experiências do próprio jogador (0045) —');
  const ownAudit = async (u, extra = q => q) => ((await extra(u.sb.from('master_audit_log').select('character_id,category').eq('table_id', T1))).data || []);
  const aRows = await ownAudit(a);
  check('A lê as moedas/experiências do próprio personagem e só elas', aRows.length > 0 && aRows.every(x => ['wallet', 'experience'].includes(x.category) && x.character_id === chA), JSON.stringify(aRows.slice(0, 3)));
  check('B não lê as de A', (await ownAudit(b)).every(x => x.character_id === chB));
  check('estranho não lê nada', (await ownAudit(c)).length === 0);
  const aWrite = await a.sb.from('master_audit_log').insert({ table_id: T1, category: 'wallet', kind: 'x', character_id: chA });
  check('jogador continua sem escrever no histórico', Boolean(aWrite.error));

  console.log('— histórico —');
  const all = (await gm.sb.from('master_audit_log').select('*').eq('table_id', T1)).data;
  check('histórico tem todas as categorias', ['money', 'xp', 'item', 'wallet', 'currency', 'experience', 'condition'].every(k => all.some(x => x.category === k)));
  check('toda linha tem responsável e data (o mestre; nas compras da loja, o jogador que comprou)', all.every(x => x.created_at && x.actor_id === (x.kind === 'shop_buy' ? a.id : gm.id)));
  const period = (await gm.sb.from('master_audit_log').select('id').eq('table_id', T1).eq('category', 'money').gte('created_at', new Date(Date.now() - 3600e3).toISOString()).lte('created_at', new Date(Date.now() + 60e3).toISOString())).data;
  check('filtro por período, categoria e jogador funciona', period.length > 0 && (await gm.sb.from('master_audit_log').select('id').eq('table_id', T1).eq('character_id', chB).eq('category', 'item')).data.length >= 3);
  check('jogador NÃO lê o histórico (só moedas/experiências do próprio personagem, 0045)', ((await a.sb.from('master_audit_log').select('id,category,character_id').eq('table_id', T1)).data || []).every(x => ['wallet', 'experience'].includes(x.category) && x.character_id === chA));
  check('estranho NÃO lê o histórico', ((await c.sb.from('master_audit_log').select('id').eq('table_id', T1)).data || []).length === 0);
  const forge = await a.sb.from('master_audit_log').insert({ table_id: T1, category: 'money', kind: 'x' });
  check('jogador não escreve no histórico', Boolean(forge.error));
  const forge2 = await gm.sb.from('master_audit_log').insert({ table_id: T1, category: 'money', kind: 'x' });
  check('nem o mestre escreve direto (só pelos RPCs)', Boolean(forge2.error));
  const del = await gm.sb.from('master_audit_log').delete().eq('table_id', T1).select('id');
  check('histórico não pode ser apagado pelo cliente', !del.data?.length);
} catch (e) {
  fail += 1;
  console.log('ERRO FATAL:', e.message);
} finally {
  if (!process.argv.includes('--keep') && cleanup.length) {
    const ids = cleanup.map(i => `'${i}'`).join(',');
    try { sql(`delete from public.tables where owner_id in (${ids}); delete from public.characters where owner_id in (${ids}); delete from auth.users where id in (${ids});`); console.log('Contas e dados de teste apagados.'); }
    catch (e) { console.log('Falha ao limpar:', e.message); fail += 1; }
  }
  console.log(`\n${pass} verificações passaram, ${fail} falharam.`);
  process.exit(fail ? 1 : 0);
}
