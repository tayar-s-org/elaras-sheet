// Central do Mestre: chamadas aos RPCs da migração 0040 e leituras das tabelas novas. Documentação: src/features/room/masterHub/README.md.
//
// Contrato de idempotência: todo RPC administrativo recebe p_request_id (um por alvo). Em falha de rede/timeout a chamada é
// reenviada com o MESMO id (o servidor devolve o resultado já gravado, replayed=true, sem aplicar de novo). Se as tentativas
// acabarem sem resposta, o erro sai marcado com `uncertain = true` e quem chamou mantém o id para tentar de novo.
import { supabase } from './supabase.js';

const NETWORK = /failed to fetch|network|timeout|timed out|load failed|fetch|abort|connection|ECONN|502|503|504/i;
const SCHEMA = /schema cache|could not find the function|does not exist|relation .* does not exist/i;
const wait = ms => new Promise(r => setTimeout(r, ms));

function friendly(error) {
  const msg = error?.message || 'Erro ao acessar a nuvem.';
  if (SCHEMA.test(msg)) return new Error('O banco ainda não tem a atualização 0040/0041 (Central e Loja do Mestre). Aplique-a no Supabase e recarregue a página.');
  if (/table_shop_items.*foreign key|foreign key.*table_shop_items/i.test(msg)) return new Error('Esta moeda é usada por itens da Loja do Mestre. Tire esses itens da loja antes de apagá-la.');
  return new Error(msg);
}

// Chama um RPC com reenvio (mesmos argumentos, logo o mesmo p_request_id). Devolve o jsonb do servidor.
export async function callIdempotent(fn, args, { retries = 3, delay = 600 } = {}) {
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (!error) return data;
      if (!NETWORK.test(error.message || '')) throw friendly(error); // erro definitivo (permissão, valor inválido…)
      last = error;
    } catch (e) {
      if (!NETWORK.test(e?.message || '') || e?.definitive) throw e;
      last = e;
    }
    if (attempt < retries) await wait(delay * (attempt + 1));
  }
  const err = new Error('Sem conexão com o servidor. A operação pode ou não ter sido aplicada; tente de novo (o mesmo identificador evita repetir).');
  err.uncertain = true;
  err.cause = last;
  throw err;
}

// ---------- capacidade (a interface só liga a Central/Loja se a migração existir; nunca chama função que não existe) ----------
// master_hub_version(): 1 = Central (0040), 2 = Central + Loja do Mestre (0041). 0 = sem migração; null = rede incerta (tenta de novo).
let versionCache = null;
export function masterHubVersion(force = false) {
  if (!supabase) return Promise.resolve(0);
  if (versionCache && !force) return versionCache;
  versionCache = supabase.rpc('master_hub_version').then(({ data, error }) => {
    if (!error) return Number(data) || 0;
    if (SCHEMA.test(error.message || '')) return 0;
    versionCache = null; // erro de rede: não guarda, tenta de novo na próxima vez
    return null;
  }).catch(() => { versionCache = null; return null; });
  return versionCache;
}
// true se a Central existe (versão ≥ 1), false se não, null se a rede falhou. `min` = 2 para a Loja do Mestre.
export const masterHubReady = (force = false, min = 1) => masterHubVersion(force).then(v => (v === null ? null : v >= min));

// ---------- operações ----------
const base = (tableId, requestId) => ({ p_table: tableId, p_request_id: requestId });

export const adjustMoney = ({ tableId, characterId, mode, amount, note = '', requestId }) =>
  callIdempotent('gm_adjust_money', { ...base(tableId, requestId), p_character: characterId, p_mode: mode, p_amount: amount, p_note: note });
export const adjustXp = ({ tableId, characterId, mode, amount, note = '', requestId }) =>
  callIdempotent('gm_adjust_xp', { ...base(tableId, requestId), p_character: characterId, p_mode: mode, p_amount: amount, p_note: note });
export const giveItems = ({ tableId, characterId, id = null, custom = null, qty, note = '', requestId }) =>
  callIdempotent('gm_give_items', { ...base(tableId, requestId), p_character: characterId, p_id: id, p_custom: custom, p_qty: qty, p_note: note });
export const upsertCurrency = ({ tableId, id = null, name, symbol, description = '', rate = null, requestId }) =>
  callIdempotent('gm_upsert_currency', { ...base(tableId, requestId), p_id: id, p_name: name, p_symbol: symbol, p_description: description, p_rate: rate });
export const deleteCurrency = ({ tableId, id, force = false, requestId }) =>
  callIdempotent('gm_delete_currency', { ...base(tableId, requestId), p_id: id, p_force: force });
export const adjustWallet = ({ tableId, characterId, currencyId, mode, amount, note = '', requestId }) =>
  callIdempotent('gm_wallet_adjust', { ...base(tableId, requestId), p_character: characterId, p_currency: currencyId, p_mode: mode, p_amount: amount, p_note: note });
export const upsertExperienceType = ({ tableId, id = null, name, description = '', icon = '', category = '', requestId }) =>
  callIdempotent('gm_upsert_experience_type', { ...base(tableId, requestId), p_id: id, p_name: name, p_description: description, p_icon: icon, p_category: category });
export const deleteExperienceType = ({ tableId, id, force = false, requestId }) =>
  callIdempotent('gm_delete_experience_type', { ...base(tableId, requestId), p_id: id, p_force: force });
export const adjustExperience = ({ tableId, characterId, typeId, mode, amount, note = '', requestId }) =>
  callIdempotent('gm_experience_adjust', { ...base(tableId, requestId), p_character: characterId, p_type: typeId, p_mode: mode, p_amount: amount, p_note: note });
export const setConditions = ({ tableId, characterId, conditions, note = '', requestId }) =>
  callIdempotent('gm_set_conditions', { ...base(tableId, requestId), p_character: characterId, p_conditions: conditions, p_note: note });

// Loja do Mestre (migração 0041). `custom` = { name, weight, effects, description } (mesmo modelo dos itens customizados); nulo na edição mantém o item.
// currencyId: id de uma moeda da mesa, ou nulo / 'money' para vender em $ (migração 0043).
export const upsertShopItem = ({ tableId, id = null, custom = null, currencyId, price, active = true, requestId }) =>
  callIdempotent('gm_shop_upsert', { ...base(tableId, requestId), p_id: id, p_custom: custom, p_currency: currencyId === 'money' ? null : currencyId, p_price: price, p_active: active });
export const deleteShopItem = ({ tableId, id, requestId }) => callIdempotent('gm_shop_delete', { ...base(tableId, requestId), p_id: id });
// Jogador compra para o próprio personagem: debita a moeda e põe o item na mochila numa transação só.
export const buyShopItem = ({ tableId, characterId, listingId, qty = 1, requestId }) =>
  callIdempotent('shop_buy', { ...base(tableId, requestId), p_character: characterId, p_listing: listingId, p_qty: qty });

export const newRequestId = () => globalThis.crypto.randomUUID();

// ---------- leituras (a RLS já filtra: o dono só vê as próprias carteiras/contadores; o mestre vê todos) ----------
const read = async query => {
  const { data, error } = await query;
  if (error) {
    if (SCHEMA.test(error.message || '')) return null; // migração ainda não aplicada
    throw new Error(error.message || 'Erro ao acessar a nuvem.');
  }
  return data;
};

// { currencies, types, shop, wallets: { [characterId]: { [currencyId]: amount } }, experience: { [characterId]: { [typeId]: amount } } }
// ou null se a migração ainda não existe.
export async function loadExtras(tableId) {
  const [currencies, types, wallets, experience, shop] = await Promise.all([
    read(supabase.from('table_currencies').select('id,name,symbol,description,rate,created_at').eq('table_id', tableId).order('created_at')),
    read(supabase.from('table_experience_types').select('id,name,description,icon,category,created_at').eq('table_id', tableId).order('created_at')),
    read(supabase.from('character_wallets').select('character_id,currency_id,amount').eq('table_id', tableId)),
    read(supabase.from('character_experience').select('character_id,type_id,amount').eq('table_id', tableId)),
    // Loja do Mestre (0041): se ainda não existir, a Central continua e a loja fica vazia.
    read(supabase.from('table_shop_items').select('id,currency_id,price,name,weight,effects,description,active,created_at').eq('table_id', tableId).order('created_at')),
  ]);
  if (!currencies || !types || !wallets || !experience) return null;
  const nest = (rows, a, b) => rows.reduce((acc, r) => { (acc[r[a]] ||= {})[r[b]] = Number(r.amount) || 0; return acc; }, {});
  return { currencies, types, shop: shop || [], wallets: nest(wallets, 'character_id', 'currency_id'), experience: nest(experience, 'character_id', 'type_id') };
}

// Histórico administrativo (só o mestre lê). Filtros: período (from/to ISO), jogador, categoria. Paginação por deslocamento (offset).
export async function loadAudit(tableId, { from = '', to = '', characterId = '', category = '', offset = 0, limit = 30 } = {}) {
  let q = supabase.from('master_audit_log')
    .select('id,created_at,actor_id,character_id,category,kind,summary,before,after,note,request_id,profiles:actor_id(display_name)')
    .eq('table_id', tableId).order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + limit - 1);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);
  if (characterId) q = q.eq('character_id', characterId);
  if (category) q = q.eq('category', category);
  const rows = await read(q);
  return rows || [];
}
