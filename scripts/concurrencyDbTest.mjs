// Teste de banco de concorrência (migrações 0050 e 0051): vaga da mesa e cobrança/reembolso de item customizado com
// chamadas simultâneas contra o Supabase de verdade. NÃO entra no `npm test` (precisa de rede e cria contas descartáveis
// elara.teste.conc*). Rode contra um banco de teste depois de aplicar a 0050 e a 0051.
//
//   node scripts/concurrencyDbTest.mjs
//
// Usa só a chave publicável (VITE_SUPABASE_ANON_KEY, em .env.local). No fim apaga as contas, mesas e fichas que criou
// (SUPABASE_ACCESS_TOKEN via scripts/db.mjs; passe --keep para não apagar).
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { newCharacter, validateCharacter } from '../src/rules.js';

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const URL_ = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY;
const stamp = Date.now().toString(36);
const PASSWORD = `Teste-${stamp}-Conc!9`;
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { if (cond) pass += 1; else { fail += 1; console.log(`  FALHOU: ${name} ${extra}`); } };
const ok = async (name, p) => { const r = await p; check(name, !r.error, r.error?.message); return r; };
const succeeded = results => results.filter(r => !r.error).length;
const errors = results => results.map(r => r.error?.message).join('|');

async function user(label) {
  const sb = client();
  const email = `elara.teste.conc${label}${stamp}@mailinator.com`;
  const { data, error } = await sb.auth.signUp({ email, password: PASSWORD, options: { data: { display_name: `Conc ${label}` } } });
  if (error) throw new Error(`signUp ${label}: ${error.message}`);
  let session = data.session;
  if (!session) ({ data: { session } } = await sb.auth.signInWithPassword({ email, password: PASSWORD }));
  if (!session) throw new Error(`Sem sessão para ${label} (confirmação de e-mail ligada?)`);
  return { sb, id: session.user.id };
}
const mkTable = async (u, name, { autoApprove, maxPlayers }) => {
  const { data, error } = await u.sb.from('tables').insert({ name, description: '', visibility: 'public', auto_approve: autoApprove, max_players: maxPlayers }).select('id').single();
  if (error) throw new Error(`mesa: ${error.message}`);
  return data.id;
};
async function makeChar(u, name, money = 500) {
  const data = validateCharacter({ ...newCharacter(), name, money });
  const { data: row, error } = await u.sb.from('characters').insert({ name, data, schema_version: 1 }).select('id').single();
  if (error) throw new Error(`personagem ${name}: ${error.message}`);
  return row.id;
}
const money = async (u, ch) => (await u.sb.from('characters').select('data').eq('id', ch).single()).data.data.money;
const join = (u, table, ch) => u.sb.rpc('join_public_table', { p_table: table, p_message: '', p_character: ch });
const approvedPlayers = async (gm, table) => (await gm.sb.from('table_members').select('user_id').eq('table_id', table).eq('role', 'player').eq('status', 'approved')).data.length;

const cleanup = [];
try {
  console.log('Criando contas, mesas e personagens descartáveis…');
  const [gm, a, b] = [await user('gm'), await user('a'), await user('b')];
  cleanup.push(gm.id, a.id, b.id);
  const [chA, chB] = [await makeChar(a, 'Aria'), await makeChar(b, 'Bruno')];

  console.log('— limite de jogadores (0051) —');
  const autoTable = await mkTable(gm, `Conc auto ${stamp}`, { autoApprove: true, maxPlayers: 1 });
  const joins = await Promise.all([join(a, autoTable, chA), join(b, autoTable, chB)]);
  check('as duas entradas simultâneas funcionam (uma fica pendente)', succeeded(joins) === 2, errors(joins));
  check('só 1 jogador aprovado para a última vaga', await approvedPlayers(gm, autoTable) === 1);

  const manualTable = await mkTable(gm, `Conc manual ${stamp}`, { autoApprove: false, maxPlayers: 1 });
  await ok('A pede para entrar', join(a, manualTable, null));
  await ok('B pede para entrar', join(b, manualTable, null));
  const decisions = await Promise.all([a, b].map(u => gm.sb.rpc('decide_member', { p_table: manualTable, p_user: u.id, p_status: 'approved' })));
  check('duas aprovações simultâneas: só uma passa', succeeded(decisions) === 1 && /cheia/.test(errors(decisions)), errors(decisions));
  check('só 1 jogador aprovado', await approvedPlayers(gm, manualTable) === 1);

  console.log('— itens customizados: cobrança e reembolso (0050) —');
  const itemTable = await mkTable(gm, `Conc item ${stamp}`, { autoApprove: true, maxPlayers: 6 });
  const chItems = await makeChar(a, 'Aria itens'); // a ficha da outra mesa já está vinculada
  await ok('A entra com a ficha', join(a, itemTable, chItems));
  const request = async name => (await ok(`A pede ${name}`, a.sb.from('table_custom_items').insert({ table_id: itemTable, character_id: chItems, name, weight: 1, effects: [], description: '' }).select('id').single())).data.id;
  const approve = (id, price) => gm.sb.rpc('approve_custom_item', { p_id: id, p_price: price, p_note: '' });
  const revoke = id => gm.sb.rpc('revoke_custom_item', { p_id: id, p_note: '' });

  const [first, second] = [await request('Espada'), await request('Escudo')];
  await ok('aprova o primeiro item de $ 400', approve(first, 400));
  check('saldo debitado na hora (500 → 100)', await money(a, chItems) === 100, String(await money(a, chItems)));
  const noFunds = await approve(second, 400);
  check('segundo item de $ 400 recusado por falta de saldo', Boolean(noFunds.error) && /só tem/.test(noFunds.error.message), noFunds.error?.message);
  check('saldo segue 100', await money(a, chItems) === 100);

  const both = await Promise.all([approve(second, 100), approve(second, 100)]);
  check('duas aprovações simultâneas do mesmo item: só uma passa', succeeded(both) === 1, errors(both));
  check('cobrado uma vez só (100 → 0)', await money(a, chItems) === 0, String(await money(a, chItems)));

  const twice = await Promise.all([revoke(first), revoke(first)]);
  check('duas revogações simultâneas: só uma passa', succeeded(twice) === 1, errors(twice));
  check('reembolsado uma vez só (0 → 400)', await money(a, chItems) === 400, String(await money(a, chItems)));
  const log = (await a.sb.from('money_awards').select('amount').eq('character_id', chItems).in('note', ['Item: Espada', 'Reembolso: Espada'])).data.map(r => r.amount).sort((x, y) => x - y);
  check('uma cobrança e um reembolso registrados', JSON.stringify(log) === '[-400,400]', JSON.stringify(log));
} catch (e) {
  fail += 1;
  console.log('ERRO NO TESTE:', e.message);
} finally {
  console.log(`\n${pass} verificações ok, ${fail} falharam.`);
  if (!process.argv.includes('--keep') && cleanup.length) {
    const ids = cleanup.map(i => `'${i}'`).join(',');
    try {
      execFileSync('node', ['scripts/db.mjs', '--query', `delete from public.tables where owner_id in (${ids}); delete from public.characters where owner_id in (${ids}); delete from auth.users where id in (${ids});`], { cwd: new URL('..', import.meta.url), stdio: 'ignore' });
      console.log('Contas, mesas e fichas de teste apagadas.');
    } catch { console.log('Não consegui apagar as contas de teste (apague elara.teste.conc* manualmente).'); }
  }
  process.exit(fail ? 1 : 0);
}
