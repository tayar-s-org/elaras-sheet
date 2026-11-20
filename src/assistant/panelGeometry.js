// Geometria do botão e do painel do assistente, sem tocar no DOM: tudo recebe o tamanho útil da janela (`vp`).
// "right"/"bottom" são distâncias, em px, até a borda direita e a inferior da janela.
export const FAB_SIZE = 62;
export const EDGE = 8;
export const DEFAULT_ANCHOR = { right: 16, bottom: 16 };
export const SHEET_MAX = 520; // abaixo disso o chat vira uma folha na base da tela e só o botão é arrastável

const PANEL_GAP = 12;
const PANEL_WIDTH = 392;
const PANEL_MAX_HEIGHT = 640;
const PANEL_MIN_HEIGHT = 320; // cabeçalho + rodapé compacto ocupam ~190px: abaixo disso quase não sobra área de mensagens
const ROOMY_ABOVE = 360;
const COMPACT_BELOW = 440; // painel mais baixo que isso esconde a faixa de assuntos para sobrar espaço às mensagens
const SHEET_HEIGHT_RATIO = 0.88; // mesma proporção do CSS (88dvh)
const SHEET_MAX_HEIGHT = 720;

export const isSheet = vp => vp.w <= SHEET_MAX;
export const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
export const clampFabPosition = (p, vp) => ({ right: clamp(p.right, EDGE, vp.w - FAB_SIZE - EDGE), bottom: clamp(p.bottom, EDGE, vp.h - FAB_SIZE - EDGE) });

function sheetLayout(vp) {
  return { style: undefined, compact: Math.min(vp.h * SHEET_HEIGHT_RATIO, SHEET_MAX_HEIGHT) < COMPACT_BELOW };
}

// Altura e lado vertical do painel: ao lado do botão (acima ou abaixo, onde há mais espaço) quando cabe com a altura mínima.
// Se nenhum lado comporta, o painel ocupa a janela inteira por cima do botão: nunca sai da tela.
function verticalPlacement(anchor, vp) {
  const spaceAbove = vp.h - anchor.bottom - FAB_SIZE;
  const spaceBelow = anchor.bottom;
  const opensAbove = spaceAbove >= ROOMY_ABOVE || spaceAbove >= spaceBelow;
  const room = (opensAbove ? spaceAbove : spaceBelow) - PANEL_GAP - EDGE;
  if (room < PANEL_MIN_HEIGHT) return { height: Math.min(PANEL_MAX_HEIGHT, vp.h - 2 * EDGE), top: EDGE, bottom: 'auto', zIndex: 41 };
  const height = Math.min(PANEL_MAX_HEIGHT, room);
  return opensAbove
    ? { height, bottom: anchor.bottom + FAB_SIZE + PANEL_GAP, top: 'auto' }
    : { height, top: vp.h - anchor.bottom + PANEL_GAP, bottom: 'auto' };
}

// Lado horizontal: o painel alinha com a borda do botão que está do lado de fora do meio da tela.
function horizontalPlacement(anchor, width, vp) {
  if (anchor.right + FAB_SIZE / 2 < vp.w / 2) return { right: clamp(anchor.right, EDGE, vp.w - width - EDGE), left: 'auto' };
  return { left: clamp(vp.w - anchor.right - FAB_SIZE, EDGE, vp.w - width - EDGE), right: 'auto' };
}

export function panelLayout(pos, vp) {
  if (isSheet(vp)) return sheetLayout(vp);
  const anchor = pos || DEFAULT_ANCHOR;
  const width = Math.min(PANEL_WIDTH, vp.w - 24);
  const vertical = verticalPlacement(anchor, vp);
  return { style: { width, ...vertical, ...horizontalPlacement(anchor, width, vp) }, compact: vertical.height < COMPACT_BELOW };
}
