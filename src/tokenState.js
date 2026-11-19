// Estado "público" dos tokens de criatura: nome oculto e efeitos (envenenada, atordoada…).
//
// Nome oculto: o servidor guarda o nome e a imagem reais numa tabela só do mestre (board_token_secrets) e deixa
// name = '' e image_path = null na linha do token que os jogadores leem (migração 0034). Aqui ficam as regras puras
// que o navegador usa: o que mostrar a cada espectador e como o mestre recompõe os valores reais.

export const HIDDEN_NAME = '?';
export const MAX_EFFECTS = 8;
export const MAX_EFFECT_LABEL = 24;
export const FREE_EFFECT_ICON = '✦';
export const MAX_EFFECT_NOTE = 120;
export const MAX_EFFECT_DURATION = 40;

// Efeitos prontos (o mestre ainda pode escrever um texto livre curto). `label` é o rótulo das criaturas; `labelM` o dos personagens.
export const EFFECT_PRESETS = [
  { id: 'poison', label: 'Envenenada', labelM: 'Envenenado', icon: '☠️' },
  { id: 'stun', label: 'Atordoada', labelM: 'Atordoado', icon: '💫' },
  { id: 'burn', label: 'Em chamas', labelM: 'Em chamas', icon: '🔥' },
  { id: 'bleed', label: 'Sangrando', labelM: 'Sangrando', icon: '🩸' },
  { id: 'freeze', label: 'Congelada', labelM: 'Congelado', icon: '❄️' },
  { id: 'paralyze', label: 'Paralisada', labelM: 'Paralisado', icon: '⛓️' },
  { id: 'sleep', label: 'Dormindo', labelM: 'Dormindo', icon: '💤' },
  { id: 'fear', label: 'Assustada', labelM: 'Assustado', icon: '😱' },
  { id: 'charm', label: 'Enfeitiçada', labelM: 'Enfeitiçado', icon: '💜' },
  { id: 'blind', label: 'Cega', labelM: 'Cego', icon: '🙈' },
  { id: 'confused', label: 'Confusa', labelM: 'Confuso', icon: '😵' },
  { id: 'cursed', label: 'Amaldiçoada', labelM: 'Amaldiçoado', icon: '🧿' },
  { id: 'blessed', label: 'Abençoada', labelM: 'Abençoado', icon: '✨' },
  { id: 'exhausted', label: 'Exausta', labelM: 'Exausto', icon: '😮‍💨' },
  { id: 'incapacitated', label: 'Incapacitada', labelM: 'Incapacitado', icon: '🤕' },
];
const presetById = Object.fromEntries(EFFECT_PRESETS.map(p => [p.id, p]));

const cleanLabel = text => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_EFFECT_LABEL);
const cleanText = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
// Observação e duração são opcionais e só entram no efeito quando preenchidas (a duração é só um texto: não expira sozinha).
const withDetails = (e, src) => {
  const note = cleanText(src?.note, MAX_EFFECT_NOTE), duration = cleanText(src?.duration, MAX_EFFECT_DURATION);
  return { ...e, ...(note ? { note } : {}), ...(duration ? { duration } : {}) };
};
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
    out.push(withDetails({ id: typeof e.id === 'string' && e.id ? e.id.slice(0, 40) : newId(), label, icon: typeof e.icon === 'string' && e.icon ? e.icon.slice(0, 8) : FREE_EFFECT_ICON }, e));
    if (out.length >= MAX_EFFECTS) break;
  }
  return out;
}

// Acrescenta um efeito: { preset: 'poison' } para um dos prontos ou { label: 'Texto livre' }, com { note, duration } opcionais
// e { gender: 'm' } para o rótulo no masculino (personagens). Devolve a mesma lista (sem mudança) se o texto for vazio,
// repetido ou a lista já estiver cheia.
export function addEffect(effects, input) {
  const list = effectsOf({ effects });
  const preset = input?.preset ? presetById[input.preset] : null;
  const label = preset ? (input?.gender === 'm' ? preset.labelM : preset.label) : cleanLabel(input?.label);
  if (!label || list.length >= MAX_EFFECTS || list.some(e => sameLabel(e.label, label))) return list;
  return [...list, withDetails({ id: preset ? preset.id : newId(), label, icon: preset ? preset.icon : FREE_EFFECT_ICON }, input)];
}

// Condições ativas de um personagem: ficam em table_character_state.state.conditions (escritas só pelo mestre, por RPC) e usam o
// mesmo formato dos efeitos das criaturas.
export const conditionsOf = state => effectsOf({ effects: state?.conditions });

// O que o token mostra: personagem -> condições do estado da mesa; criatura -> efeitos do próprio token.
export const tokenEffects = (token, states) => (token?.character_id ? conditionsOf(states?.[token.character_id]) : effectsOf(token));

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
