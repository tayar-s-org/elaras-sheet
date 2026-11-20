import { claimXp } from '../../lib/xp.js';
import { claimMoney } from '../../lib/money.js';
import { addMoney, formatMoney } from '../../money.js';

const MAX_XP = 1000000;

// XP que ainda estava na fila do servidor (loja, treino…) entra na ficha; o autosave envia.
// O servidor já marcou o valor como recebido: aplica sempre, mesmo se o ciclo foi cancelado (só o aviso depende disso).
export async function claimXpForSheet({ editCharacter, notify }, sheet) {
  const gained = await claimXp(sheet.cloud.id);
  if (gained <= 0) return;
  editCharacter(sheet.id, ch => ({ ...ch, xp: Math.min(MAX_XP, ch.xp + gained) }));
  const before = Math.floor(sheet.character.xp / 5);
  const after = Math.floor(Math.min(MAX_XP, sheet.character.xp + gained) / 5);
  const levelUp = after > before ? ` Subiu para o nível ${after}: +${(after - before) * 2} pontos de progressão!` : '';
  notify(`${sheet.character.name || 'Sua ficha'} recebeu ${gained} XP do mestre.${levelUp}`);
}

// Dinheiro que ainda estava na fila do servidor (positivo ou negativo) entra na ficha, mesmo se o ciclo foi cancelado.
export async function claimMoneyForSheet({ editCharacter, notify }, sheet) {
  const gained = await claimMoney(sheet.cloud.id);
  if (gained === 0) return;
  editCharacter(sheet.id, ch => ({ ...ch, money: addMoney(ch.money, gained) }));
  const owner = sheet.character.name ? ` de ${sheet.character.name}` : '';
  notify(gained > 0
    ? `💰 Você recebeu $${formatMoney(gained)} do mestre${sheet.character.name ? ` para ${sheet.character.name}` : ''}.`
    : `💸 O mestre removeu $${formatMoney(-gained)}${owner}. Saldo: $${formatMoney(addMoney(sheet.character.money, gained))}.`);
}
