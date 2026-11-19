// Ficha aberta x ficha na nuvem quando SÓ o XP e o dinheiro mudaram lá (o mestre concede e o servidor aplica na ficha,
// mesmo com o app do jogador fechado). Em vez de apontar "ficha mudou em outro lugar", soma a diferença à ficha local.
import { addMoney, normalizeMoney } from './money.js';

const MAX_XP = 1000000;
const num = v => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

// JSON com chaves em ordem fixa, para comparar fichas sem depender da ordem das propriedades.
const stable = v => (Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
    : JSON.stringify(v) ?? 'null');
export const sameSheet = (a, b) => stable(a) === stable(b);
const withoutRewards = ({ xp: _xp, money: _money, inventory: _inventory, ...rest } = {}) => rest;

// ---------- Mochila: merge de 3 vias ----------
// O servidor mexe na mochila (mestre entrega, outro jogador transfere, o token gasta/ajusta) enquanto a ficha aberta também
// mexe. Em vez de apontar conflito, soma o que cada lado mudou em relação à base comum (a última versão que a ficha
// conhecia da nuvem): quantidade = local + (nuvem − base). Assim "−1 flecha na ficha" e "+5 do mestre" valem os dois.
const MAX_QTY = 99;
const byId = list => new Map((Array.isArray(list) ? list : []).filter(e => e?.id).map(e => [e.id, e]));
const fillsOf = e => (Array.isArray(e?.fills) ? e.fills : []);
const sameEntry = (a, b) => a.qty === b.qty && Boolean(a.equipped) === Boolean(b.equipped) && sameSheet(fillsOf(a), fillsOf(b));

// Níveis dos recipientes de líquido (um por unidade). Parte dos níveis locais e aplica o que a nuvem mudou:
// unidades acrescentadas, unidades retiradas (casa pelo valor, senão tira a última) e níveis alterados que o local não mexeu.
function mergeFills(baseF, localF, cloudF) {
  const out = [...localF];
  if (cloudF.length >= baseF.length) {
    baseF.forEach((was, i) => {
      if (cloudF[i] === was) return;
      if (localF.length === baseF.length) { if (localF[i] === was) out[i] = cloudF[i]; return; } // alinhado: local vence se também mexeu
      const j = out.findIndex(v => v === was);
      if (j >= 0) out[j] = cloudF[i];
    });
    out.push(...cloudF.slice(baseF.length));
  } else {
    const pool = [...cloudF];
    for (const was of baseF) {
      const k = pool.indexOf(was);
      if (k >= 0) { pool.splice(k, 1); continue; } // continua na nuvem
      const j = out.lastIndexOf(was); // foi retirada na nuvem
      out.splice(j >= 0 ? j : out.length - 1, 1);
    }
  }
  return out;
}

export function mergeInventory(base, local, cloud) {
  const b = byId(base), l = byId(local), c = byId(cloud);
  const out = [];
  for (const id of new Set([...l.keys(), ...c.keys()])) {
    const be = b.get(id), le = l.get(id), ce = c.get(id);
    if (!ce || (be && sameEntry(be, ce))) { // a nuvem não mexeu (ou nunca teve): vale o local
      if (!ce && be) { // a nuvem tirou a entrada inteira: sobra só o que o local acrescentou depois da base
        const left = (le?.qty || 0) - be.qty;
        if (le && left > 0) out.push({ ...le, qty: left, ...(le.fills ? { fills: le.fills.slice(be.qty) } : {}) });
      } else if (le) out.push(le);
      continue;
    }
    const bq = be?.qty || 0, lq = le?.qty || 0;
    let qty = Math.min(MAX_QTY, Math.max(0, lq + ce.qty - bq));
    if (!be && le && id.startsWith('custom-')) qty = Math.max(lq, ce.qty); // o mesmo item customizado entregue duas vezes não duplica
    if (qty < 1) continue;
    const entry = { ...(le || ce), qty, equipped: le && be && le.equipped !== be.equipped ? Boolean(le.equipped) : Boolean(ce.equipped) };
    if (le?.fills || ce.fills) entry.fills = mergeFills(fillsOf(be), fillsOf(le), fillsOf(ce)).slice(0, qty);
    while (entry.fills && entry.fills.length < qty) entry.fills.push(0);
    out.push(entry);
  }
  return out;
}

// O que a nuvem mudou na mochila em relação à base: [{ id, delta }] (positivo = recebeu).
export function inventoryDelta(base, cloud) {
  const b = byId(base), c = byId(cloud);
  return [...new Set([...b.keys(), ...c.keys()])]
    .map(id => ({ id, entry: c.get(id) || b.get(id), delta: (c.get(id)?.qty || 0) - (b.get(id)?.qty || 0) }))
    .filter(x => x.delta !== 0);
}

// Quanto a nuvem ganhou de XP e dinheiro em relação à base que a ficha aberta conhecia.
export const rewardDelta = (base, cloud) => ({ xp: num(cloud?.xp) - num(base?.xp), money: normalizeMoney(cloud?.money) - normalizeMoney(base?.money) });

// Ficha local (com edições ainda não salvas) + o que o mestre concedeu na nuvem. Devolve a ficha somada, ou null se a nuvem
// mudou qualquer outra coisa (aí é conflito de verdade e continua valendo o aviso de sempre).
export function mergeRewards(base, local, cloud) {
  if (!base || !local || !cloud || !sameSheet(withoutRewards(base), withoutRewards(cloud))) return null;
  const d = rewardDelta(base, cloud);
  const out = { ...local };
  if (d.xp) out.xp = Math.max(0, Math.min(MAX_XP, num(local.xp) + d.xp));
  if (d.money) out.money = addMoney(local.money, d.money);
  if (!sameSheet(base.inventory || [], cloud.inventory || [])) out.inventory = mergeInventory(base.inventory, local.inventory, cloud.inventory);
  return out;
}

// Nova situação de uma aba (character + cloud) diante da linha atual da nuvem { id, revision, character }, ou null se não dá
// para reconciliar sozinho. Aba sem edições pendentes simplesmente passa a ser a da nuvem. Aba COM edições pendentes só é
// reconciliada com { dirty: true } — use isso apenas quando o salvamento acabou de falhar por conflito de revisão: com um salvamento
// em andamento, o XP/dinheiro que a própria ficha acabou de gravar seria somado duas vezes.
export function rebaseSheet(sheet, row, { dirty = false } = {}) {
  if (!sheet?.cloud || !row || row.revision <= sheet.cloud.revision) return null;
  let base;
  try { base = JSON.parse(sheet.cloud.base); } catch { return null; }
  const clean = JSON.stringify(sheet.character) === sheet.cloud.base;
  if (!clean && !dirty) return null;
  const character = clean ? row.character : mergeRewards(base, sheet.character, row.character);
  if (!character) return null;
  return { character, cloud: { id: row.id, revision: row.revision, base: JSON.stringify(row.character) }, gained: rewardDelta(base, row.character), items: inventoryDelta(base.inventory, row.character.inventory) };
}

// Aplica rebaseSheet às abas SEM edições pendentes que têm linha nova na nuvem. gains lista quem recebeu XP ou dinheiro.
export function applyRewardSync(session, rows) {
  const gains = [];
  let changed = false;
  const sheets = session.sheets.map(s => {
    const row = s.cloud && rows.find(r => r.id === s.cloud.id);
    const fix = row && rebaseSheet(s, row);
    if (!fix) return s;
    changed = true;
    if (fix.gained.xp !== 0 || fix.gained.money !== 0 || fix.items.length) gains.push({ sheetId: s.id, name: s.character?.name || '', before: s.character, ...fix.gained, items: fix.items });
    return { ...s, character: fix.character, cloud: fix.cloud };
  });
  return { session: changed ? { ...session, sheets } : session, gains };
}
