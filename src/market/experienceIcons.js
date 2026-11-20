// Ícones da Central: só as imagens embutidas, em dois conjuntos — tipos de experiência e moedas. O registro guarda a CHAVE da imagem
// (começa com "@", até 8 caracteres, limite do banco). As imagens ficam em public/assets/experience/ e public/assets/currency/ (128 px).
// Registros antigos com emoji/símbolo continuam aparecendo (iconText).
const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';

export const IMAGE_ICONS = [ // experiências
  { key: '@fita', label: 'Fita', dir: 'experience', file: 'reputacao-1.png' },
  { key: '@placar', label: 'Placar', dir: 'experience', file: 'reputacao-2.png' },
  { key: '@trofeu', label: 'Troféu', dir: 'experience', file: 'reputacao-3.png' },
  { key: '@selo', label: 'Selo', dir: 'experience', file: 'reputacao-4.png' },
  { key: '@xp', label: 'XP', dir: 'experience', file: 'xp.png' },
];
export const CURRENCY_ICONS = [ // moedas
  { key: '@cedula', label: 'Cédulas', dir: 'currency', file: 'dinheiro.png' },
  { key: '@euro', label: 'Euro', dir: 'currency', file: 'euros.png' },
  { key: '@lingote', label: 'Lingote', dir: 'currency', file: 'lingote-de-ouro.png' },
  { key: '@chines', label: 'Moeda chinesa', dir: 'currency', file: 'moeda-chinesa.png' },
  { key: '@maco', label: 'Maço de notas', dir: 'currency', file: 'papel-moeda.png' },
];
export const ALL_ICONS = [...IMAGE_ICONS, ...CURRENCY_ICONS];

export const DEFAULT_ICON = '★';
export const DEFAULT_CURRENCY_ICON = '¤';
const byKey = Object.fromEntries(ALL_ICONS.map(i => [i.key, i]));

export const isImageIcon = icon => Object.prototype.hasOwnProperty.call(byKey, icon);
export const imageIconUrl = icon => (isImageIcon(icon) ? `${BASE}assets/${byKey[icon].dir}/${byKey[icon].file}` : null);
export const imageIconLabel = icon => byKey[icon]?.label || '';
// Para lugares só de texto (listas suspensas, confirmações, histórico): a imagem vira um símbolo (padrão ★; moedas usam ¤).
export const iconText = (icon, fallback = DEFAULT_ICON) => (isImageIcon(icon) ? fallback : icon || fallback);
// Textos vindos do servidor (resumos do histórico) podem trazer a chave crua ("@euro"): troca pelo símbolo de texto.
export const cleanIconKeys = text => String(text ?? '').replace(/@[a-z]{2,7}\b/g, m => (isImageIcon(m) ? (byKey[m].dir === 'currency' ? DEFAULT_CURRENCY_ICON : DEFAULT_ICON) : m));
