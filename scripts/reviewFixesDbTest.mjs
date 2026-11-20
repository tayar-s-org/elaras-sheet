// Teste de banco das correções da revisão modular (migrações 0046, 0047, 0048 e 0049) contra o Supabase de verdade:
// estado sempre objeto + condições por diferença (0046), recursos do painel do grupo (0049), benefícios em duas fases (0047)
// e fim do teto de 24 dados do Estudo Mágico (0048). NÃO entra no `npm test` (precisa de rede e cria contas descartáveis
// elara.teste.rf*).
//
//   node --experimental-websocket scripts/reviewFixesDbTest.mjs
//
// Usa só a chave publicável (VITE_SUPABASE_ANON_KEY, em .env.local). No fim apaga as contas, mesas e fichas que criou
// (SUPABASE_ACCESS_TOKEN via scripts/db.mjs; passe --keep para não apagar).
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { newCharacter, validateCharacter } from '../src/rules.js';

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const URL_ = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY;
const stamp = Date.now().toString(36);
const PASSWORD = `Teste-${stamp}-Rf!9`;
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { if (cond) pass += 1; else { fail += 1; console.log(`  FALHOU: ${name} ${extra}`); } };
const rpc = (u, fn, args) => u.sb.rpc(fn, args);
const ok = async (name, p) => { const r = await p; check(name, !r.error, r.error?.message); return r; };
const denied = async (name, p, re = null) => { const r = await p; check(name, Boolean(r.error) && (!re || re.test(r.error.message)), r.error ? r.error.message : 'deveria ter falhado'); return r; };
const rid = () => randomUUID();
const cwd = new URL('..', import.meta.url);
const sql = q => execFileSync('node', ['scripts/db.mjs', '--query', q], { encoding: 'utf8', cwd });

async function user(label) {
  const sb = client();
  const email = `elara.teste.rf${label}${stamp}@mailinator.com`;
  const { data, error } = await sb.auth.signUp({ email, password: PASSWORD, options: { data: { display_name: `Rf ${label}` } } });
  if (error) throw new Error(`signUp ${label}: ${error.message}`);
  let session = data.session;
  if (!session) ({ data: { session } } = await sb.auth.signInWithPassword({ email, password: PASSWORD }));
  if (!session) throw new Error(`Sem sessão para ${label} (confirmação de e-mail ligada?)`);
  return { sb, id: session.user.id };
}
async function makeChar(u, name) {
  const data = validateCharacter({ ...newCharacter(), name });
  const { data: row, error } = await u.sb.from('characters').insert({ name, data, schema_version: 1, table_id: null }).select('id').single();
  if (error) throw new Error(`personagem ${name}: ${error.message}`);
  return row.id;
}
const stateOf = async (u, t, ch) => (await u.sb.from('table_character_state').select('state').eq('table_id', t).eq('character_id', ch).maybeSingle()).data?.state;
const labels = st => (st?.conditions || []).map(c => c.label).sort().join();

const cleanup = [];
try {
  console.log('Criando contas, mesa e personagens descartáveis…');
  const [gm, a, b] = [await user('gm'), await user('a'), await user('b')];
  cleanup.push(gm.id, a.id, b.id);
  const { data: tb, error: te } = await gm.sb.from('tables').insert({ name: `Teste rf ${stamp}`, description: '', visibility: 'public', auto_approve: true, max_players: 6 }).select('id').single();
  if (te) throw new Error(`mesa: ${te.message}`);
  const T = tb.id;
  const chA = await makeChar(a, 'Aria');
  const chB = await makeChar(b, 'Bruno');
  for (const [u, ch] of [[a, chA], [b, chB]]) {
    await ok('entrar na mesa', rpc(u, 'join_public_table', { p_table: T, p_message: '', p_character: ch }));
    await u.sb.from('characters').update({ table_id: T }).eq('id', ch);
  }

  console.log('— 0046: estado sempre objeto e condições do mestre —');
  const upsert = (u, state) => u.sb.from('table_character_state').upsert({ table_id: T, character_id: chA, state }, { onConflict: 'table_id,character_id' });
  await ok('dono grava estado normal', upsert(a, { life: 5, stamina: 5, mana: 5 }));
  for (const [label, bad] of [['array vazio', []], ['texto', 'x'], ['número', 7], ['null', null]]) {
    const r = await upsert(a, bad);
    check(`dono não grava estado ${label}`, Boolean(r.error), 'deveria ter falhado');
  }
  const upd = await a.sb.from('table_character_state').update({ state: [] }).eq('table_id', T).eq('character_id', chA).select();
  check('UPDATE com array é recusado', Boolean(upd.error), JSON.stringify(upd.data));
  check('estado segue objeto', ['object'].includes(typeof (await stateOf(a, T, chA))) && !Array.isArray(await stateOf(a, T, chA)));
  const rawCheck = sql(`select count(*) as n from pg_constraint where conname = 'table_character_state_state_is_object' and convalidated`);
  check('restrição de objeto existe e está validada', /"n":\s*1/.test(rawCheck), rawCheck.slice(0, 120));

  const delta = (u, { add = [], remove = [], req = rid(), ch = chA } = {}) => rpc(u, 'gm_conditions_delta', { p_table: T, p_character: ch, p_add: add, p_remove: remove, p_note: '', p_request_id: req });
  const par = await Promise.all([delta(gm, { add: [{ id: 'ca', label: 'Alfa' }] }), delta(gm, { add: [{ id: 'cb', label: 'Beta' }] })]);
  check('duas adições em paralelo sem erro', par.every(r => !r.error), JSON.stringify(par.find(r => r.error)?.error));
  check('Alfa e Beta ficaram', labels(await stateOf(a, T, chA)) === 'Alfa,Beta', labels(await stateOf(a, T, chA)));
  await ok('mais duas, em sequência', delta(gm, { add: [{ id: 'cc', label: 'Gama' }] }));
  check('três condições', labels(await stateOf(a, T, chA)) === 'Alfa,Beta,Gama');
  const rm = await ok('remove Beta por id', delta(gm, { remove: ['cb'] }));
  check('só Beta saiu', labels(await stateOf(a, T, chA)) === 'Alfa,Gama', labels(await stateOf(a, T, chA)));
  check('resumo cita Beta', /Removeu: Beta/.test(rm.data?.summary || ''), rm.data?.summary);
  const rmPar = await Promise.all([delta(gm, { remove: ['ca'] }), delta(gm, { add: [{ id: 'cd', label: 'Delta' }] })]);
  check('remover e acrescentar em paralelo sem erro', rmPar.every(r => !r.error), JSON.stringify(rmPar.find(r => r.error)?.error));
  check('Gama e Delta ficaram, Alfa saiu', labels(await stateOf(a, T, chA)) === 'Delta,Gama', labels(await stateOf(a, T, chA)));
  const noop = await ok('remover id inexistente é no-op', delta(gm, { remove: ['nao-existe'] }));
  check('no-op não muda a lista', labels(await stateOf(a, T, chA)) === 'Delta,Gama' && noop.data?.replayed === true);
  await denied('jogador dono não usa gm_conditions_delta', delta(a, { add: [{ label: 'Forjada' }] }), /Apenas o mestre/);
  await denied('outro jogador não usa gm_conditions_delta', delta(b, { remove: ['cc'] }), /Apenas o mestre/);
  await denied('sem request_id', rpc(gm, 'gm_conditions_delta', { p_table: T, p_character: chA, p_add: [{ label: 'X' }], p_remove: [], p_note: '', p_request_id: null }), /request_id/);
  check('tentativas negadas não mudaram nada', labels(await stateOf(a, T, chA)) === 'Delta,Gama');
  const same = rid();
  await ok('1ª com request_id fixo', delta(gm, { add: [{ id: 'ce', label: 'Eco' }], req: same }));
  const rep = await ok('reenvio com o mesmo request_id', delta(gm, { add: [{ id: 'ce', label: 'Eco' }], req: same }));
  check('reenvio idempotente', labels(await stateOf(a, T, chA)) === 'Delta,Eco,Gama' && rep.data?.replayed === true, labels(await stateOf(a, T, chA)));

  const keep = labels(await stateOf(a, T, chA));
  const keepsAfter = async (name, p) => { await p; check(name, labels(await stateOf(gm, T, chA)) === keep, labels(await stateOf(gm, T, chA))); };
  await keepsAfter('dono grava {} → condições preservadas', upsert(a, {}));
  await keepsAfter('dono grava outras chaves → preservadas', upsert(a, { life: 1, foo: 'bar' }));
  await keepsAfter('dono grava conditions vazias → preservadas', upsert(a, { life: 1, conditions: [] }));
  await keepsAfter('dono sobrescreve com UPDATE {} → preservadas', a.sb.from('table_character_state').update({ state: {} }).eq('table_id', T).eq('character_id', chA));
  await keepsAfter('mestre grava direto sem conditions → preservadas', upsert(gm, { life: 2 }));
  const seq = [[], 'x', {}];
  for (const s of seq) await upsert(a, s);
  check('sequência [] → "x" → {} (a brecha antiga) não apaga condições', labels(await stateOf(gm, T, chA)) === keep);

  console.log('— 0049: recursos do painel do grupo —');
  const MAX = { life: 10, stamina: 10, mana: 10 };
  const res = (u, resource, value, ch = chA, max = MAX) => rpc(u, 'set_state_resource', { p_table: T, p_character: ch, p_resource: resource, p_value: value, p_max: max });
  let r = await ok('dono define vida 7', res(a, 'life', 7));
  check('retorno traz vida 7 e máximos', r.data?.life === 7 && r.data?.max?.mana === 10, JSON.stringify(r.data));
  check('as condições do mestre continuam no estado', labels(r.data) === keep, labels(r.data));
  r = await ok('mestre define stamina 4', res(gm, 'stamina', 4));
  check('stamina 4 e vida segue 7', r.data?.stamina === 4 && r.data?.life === 7, JSON.stringify(r.data));
  await ok('limite inferior 0', res(a, 'mana', 0));
  await ok('limite superior = máximo', res(a, 'mana', 10));
  await denied('acima do máximo', res(a, 'mana', 11), /fora dos limites/);
  await denied('negativo', res(a, 'life', -1), /fora dos limites/);
  await denied('valor nulo', res(a, 'life', null), /fora dos limites/);
  await denied('recurso inválido', res(a, 'sanity', 1), /Recurso inválido/);
  await denied('máximos inválidos', res(a, 'life', 1, chA, { life: 10 }), /Máximos inválidos/);
  await denied('máximos negativos', res(a, 'life', 1, chA, { life: -1, stamina: 1, mana: 1 }), /Máximos inválidos/);
  await denied('outro jogador (B) não altera a ficha de A', res(b, 'life', 1), /não pode alterar/);
  await denied('dono não altera a ficha de B', res(a, 'life', 1, chB), /não pode alterar/);
  const stranger = await user('c'); cleanup.push(stranger.id);
  await denied('estranho à mesa não altera', res(stranger, 'life', 1), /não pode alterar/);
  check('tentativas negadas não mudaram a vida', (await stateOf(a, T, chA)).life === 7);
  // Concorrência: GM mexe na vida enquanto o dono mexe na mana, várias rodadas, nenhum se perde.
  let lost = 0;
  for (let i = 0; i < 6; i++) {
    const [lv, mv] = [i + 1, 9 - i];
    const both = await Promise.all([res(gm, 'life', lv), res(a, 'mana', mv)]);
    const st = await stateOf(a, T, chA);
    if (both.some(x => x.error) || st.life !== lv || st.mana !== mv) lost += 1;
  }
  check('vida (mestre) e mana (jogador) simultâneas: nenhuma se perde em 6 rodadas', lost === 0, `rodadas com perda: ${lost}`);
  const many = await Promise.all([res(gm, 'life', 3), res(a, 'stamina', 2), res(gm, 'mana', 5), res(a, 'life', 3)]);
  check('quatro escritas simultâneas sem erro', many.every(x => !x.error), JSON.stringify(many.find(x => x.error)?.error));
  const fin = await stateOf(a, T, chA);
  check('stamina 2, mana 5, vida 3 persistiram', fin.stamina === 2 && fin.mana === 5 && fin.life === 3, JSON.stringify(fin));
  check('condições do mestre sobreviveram às escritas simultâneas', labels(fin) === keep);
  const faint = (u, f, ch = chA) => rpc(u, 'set_state_faint', { p_table: T, p_character: ch, p_faint: f, p_max: MAX });
  r = await ok('dono define desmaio', faint(a, { hours: 3, fainted: false }));
  check('faint gravado e recursos intactos', r.data?.faint?.hours === 3 && r.data?.faint?.fainted === false && r.data?.mana === 5, JSON.stringify(r.data));
  r = await ok('mestre marca desmaiado', faint(gm, { hours: null, fainted: true }));
  check('faint do mestre gravado', r.data?.faint?.fainted === true, JSON.stringify(r.data));
  await denied('outro jogador não define desmaio', faint(b, { hours: 2, fainted: false }), /não pode alterar/);
  await denied('desmaio inválido (horas 0)', faint(a, { hours: 0, fainted: false }), /inválido/);
  await denied('desmaio inválido (sem fainted)', faint(a, { hours: 2 }), /inválido/);
  await denied('desmaio inválido (não objeto)', faint(a, 'x'), /inválido/);
  check('condições seguem intactas após o desmaio', labels(await stateOf(a, T, chA)) === keep);
  r = await ok('vida 10 sai da Incapacitação 4 e limpa o desmaio', res(a, 'life', 10));
  check('faint removido quando não está mais incapacitado', !('faint' in (r.data || {})), JSON.stringify(r.data));

  console.log('— 0047: benefícios em duas fases —');
  const ev = (await sql(`insert into public.evolution_awards (table_id, character_id, kind, name, modality, cost) values ('${T}', '${chA}', 'skill', 'Lutar', 'normal', 100), ('${T}', '${chA}', 'attribute', 'Força', 'normal', 100) returning id`));
  const evIds = [...ev.matchAll(/[0-9a-f]{8}-[0-9a-f-]{27}/g)].map(m => m[0]);
  const up = (await sql(`insert into public.spell_upgrade_awards (table_id, character_id, spell_id, n, description) values ('${T}', '${chA}', 'bola-de-fogo', 1, 'mais forte') returning id`));
  const upIds = [...up.matchAll(/[0-9a-f]{8}-[0-9a-f-]{27}/g)].map(m => m[0]);
  check('prêmios de teste criados', evIds.length === 2 && upIds.length === 1, `${evIds.length}/${upIds.length}`);
  const peek = u => u.sb.rpc('peek_pending_benefits');
  let p1 = await ok('A consulta pendentes', peek(a));
  const ids = (x, k) => (x.data?.[k] || []).map(e => e.id).sort().join();
  check('vê as 2 evoluções e a melhoria de feitiço', ids(p1, 'evolutions') === [...evIds].sort().join() && ids(p1, 'spell_upgrades') === upIds.join(), JSON.stringify(p1.data));
  check('campos esperados (character_id, kind, name, spell_id, n)', p1.data.evolutions.every(e => e.character_id === chA && e.kind && e.name) && p1.data.spell_upgrades[0].spell_id === 'bola-de-fogo' && p1.data.spell_upgrades[0].n === 1);
  check('custom_skills é uma lista', Array.isArray(p1.data.custom_skills));
  const p2 = await ok('consultar de novo', peek(a));
  check('consultar não marca nada (mesmo resultado)', JSON.stringify(p2.data) === JSON.stringify(p1.data));
  const pendingRows = sql(`select count(*) as n from public.evolution_awards where character_id = '${chA}' and claimed_at is null`);
  check('banco: ainda 2 pendentes', /"n":\s*2/.test(pendingRows), pendingRows.slice(0, 100));
  const pb = await ok('B consulta', peek(b));
  check('B não vê os benefícios de A', (pb.data?.evolutions || []).length === 0 && (pb.data?.spell_upgrades || []).length === 0);
  const pg = await ok('mestre consulta', peek(gm));
  check('mestre não vê os benefícios de A (só das próprias fichas)', (pg.data?.evolutions || []).length === 0);
  const hack = await ok('B tenta confirmar os IDs de A', rpc(b, 'confirm_benefits', { p_evolutions: evIds, p_spell_upgrades: upIds, p_custom_skills: [] }));
  check('nada confirmado para B (0 de cada)', hack.data?.evolutions === 0 && hack.data?.spell_upgrades === 0, JSON.stringify(hack.data));
  check('A ainda vê tudo pendente', ids(await peek(a), 'evolutions') === [...evIds].sort().join());
  const gmHack = await ok('mestre tenta confirmar os IDs de A', rpc(gm, 'confirm_benefits', { p_evolutions: evIds, p_spell_upgrades: upIds, p_custom_skills: [] }));
  check('mestre também não confirma ficha alheia', gmHack.data?.evolutions === 0 && gmHack.data?.spell_upgrades === 0, JSON.stringify(gmHack.data));
  const c1 = await ok('A confirma uma evolução e a melhoria', rpc(a, 'confirm_benefits', { p_evolutions: [evIds[0]], p_spell_upgrades: upIds, p_custom_skills: [] }));
  check('confirmou 1 evolução e 1 melhoria', c1.data?.evolutions === 1 && c1.data?.spell_upgrades === 1, JSON.stringify(c1.data));
  const p3 = await peek(a);
  check('sobra só a outra evolução', ids(p3, 'evolutions') === evIds[1] && (p3.data.spell_upgrades || []).length === 0, JSON.stringify(p3.data));
  const c2 = await ok('repetir a confirmação', rpc(a, 'confirm_benefits', { p_evolutions: [evIds[0]], p_spell_upgrades: upIds, p_custom_skills: [] }));
  check('repetição não muda nada (0)', c2.data?.evolutions === 0 && c2.data?.spell_upgrades === 0, JSON.stringify(c2.data));
  const c3 = await ok('confirmar tudo, incluindo ID já confirmado e ID inexistente', rpc(a, 'confirm_benefits', { p_evolutions: [...evIds, rid()], p_spell_upgrades: [], p_custom_skills: [] }));
  check('só a que faltava mudou (1)', c3.data?.evolutions === 1, JSON.stringify(c3.data));
  const p4 = await peek(a);
  check('nada pendente', (p4.data.evolutions || []).length === 0 && (p4.data.spell_upgrades || []).length === 0);
  const empty = await ok('confirmar listas vazias', rpc(a, 'confirm_benefits', {}));
  check('listas vazias: tudo 0', empty.data?.evolutions === 0 && empty.data?.spell_upgrades === 0 && empty.data?.custom_skills === 0, JSON.stringify(empty.data));
  const anon = await client().rpc('peek_pending_benefits');
  check('sem login não consulta', Boolean(anon.error));
  const anonC = await client().rpc('confirm_benefits', { p_evolutions: evIds });
  check('sem login não confirma', Boolean(anonC.error));

  console.log('— 0048: Estudo Mágico sem teto de 24 dados —');
  const def = sql(`select pg_get_functiondef('public.attempt_spell_upgrade(uuid)'::regprocedure) as d`);
  check('a função existe', /attempt_spell_upgrade/.test(def));
  check("'least(24' não aparece mais", !/least\(24/.test(def), 'ainda tem least(24');
  check('total de dados = floor(study_hours / 25) sem teto', /total_dice\s*:=\s*floor\(tr\.study_hours \/ 25\)::int;/.test(def.replace(/\\n/g, ' ').replace(/\s+/g, ' ')), def.replace(/\s+/g, ' ').match(/total_dice :=[^;]*;/)?.[0]);
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
