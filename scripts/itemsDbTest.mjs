// Teste de banco do inventário (migração 0039): permissões, transferência atômica, cantil, concorrência e merge de 3 vias
// contra o Supabase de verdade. NÃO entra no `npm test` (precisa de rede e cria contas descartáveis elara.teste.*).
//
//   node scripts/itemsDbTest.mjs
//
// Usa só a chave publicável (VITE_SUPABASE_ANON_KEY, em .env.local). No fim apaga as contas, mesas e fichas que criou
// (SUPABASE_ACCESS_TOKEN via scripts/db.mjs; passe --keep para não apagar).
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { newCharacter, validateCharacter } from '../src/rules.js';
import { MARKET_ITEMS, LIQUID_CONTAINERS } from '../src/market/items.js';
import { mergeRewards } from '../src/sheetRebase.js';
import { consumeItem } from '../src/market/inventory.js';

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const URL_ = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY;
const stamp = Date.now().toString(36);
const PASSWORD = `Teste-${stamp}-Inv!9`;
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const FLECHA = MARKET_ITEMS.find(i => i.category === 'municao').id;
const ADAGA = MARKET_ITEMS.find(i => i.name === 'Adaga').id;
const CANTIL = MARKET_ITEMS.find(i => i.name === 'Cantil (odre)').id;
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { if (cond) pass += 1; else { fail += 1; console.log(`  FALHOU: ${name} ${extra}`); } };
const ok = async (name, p) => { const r = await p; check(name, !r.error, r.error?.message); return r; };
const denied = async (name, p, re = null) => { const r = await p; check(name, Boolean(r.error) && (!re || re.test(r.error.message)), r.error ? r.error.message : 'deveria ter falhado'); return r; };

async function user(label) {
  const sb = client();
  const email = `elara.teste.inv${label}${stamp}@mailinator.com`;
  const { data, error } = await sb.auth.signUp({ email, password: PASSWORD, options: { data: { display_name: `Inv ${label}` } } });
  if (error) throw new Error(`signUp ${label}: ${error.message}`);
  let session = data.session;
  if (!session) ({ data: { session } } = await sb.auth.signInWithPassword({ email, password: PASSWORD }));
  if (!session) throw new Error(`Sem sessão para ${label} (confirmação de e-mail ligada?)`);
  return { sb, id: session.user.id, email };
}
const inv = async (sb, id) => (await sb.from('characters').select('data,revision').eq('id', id).single()).data;
const entry = (row, id) => row.data.inventory.find(e => e.id === id);
const qty = async (sb, ch, id) => entry(await inv(sb, ch), id)?.qty || 0;

async function makeChar(u, name, tableId, inventory) {
  const c = validateCharacter({ ...newCharacter(), name, inventory });
  const { data, error } = await u.sb.from('characters').insert({ name, data: c, schema_version: 1, table_id: tableId }).select('id').single();
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
  const T1 = await mkTable(gm, `Teste inv ${stamp}`);
  const T2 = await mkTable(c, `Teste inv outra ${stamp}`);
  const chA = await makeChar(a, 'Aria', null, [{ id: FLECHA, qty: 20, equipped: false }, { id: ADAGA, qty: 1, equipped: false }, { id: CANTIL, qty: 2, equipped: false, fills: [0.5, 1] }]);
  const chB = await makeChar(b, 'Bruno', null, [{ id: FLECHA, qty: 3, equipped: false }]);
  const chC = await makeChar(c, 'Cris', null, [{ id: FLECHA, qty: 5, equipped: false }]);
  for (const [u, ch, t] of [[a, chA, T1], [b, chB, T1], [c, chC, T2]]) await ok('entrar na mesa', u.sb.rpc('join_public_table', { p_table: t, p_message: '', p_character: ch }));
  await a.sb.from('characters').update({ table_id: T1 }).eq('id', chA);
  await b.sb.from('characters').update({ table_id: T1 }).eq('id', chB);
  const members = (await gm.sb.from('table_members').select('user_id,status,character_id').eq('table_id', T1)).data;
  check('A e B aprovados', members.filter(m => m.status === 'approved' && [chA, chB].includes(m.character_id)).length === 2, JSON.stringify(members));

  console.log('— gastar unidades (só diminui) —');
  const consume = (u, ch, id, n = 1, idx = null) => u.sb.rpc('inventory_consume', { p_character: ch, p_id: id, p_qty: n, p_index: idx });
  await ok('A gasta 1 flecha', consume(a, chA, FLECHA));
  check('20 → 19', await qty(a.sb, chA, FLECHA) === 19);
  await denied('B não mexe na mochila de A', consume(b, chA, FLECHA), /não pode alterar/);
  await denied('C (outra mesa) não mexe na mochila de A', consume(c, chA, FLECHA), /não pode alterar/);
  await denied('quantidade 0', consume(a, chA, FLECHA, 0));
  await denied('quantidade negativa (tentativa de aumentar)', consume(a, chA, FLECHA, -5));
  await denied('mais do que tem', consume(a, chA, FLECHA, 500), /só tem/);
  await denied('item que não tem', consume(a, chA, 'item-que-nao-existe'));
  check('nada mudou nas tentativas inválidas', await qty(a.sb, chA, FLECHA) === 19);
  await ok('mestre pode gastar (controle do mestre)', consume(gm, chA, FLECHA));
  check('18', await qty(a.sb, chA, FLECHA) === 18);
  // cantil: sai o nível da unidade retirada
  await ok('retira o cantil de índice 0 (nível 0,5)', consume(a, chA, CANTIL, 1, 0));
  let row = await inv(a.sb, chA);
  check('sobrou 1 cantil com nível 1', entry(row, CANTIL).qty === 1 && JSON.stringify(entry(row, CANTIL).fills) === '[1]', JSON.stringify(entry(row, CANTIL)));
  await denied('índice fora do intervalo', consume(a, chA, CANTIL, 1, 5));

  console.log('— cantil: nível —');
  const fill = (u, ch, idx, v, id = CANTIL) => u.sb.rpc('inventory_set_fill', { p_character: ch, p_id: id, p_index: idx, p_fill: v });
  await ok('nível 0,33', fill(a, chA, 0, 0.33));
  check('arredonda para 0,35', JSON.stringify(entry(await inv(a.sb, chA), CANTIL).fills) === '[0.35]');
  await ok('nível 5 L', fill(a, chA, 0, 5));
  check('limita em 1 L', JSON.stringify(entry(await inv(a.sb, chA), CANTIL).fills) === '[1]');
  await ok('nível negativo', fill(a, chA, 0, -2));
  check('limita em 0', JSON.stringify(entry(await inv(a.sb, chA), CANTIL).fills) === '[0]');
  await denied('B não ajusta o cantil de A', fill(b, chA, 0, 0.5), /não pode alterar/);
  await denied('item sem líquido', fill(a, chA, 0, 0.5, FLECHA), /não guarda líquido/);
  await denied('unidade inexistente', fill(a, chA, 3, 0.5));
  check('capacidade do SQL bate com a do catálogo', Object.entries(LIQUID_CONTAINERS).every(([id, v]) => readFileSync(new URL('../supabase/migrations/0039_inventory_items.sql', import.meta.url), 'utf8').includes(`'${id}' then ${v.capacity}`)));

  console.log('— mestre entrega itens —');
  const give = (u, ch, id, custom, n, t = T1) => u.sb.rpc('gm_give_item', { p_table: t, p_character: ch, p_id: id, p_custom: custom, p_qty: n });
  await denied('jogador não usa a ferramenta do mestre', give(a, chA, FLECHA, null, 5), /Apenas o mestre/);
  await denied('jogador não entrega a si mesmo', give(b, chB, FLECHA, null, 5), /Apenas o mestre/);
  await ok('mestre entrega 5 flechas ao A', give(gm, chA, FLECHA, null, 5));
  check('18 + 5 = 23', await qty(a.sb, chA, FLECHA) === 23);
  await denied('personagem de outra mesa', give(gm, chC, FLECHA, null, 1), /não está vinculado/);
  await denied('quantidade 0', give(gm, chA, FLECHA, null, 0));
  await denied('quantidade 100', give(gm, chA, FLECHA, null, 100));
  await denied('id inválido', give(gm, chA, 'DROP TABLE;--', null, 1), /inválido/);
  await denied('id custom forjado', give(gm, chA, 'custom-11111111-1111-1111-1111-111111111111', null, 1), /inválido/);
  await denied('sem nome', give(gm, chA, null, { name: '  ', weight: 1 }, 1));
  await ok('mestre cria item e entrega', give(gm, chB, null, { name: 'Poção de cura', weight: 0.3, description: 'Cura 1 ferimento', effects: [{ kind: 'derived', target: 'armor', bonus: 1 }, { kind: 'hack', target: 'x', bonus: 9 }] }, 3));
  row = await inv(b.sb, chB);
  const potion = row.data.inventory.find(e => e.custom?.name === 'Poção de cura');
  check('item custom na mochila de B (qty 3, peso 0,3, 1 efeito válido)', potion?.qty === 3 && potion.custom.weight === 0.3 && potion.custom.effects.length === 1 && /^custom-[0-9a-f-]{36}$/.test(potion.id), JSON.stringify(potion));
  check('a ficha continua válida para o app', (() => { try { validateCharacter(row.data); return true; } catch { return false; } })());
  await denied('estouro de 99 não entrega nada', give(gm, chA, FLECHA, null, 99), /99 unidades/);
  check('flechas de A seguem em 23', await qty(a.sb, chA, FLECHA) === 23);

  console.log('— transferência —');
  const send = (u, from, to, id, n, idx = null, t = T1) => u.sb.rpc('inventory_transfer', { p_table: t, p_from: from, p_to: to, p_id: id, p_qty: n, p_index: idx });
  await ok('A envia 5 flechas a B', send(a, chA, chB, FLECHA, 5));
  check('A 18, B 8 (soma conservada = 26)', await qty(a.sb, chA, FLECHA) === 18 && await qty(b.sb, chB, FLECHA) === 8);
  await denied('B não envia do personagem de A', send(b, chA, chB, FLECHA, 1), /seu próprio/);
  await denied('para si mesmo', send(a, chA, chA, FLECHA, 1), /outro personagem/);
  await denied('para outra mesa', send(a, chA, chC, FLECHA, 1), /mesma mesa/);
  await denied('de outra mesa', send(c, chC, chA, FLECHA, 1, null, T2), /mesma mesa/);
  await denied('mais do que tem', send(a, chA, chB, FLECHA, 19), /só tem/);
  await denied('quantidade 0', send(a, chA, chB, FLECHA, 0));
  await denied('quantidade negativa', send(a, chA, chB, FLECHA, -3));
  await denied('item que não tem', send(a, chA, chB, 'item-que-nao-existe', 1));
  check('nada mudou nas tentativas inválidas', await qty(a.sb, chA, FLECHA) === 18 && await qty(b.sb, chB, FLECHA) === 8);
  // estouro do teto no destino: nada pode sair do remetente
  await ok('mestre põe B em 98 flechas', give(gm, chB, FLECHA, null, 90));
  check('B 98', await qty(b.sb, chB, FLECHA) === 98);
  await denied('destino passaria de 99', send(a, chA, chB, FLECHA, 5), /99 unidades/);
  check('A continua com 18 (nada se perdeu)', await qty(a.sb, chA, FLECHA) === 18);
  await ok('envia 1 (cabe)', send(a, chA, chB, FLECHA, 1));
  check('A 17, B 99', await qty(a.sb, chA, FLECHA) === 17 && await qty(b.sb, chB, FLECHA) === 99);
  // item que o destinatário não tinha + enviar tudo remove a entrada
  await ok('A envia a adaga (último exemplar)', send(a, chA, chB, ADAGA, 1));
  check('A sem adaga, B com 1', !entry(await inv(a.sb, chA), ADAGA) && await qty(b.sb, chB, ADAGA) === 1);
  // cantil: leva o nível da unidade escolhida
  await ok('mestre dá cantis ao A', give(gm, chA, CANTIL, null, 2));
  await ok('A enche o cantil 1', fill(a, chA, 1, 0.8));
  await ok('A envia a unidade 1 (nível 0,8)', send(a, chA, chB, CANTIL, 1, 1));
  const ra = entry(await inv(a.sb, chA), CANTIL), rb = entry(await inv(b.sb, chB), CANTIL);
  check('A: 2 cantis vazios; B: 1 cantil com 0,8', ra.qty === 2 && JSON.stringify(ra.fills) === '[0,0]' && rb.qty === 1 && JSON.stringify(rb.fills) === '[0.8]', `${JSON.stringify(ra)} ${JSON.stringify(rb)}`);
  check('log da mesa visível para o membro B e não para C', (await b.sb.from('inventory_log').select('id').eq('table_id', T1)).data.length >= 4 && (await c.sb.from('inventory_log').select('id').eq('table_id', T1)).data.length === 0);
  await denied('jogador não escreve no log', a.sb.from('inventory_log').insert({ table_id: T1, item_id: 'x', qty: 1, kind: 'gm_give' }).then(r => ({ error: r.error })));

  console.log('— item customizado transferido (discarded_at) —');
  const req = await ok('A pede item custom', a.sb.from('table_custom_items').insert({ table_id: T1, character_id: chA, name: 'Amuleto', weight: 0.2, effects: [], description: 'Brilha' }).select('id').single());
  const rid = req.data.id, cid = `custom-${rid}`;
  await ok('mestre aprova', gm.sb.rpc('approve_custom_item', { p_id: rid, p_price: 0, p_note: '' }));
  await ok('A recolhe', a.sb.rpc('claim_custom_items', { p_character: chA }));
  const row0 = await inv(a.sb, chA);
  const custom = { name: 'Amuleto', weight: 0.2, effects: [], description: 'Brilha' };
  await ok('(app) A guarda o item na ficha', a.sb.from('characters').update({ data: { ...row0.data, inventory: [...row0.data.inventory, { id: cid, custom, qty: 1, equipped: false }] } }).eq('id', chA).eq('revision', row0.revision));
  const discardedAt = async () => (await a.sb.from('table_custom_items').select('discarded_at').eq('id', rid).single()).data.discarded_at;
  check('ainda não descartado', (await discardedAt()) === null);
  await denied('custom não sai por gastar (use descartar)', consume(a, chA, cid));
  await ok('A transfere o último exemplar a B', send(a, chA, chB, cid, 1));
  check('A perdeu, B recebeu com o payload completo', !entry(await inv(a.sb, chA), cid) && JSON.stringify(entry(await inv(b.sb, chB), cid)?.custom) === JSON.stringify(custom));
  check('registro de A marcado como descartado (só para a reposição não devolver)', (await discardedAt()) !== null);
  check('o item de B continua válido para o app', validateCharacter((await inv(b.sb, chB)).data).inventory.some(e => e.id === cid));
  await ok('B transfere de volta a A (ou a quem quiser: pode transferir de novo)', send(b, chB, chA, cid, 1));
  check('A tem de novo e discarded_at foi limpo', !!entry(await inv(a.sb, chA), cid) && (await discardedAt()) === null);
  check('B já não tem', !entry(await inv(b.sb, chB), cid));

  console.log('— concorrência —');
  await ok('A fica com 20 flechas para o teste', give(gm, chA, FLECHA, null, 3));
  check('A 20', await qty(a.sb, chA, FLECHA) === 20);
  const res = await Promise.all(Array.from({ length: 10 }, () => consume(a, chA, FLECHA)));
  check('10 gastos simultâneos todos funcionam', res.every(r => !r.error), res.map(r => r.error?.message).join('|'));
  check('sobram exatamente 10 (nenhum gasto perdido)', await qty(a.sb, chA, FLECHA) === 10);
  check('B segue em 99 (teto)', await qty(b.sb, chB, FLECHA) === 99);
  await ok('B devolve 89 a A', send(b, chB, chA, FLECHA, 89));
  check('A 99, B 10', await qty(a.sb, chA, FLECHA) === 99 && await qty(b.sb, chB, FLECHA) === 10);
  const two = await Promise.all([send(a, chA, chB, FLECHA, 60), send(a, chA, chB, FLECHA, 60)]);
  check('duas transferências de 60 com saldo 99: só uma passa', two.filter(r => !r.error).length === 1, two.map(r => r.error?.message).join('|'));
  check('soma conservada (109)', await qty(a.sb, chA, FLECHA) + await qty(b.sb, chB, FLECHA) === 109, `${await qty(a.sb, chA, FLECHA)} + ${await qty(b.sb, chB, FLECHA)}`);
  const cross = await Promise.all([send(a, chA, chB, FLECHA, 5), send(b, chB, chA, FLECHA, 7), send(a, chA, chB, FLECHA, 2), send(b, chB, chA, FLECHA, 1)]);
  check('transferências cruzadas simultâneas não travam (sem deadlock)', cross.every(r => !r.error || /99 unidades|só tem/.test(r.error.message)), cross.map(r => r.error?.message).join('|'));
  check('soma conservada depois das cruzadas (109)', await qty(a.sb, chA, FLECHA) + await qty(b.sb, chB, FLECHA) === 109);

  console.log('— merge de 3 vias com a nuvem de verdade —');
  // A abre a ficha (base), tira 1 flecha localmente; enquanto isso o mestre entrega 5.
  const base = await inv(a.sb, chA);
  const baseQty = entry(base, FLECHA).qty;
  if (baseQty > 90) await ok('abre espaço', send(a, chA, chB, FLECHA, 40));
  const base2 = await inv(a.sb, chA);
  const local = consumeItem(validateCharacter(base2.data), FLECHA, 1);
  await ok('mestre entrega 5 enquanto a ficha está aberta', give(gm, chA, FLECHA, null, 5));
  const cloud = await inv(a.sb, chA);
  const stale = await a.sb.from('characters').update({ data: local }).eq('id', chA).eq('revision', base2.revision).select('id');
  check('salvar com a revisão antiga dá conflito (0 linhas)', !stale.error && stale.data.length === 0);
  const merged = mergeRewards(base2.data, local, cloud.data);
  check('merge não é null e soma −1 e +5', merged && entry({ data: merged }, FLECHA).qty === entry(base2, FLECHA).qty + 4, JSON.stringify(entry({ data: merged || {} }, FLECHA)));
  const saved = await a.sb.from('characters').update({ data: validateCharacter(merged) }).eq('id', chA).eq('revision', cloud.revision).select('id');
  check('salvar o merge com a revisão nova funciona', !saved.error && saved.data.length === 1);
  check('nuvem final = base − 1 + 5', await qty(a.sb, chA, FLECHA) === entry(base2, FLECHA).qty + 4);
  // cantil mexido em um aparelho enquanto outro recebe cantil do mestre
  const b3 = await inv(a.sb, chA);
  await ok('A enche o cantil 0 pelo token', fill(a, chA, 0, 0.6));
  await ok('mestre dá mais um cantil', give(gm, chA, CANTIL, null, 1));
  const c3 = await inv(a.sb, chA);
  const local3 = { ...validateCharacter(b3.data) };
  local3.inventory = local3.inventory.map(e => (e.id === CANTIL ? { ...e, fills: e.fills.map((v, i) => (i === 1 ? 0.25 : v)) } : e));
  const m3 = mergeRewards(b3.data, local3, c3.data);
  const f3 = entry({ data: m3 }, CANTIL);
  check('cantis: 3 unidades, níveis [0,6; 0,25; 0]', f3.qty === 3 && JSON.stringify(f3.fills) === '[0.6,0.25,0]', JSON.stringify(f3));

  console.log('— RLS direta —');
  const hack = await b.sb.from('characters').update({ data: { ...(await inv(a.sb, chA)).data, inventory: [{ id: FLECHA, qty: 99, equipped: false }] } }).eq('id', chA).select('id');
  check('B não consegue escrever na ficha de A pela API', !hack.error && hack.data.length === 0);
  const hack2 = await gm.sb.from('characters').update({ name: 'hack' }).eq('id', chA).select('id');
  check('mestre também não escreve direto (só por RPC)', !hack2.error && hack2.data.length === 0);
  const own = await a.sb.from('characters').select('data').eq('id', chA).single();
  check('A segue lendo a própria ficha', !!own.data);

  console.log('— persistência —');
  const fresh = client();
  await fresh.auth.signInWithPassword({ email: a.email, password: PASSWORD });
  const reread = await fresh.from('characters').select('data').eq('id', chA).single();
  check('releitura em outro "aparelho" traz o mesmo inventário', JSON.stringify(reread.data.data.inventory) === JSON.stringify((await inv(a.sb, chA)).data.inventory));
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
    } catch { console.log('Não consegui apagar as contas de teste (apague elara.teste.inv* manualmente).'); }
  }
  process.exit(fail ? 1 : 0);
}
