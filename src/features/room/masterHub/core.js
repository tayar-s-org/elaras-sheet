// Núcleo puro da Central do Mestre (sem React, sem rede): lista de módulos, execução em lote idempotente com resultado por
// alvo, prévia de valores (espelha os limites do servidor) e texto do histórico administrativo. Testado em core.test.js.
// Documentação: src/features/room/masterHub/README.md.
import { iconText, iconText as iconTextPlain, cleanIconKeys, DEFAULT_CURRENCY_ICON } from './experienceIcons.js';

// Ordem e rótulos dos módulos. O componente de cada um é ligado em modules.jsx (adicionar módulo = uma linha aqui e uma lá).
// needsHub: depende da migração 0040 (a Central mostra o aviso em vez de chamar função inexistente).
// group: rewards = o que o mestre mais usa (destaque); campaign = acompanhar jogadores; tools = ferramentas e registro (discretos).
export const MASTER_MODULES = [
  { key: 'players', label: 'Jogadores', group: 'campaign' },
  { key: 'money', label: 'Moedas', group: 'rewards', needsHub: true },
  { key: 'items', label: 'Itens', group: 'rewards', needsHub: true },
  { key: 'experience', label: 'Experiências', group: 'rewards', needsHub: true },
  { key: 'conditions', label: 'Status e Condições', group: 'campaign', needsHub: true },
  { key: 'creatures', label: 'Criaturas e Tokens', group: 'tools' },
  { key: 'maps', label: 'Mapas', group: 'tools' },
  { key: 'music', label: 'Música', group: 'tools' },
  { key: 'soundpad', label: 'Soundpad', group: 'tools' },
  { key: 'history', label: 'Histórico', group: 'tools', needsHub: true },
];
export const MODULE_GROUPS = [['rewards', 'Recompensas'], ['campaign', 'Campanha'], ['tools', 'Ferramentas e registro']];

// ---------- limites e prévia (os mesmos dos RPCs gm_adjust_*; o servidor é quem decide, isto só mostra o que vai acontecer) ----------
export const LIMITS = {
  money: { min: 0, max: 999999999, addMax: 1000000 },
  xp: { min: 0, max: 1000000, addMax: 10000 },
  wallet: { min: 0, max: 999999999, addMax: 999999999 },
  experience: { min: 0, max: 1000000, addMax: 1000000 },
};

// { ok, next, delta, error } para somar (valor com sinal) ou definir (valor final) dentro dos limites da categoria.
export function previewAdjust(kind, current, mode, amount) {
  const lim = LIMITS[kind];
  const cur = Math.max(lim.min, Math.min(lim.max, Math.trunc(Number(current)) || 0));
  const n = Math.trunc(Number(amount));
  if (!lim || !Number.isFinite(n) || amount === '' || amount === null || amount === undefined) return { ok: false, error: 'Informe um valor.' };
  if (mode === 'set') {
    if (n < lim.min || n > lim.max) return { ok: false, error: `O valor deve ficar entre ${lim.min} e ${lim.max}.` };
    return { ok: true, current: cur, next: n, delta: n - cur };
  }
  if (n === 0 || Math.abs(n) > lim.addMax) return { ok: false, error: `Informe um valor de 1 a ${lim.addMax} (negativo remove).` };
  const next = Math.max(lim.min, Math.min(lim.max, cur + n));
  return { ok: true, current: cur, next, delta: next - cur };
}

// ---------- ids pendentes (sobrevivem a recarregar/reconectar até haver resposta definitiva) ----------
export function makePendingStore(storage, prefix = 'elara-mh-pending:') {
  const safe = fn => { try { return fn(); } catch { return null; } };
  return {
    get: key => safe(() => storage.getItem(prefix + key)),
    set: (key, id) => safe(() => storage.setItem(prefix + key, id)),
    remove: key => safe(() => storage.removeItem(prefix + key)),
  };
}

// ---------- lote: uma chamada atômica por alvo, resultado individual, reenvio só dos que falharam ----------
// fn(target, requestId) devolve o resultado do RPC ({ replayed, before, after… }) ou lança Error (err.uncertain = rede incerta).
// O request_id de cada alvo é gerado uma vez e REUTILIZADO em qualquer reenvio (mesmo depois de recarregar a página, via store),
// então o servidor nunca aplica a mesma operação duas vezes. Sucesso ou erro definitivo liberam o id; erro incerto o mantém.
export async function runBatch(targets, fn, { opKey = 'op', store = null, newId = () => globalThis.crypto.randomUUID(), ids = {} } = {}) {
  const results = [];
  for (const t of targets) {
    const key = `${opKey}|${t.id}`;
    const requestId = ids[t.id] || store?.get(key) || newId();
    ids[t.id] = requestId;
    store?.set(key, requestId);
    try {
      const result = await fn(t, requestId);
      results.push({ id: t.id, name: t.name || '', ok: true, replayed: Boolean(result?.replayed), result });
      store?.remove(key);
      delete ids[t.id];
    } catch (e) {
      const uncertain = Boolean(e?.uncertain);
      results.push({ id: t.id, name: t.name || '', ok: false, error: e?.message || 'Erro desconhecido.', uncertain });
      if (!uncertain) { store?.remove(key); delete ids[t.id]; }
    }
  }
  return { results, ids };
}

// Tenta de novo só os alvos que falharam, com os mesmos ids; devolve a lista completa (na ordem original) já mesclada.
export async function retryFailed(prev, targets, fn, opts = {}) {
  const failedIds = new Set(prev.results.filter(r => !r.ok).map(r => r.id));
  const again = await runBatch(targets.filter(t => failedIds.has(t.id)), fn, { ...opts, ids: prev.ids });
  const byId = new Map(again.results.map(r => [r.id, r]));
  return { results: prev.results.map(r => byId.get(r.id) || r), ids: again.ids };
}

// "3 de 4 concluídos", sem chamar de sucesso o que falhou parcialmente.
export function summarizeBatch(results) {
  const ok = results.filter(r => r.ok).length;
  const failed = results.length - ok;
  const replayed = results.filter(r => r.ok && r.replayed).length;
  const text = failed === 0 ? (results.length === 1 ? 'Concluído.' : `Concluído para todos (${ok}).`)
    : ok === 0 ? `Nada foi aplicado: ${failed} falha${failed > 1 ? 's' : ''}.`
      : `${ok} de ${results.length} concluídos; ${failed} falhou${failed > 1 ? 'ram' : ''}.`;
  return { ok, failed, replayed, total: results.length, allOk: failed === 0 && results.length > 0, text };
}

// ---------- histórico administrativo ----------
export const AUDIT_CATEGORIES = [
  ['money', 'Dinheiro'], ['xp', 'XP'], ['item', 'Itens'], ['wallet', 'Carteira'],
  ['currency', 'Moedas'], ['experience', 'Experiências'], ['condition', 'Condições'],
];
export const categoryLabel = key => (AUDIT_CATEGORIES.find(([k]) => k === key) || [key, key])[1];

const KIND_LABEL = {
  add: 'Somou', subtract: 'Retirou', set: 'Definiu', give: 'Entregou', remove: 'Removeu', update: 'Atualizou',
  create: 'Criou', delete: 'Apagou', type_create: 'Criou tipo', type_update: 'Alterou tipo', type_delete: 'Apagou tipo',
  shop_create: 'Pôs à venda', shop_update: 'Alterou na loja', shop_delete: 'Tirou da loja', shop_buy: 'Comprou na loja',
};
export const kindLabel = kind => KIND_LABEL[kind] || kind;

const labels = list => (Array.isArray(list) ? list.map(c => c?.label).filter(Boolean) : []);
const arrow = (a, b) => `${a ?? '—'} → ${b ?? '—'}`;

// Linhas de detalhe "antes → depois" de uma entrada do histórico, por categoria. itemName(id) resolve o nome do catálogo.
// opts.raw: devolve a chave da imagem ("@euro") no lugar do símbolo de texto, para a tela trocar pela imagem (RichIcons).
export function auditDetails(entry, itemName = id => id, opts = {}) {
  const b = entry?.before, a = entry?.after;
  const iconText = opts.raw ? (icon, fb) => icon || fb : iconTextPlain;
  switch (entry?.category) {
    case 'money': return [['Dinheiro', arrow(b?.money, a?.money)]];
    case 'xp': return [['XP', arrow(b?.xp, a?.xp)], ...(Number.isFinite(a?.xp) ? [['Nível', arrow(Math.floor((b?.xp ?? 0) / 5), Math.floor(a.xp / 5))]] : [])];
    case 'item':
      if (entry.kind === 'shop_buy') {
        return [[a?.name || itemName(a?.item) || 'Item', `quantidade ${arrow(b?.qty, a?.qty)} (comprou ${a?.bought} por ${a?.total} ${iconText(a?.symbol, DEFAULT_CURRENCY_ICON)})`],
          [`Carteira ${iconText(a?.symbol, DEFAULT_CURRENCY_ICON)} ${a?.currency_name || ''}`.trim(), arrow(b?.wallet, a?.wallet)]];
      }
      if (entry.kind?.startsWith('shop_')) {
        const m = x => (x ? `${x.price} ${iconText(x.symbol, DEFAULT_CURRENCY_ICON)}${x.active === false ? ' (pausado)' : ''}`.trim() : null);
        return [['Item da loja', a?.name || b?.name || '—'], ['Preço', arrow(m(b), m(a))]];
      }
      return [[a?.name || itemName(a?.item) || 'Item', `quantidade ${arrow(b?.qty, a?.qty)}${a?.given ? ` (entregues ${a.given})` : ''}`]];
    case 'wallet': return [[`${iconText(a?.symbol || b?.symbol, DEFAULT_CURRENCY_ICON)} ${a?.name || b?.name || 'Moeda'}`.trim(), arrow(b?.amount, a?.amount)]];
    case 'experience':
      if (entry.kind?.startsWith('type_')) return [['Tipo', arrow(b?.name || b?.type?.name, a?.name || a?.type?.name)], ...(b?.counters?.length ? [['Valores apagados', `${b.counters.length} personagem(ns)`]] : [])];
      return [[`${iconText(a?.icon || b?.icon)} ${a?.name || b?.name || 'Experiência'}`.trim(), arrow(b?.amount, a?.amount)]];
    case 'currency': {
      const bc = b?.currency || b, ac = a?.currency || a;
      return [['Moeda', arrow(bc?.name, ac?.name)], ...(ac?.symbol || bc?.symbol ? [['Símbolo', arrow(bc?.symbol, ac?.symbol)]] : []),
        ...(b?.wallets?.length ? [['Saldos apagados', `${b.wallets.length} carteira(s)`]] : [])];
    }
    case 'condition': return [['Condições', `${labels(b?.conditions).join(', ') || 'nenhuma'} → ${labels(a?.conditions).join(', ') || 'nenhuma'}`]];
    default: return [];
  }
}

// Resumo de uma linha: "Somou · Aria · Dinheiro: 500 → 600".
export function auditTitle(entry, characterName, itemName = id => id, opts = {}) {
  // O servidor não conhece o catálogo de itens: o nome do item é resolvido aqui.
  const summary = entry?.category === 'item' && entry.kind === 'give' && entry.after
    ? `Entregou ${entry.after.given ?? ''}× ${entry.after.name || itemName(entry.after.item)}`.replace(' ×', '×')
    : (opts.raw ? String(entry?.summary ?? '') : cleanIconKeys(entry?.summary));
  return [kindLabel(entry?.kind), characterName, summary].filter(Boolean).join(' · ');
}

// ---------- o que cada personagem mostra (carteira e experiências) ----------
// Experiências personalizadas são PÚBLICAS na mesa (como o XP); a carteira de moedas só o dono e o mestre recebem (a RLS filtra).
// Devolvem só o que tem valor: [{ key, text, title, amount }].
export const experienceChips = (extras, id) => (extras?.types || []).map(t => {
  const amount = extras.experience?.[id]?.[t.id] || 0;
  return { key: `t${t.id}`, icon: t.icon, label: `${t.name} ${amount}`, text: `${iconText(t.icon)} ${t.name} ${amount}`, title: t.description || t.name, amount };
}).filter(h => h.amount > 0);
export const walletChips = (extras, id) => (extras?.currencies || []).map(c => {
  const amount = extras.wallets?.[id]?.[c.id] || 0;
  return { key: `c${c.id}`, icon: c.symbol, label: String(amount), text: `${iconText(c.symbol, DEFAULT_CURRENCY_ICON)} ${amount}`, title: c.name, amount };
}).filter(h => h.amount > 0);
