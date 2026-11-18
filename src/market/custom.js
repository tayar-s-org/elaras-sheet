// Item customizado: criado pelo jogador, aprovado pelo mestre da mesa e guardado dentro da ficha (self-contained).
// Efeitos: bônus nas rolagens de um atributo ou perícia, ou bônus em valores derivados da ficha.

export const MAX_BONUS = 6;
export const MAX_EFFECTS = 5;
export const MAX_NAME = 80;
export const MAX_DESCRIPTION = 1000;
export const MAX_WEIGHT = 500;
export const MAX_DAMAGE = 30;

// Dano de arma (ex.: "For+d6", "2d6+1"): guardado na mesma lista de efeitos como { kind: 'damage', target: texto, bonus: 0 },
// o que dispensa uma coluna nova no banco. Só uma entrada de dano por item e ela não conta no limite de efeitos.
export const DAMAGE_TEXT = /^[\p{L}0-9+\-−*/() ]{1,30}$/u;
export const cleanDamage = raw => {
  const t = String(raw || '').trim().replace(/\s+/g, ' ');
  return DAMAGE_TEXT.test(t) ? t : '';
};
export const damageOf = item => item?.effects?.find(e => e.kind === 'damage')?.target || '';

// Valores derivados da ficha que um item pode alterar (somados automaticamente quando equipado).
export const DERIVED = {
  armor: 'Resistência (armadura)',
  parry: 'Aparar',
  movement: 'Movimento',
  mana: 'Mana máxima',
};

export const CUSTOM_ID = /^custom-[0-9a-f-]{36}$/;
export const customId = rowId => `custom-${rowId}`;
export const isCustomId = id => CUSTOM_ID.test(String(id || ''));

const int = v => Math.trunc(Number(v));

// lists: { attributes: [nomes], skills: [nomes] } (vem de rules.js para evitar import circular).
export function sanitizeEffects(raw, lists) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const damage = cleanDamage(raw.find(e => e?.kind === 'damage')?.target);
  if (damage) out.push({ kind: 'damage', target: damage, bonus: 0 });
  for (const e of raw.slice(0, MAX_EFFECTS * 3)) {
    if (e?.kind === 'damage') continue;
    const bonus = int(e?.bonus);
    if (!Number.isFinite(bonus) || bonus === 0 || Math.abs(bonus) > MAX_BONUS) continue;
    const kind = e?.kind;
    const target = String(e?.target || '');
    const ok = (kind === 'attribute' && lists.attributes.includes(target))
      || (kind === 'skill' && lists.skills.includes(target))
      || (kind === 'derived' && Object.hasOwn(DERIVED, target));
    if (ok) out.push({ kind, target, bonus });
    if (out.filter(x => x.kind !== 'damage').length >= MAX_EFFECTS) break;
  }
  return out;
}

// Devolve o item limpo ou null se não for válido.
export function sanitizeCustom(raw, lists) {
  const name = String(raw?.name || '').trim().slice(0, MAX_NAME);
  if (!name) return null;
  const weight = Math.min(MAX_WEIGHT, Math.max(0, Math.round((Number(raw?.weight) || 0) * 100) / 100));
  return {
    name,
    weight,
    effects: sanitizeEffects(raw?.effects, lists),
    description: String(raw?.description || '').slice(0, MAX_DESCRIPTION),
  };
}

// Linha da tabela de itens aprovados -> entrada da mochila da ficha.
export const customEntry = (row, lists) => {
  const custom = sanitizeCustom(row, lists);
  return custom ? { id: customId(row.id), custom, qty: 1, equipped: false } : null;
};

export function describeEffect(e) {
  if (e.kind === 'damage') return `Dano ${e.target}`;
  const sign = e.bonus > 0 ? `+${e.bonus}` : `−${Math.abs(e.bonus)}`;
  if (e.kind === 'derived') return `${sign} em ${DERIVED[e.target]}`;
  return `${sign} nas rolagens de ${e.target}`;
}
