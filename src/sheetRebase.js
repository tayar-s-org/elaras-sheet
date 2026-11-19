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
const withoutRewards = ({ xp: _xp, money: _money, ...rest } = {}) => rest;

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
  return { character, cloud: { id: row.id, revision: row.revision, base: JSON.stringify(row.character) }, gained: rewardDelta(base, row.character) };
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
    if (fix.gained.xp !== 0 || fix.gained.money !== 0) gains.push({ sheetId: s.id, name: s.character?.name || '', before: s.character, ...fix.gained });
    return { ...s, character: fix.character, cloud: fix.cloud };
  });
  return { session: changed ? { ...session, sheets } : session, gains };
}
