// Estado "público" dos tokens de criatura: nome oculto e efeitos (envenenada, atordoada…).
//
// Nome oculto: o servidor guarda o nome e a imagem reais numa tabela só do mestre (board_token_secrets) e deixa
// name = '' e image_path = null na linha do token que os jogadores leem (migração 0034). Aqui ficam as regras puras
// que o navegador usa: o que mostrar a cada espectador e como o mestre recompõe os valores reais.

export const HIDDEN_NAME = '?';
export const MAX_EFFECTS = 8;
export const MAX_EFFECT_LABEL = 24;
export const FREE_EFFECT_ICON = '✦';

// Efeitos prontos (o mestre ainda pode escrever um texto livre curto).
export const EFFECT_PRESETS = [
  { id: 'poison', label: 'Envenenada', icon: '☠️' },
  { id: 'stun', label: 'Atordoada', icon: '💫' },
  { id: 'burn', label: 'Em chamas', icon: '🔥' },
  { id: 'bleed', label: 'Sangrando', icon: '🩸' },
  { id: 'freeze', label: 'Congelada', icon: '❄️' },
  { id: 'paralyze', label: 'Paralisada', icon: '⛓️' },
  { id: 'sleep', label: 'Dormindo', icon: '💤' },
  { id: 'fear', label: 'Assustada', icon: '😱' },
  { id: 'charm', label: 'Enfeitiçada', icon: '💜' },
  { id: 'blind', label: 'Cega', icon: '🙈' },
];
const presetById = Object.fromEntries(EFFECT_PRESETS.map(p => [p.id, p]));

const cleanLabel = text => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_EFFECT_LABEL);
const sameLabel = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
let seq = 0;
const newId = () => `e${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// Lê a coluna `effects` do token de forma defensiva: só entradas { id, label, icon } válidas, sem repetir texto.
export function effectsOf(token) {
  const raw = token?.effects;
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw) {
    const label = cleanLabel(e?.label);
    if (!label || out.some(x => sameLabel(x.label, label))) continue;
    out.push({ id: typeof e.id === 'string' && e.id ? e.id.slice(0, 40) : newId(), label, icon: typeof e.icon === 'string' && e.icon ? e.icon.slice(0, 8) : FREE_EFFECT_ICON });
    if (out.length >= MAX_EFFECTS) break;
  }
  return out;
}

// Acrescenta um efeito: { preset: 'poison' } para um dos prontos ou { label: 'Texto livre' }. Devolve a mesma lista
// (sem mudança) se o texto for vazio, repetido ou a lista já estiver cheia.
export function addEffect(effects, input) {
  const list = effectsOf({ effects });
  const preset = input?.preset ? presetById[input.preset] : null;
  const label = preset ? preset.label : cleanLabel(input?.label);
  if (!label || list.length >= MAX_EFFECTS || list.some(e => sameLabel(e.label, label))) return list;
  return [...list, { id: preset ? preset.id : newId(), label, icon: preset ? preset.icon : FREE_EFFECT_ICON }];
}

export const removeEffect = (effects, id) => effectsOf({ effects }).filter(e => e.id !== id);

// Selos mostrados no token do tabuleiro: os primeiros `max` e quantos ficaram de fora.
export function effectBadges(effects, max = 3) {
  const list = effectsOf({ effects });
  return { shown: list.slice(0, max), extra: Math.max(0, list.length - max), all: list.map(e => e.label).join(', ') };
}

export const isNameHidden = token => token?.name_hidden === true;

// Nome mostrado a este espectador: jogadores veem "?" enquanto o nome estiver oculto; o mestre sempre vê o real.
export function displayName(token, isGm, fallback = '') {
  if (isNameHidden(token) && !isGm) return HIDDEN_NAME;
  return token?.name || fallback;
}

// A foto também some para os jogadores (o servidor já a esvazia; isto cobre uma linha ainda em cache no navegador).
export const imageVisible = (token, isGm) => isGm || !isNameHidden(token);

// Mestre: junta os valores reais (linhas de board_token_secrets) aos tokens que vieram em branco.
export function mergeSecrets(tokens, secrets) {
  const byId = new Map((secrets || []).map(s => [s.token_id, s]));
  if (!byId.size) return tokens;
  return tokens.map(t => {
    const s = isNameHidden(t) ? byId.get(t.id) : null;
    return s ? { ...t, name: t.name || s.name || '', image_path: t.image_path || s.image_path || null } : t;
  });
}

// Realtime: o evento de um token oculto chega em branco; o mestre mantém o nome e a imagem que já tinha.
export function applyTokenRow(prev, row) {
  const old = prev.find(x => x.id === row.id);
  if (!old) return [...prev, row];
  const keep = isNameHidden(row) && old.name_hidden === true;
  const merged = { ...old, ...row, ...(keep && !row.name && old.name ? { name: old.name } : {}), ...(keep && !row.image_path && old.image_path ? { image_path: old.image_path } : {}) };
  return prev.map(x => (x.id === row.id ? merged : x));
}
