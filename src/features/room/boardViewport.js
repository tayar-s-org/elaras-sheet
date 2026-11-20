import { boardGrid } from '../../boardGrid.js';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Mantem o valor dentro do tabuleiro; se o token e maior que a extensao, fica no centro.
export const keepIn = (v, half, max) => (max <= half * 2 ? max / 2 : clamp(v, half, max - half));

// Medidas do tabuleiro (padrao 2000x1400) e do token: o token inteiro (nao so o centro) fica dentro do tabuleiro.
// Tokens de criatura têm o mesmo tamanho dos de jogador (o mestre pode ajustar o `size` de cada um no módulo do mestre).
export function boardGeometry(board) {
  const grid = boardGrid(board?.grid);
  const tokenScale = clamp(Number(board?.settings?.tokenScale) || 1.25, 0.5, 3);
  const tokenUnit = t => grid.size * t.size * tokenScale;
  return { W: board?.width || 2000, H: board?.height || 1400, grid, gsize: grid.size, tokenUnit, tokenHalf: t => tokenUnit(t) / 2 };
}

// A visao { x, y, w } e em unidades do mapa; `ratio` = altura/largura do SVG na tela.
export const fitWidth = (W, H, ratio) => Math.max(W, H / ratio);

export function constrainView(view, W, H, ratio) {
  if (!view) return view;
  const width = clamp(view.w, W / 8, fitWidth(W, H, ratio));
  const height = width * ratio;
  return { w: width, x: width >= W ? (W - width) / 2 : clamp(view.x, 0, W - width),
    y: height >= H ? (H - height) / 2 : clamp(view.y, 0, H - height) };
}

// Reajusta a visao quando a proporcao do SVG muda (janela redimensionada, painel aberto), mantendo o centro.
export function refitView(view, W, H, previousRatio, ratio) {
  const w = view.w * fitWidth(W, H, ratio) / fitWidth(W, H, previousRatio);
  return constrainView({ w, x: view.x + (view.w - w) / 2, y: view.y + (view.w * previousRatio - w * ratio) / 2 }, W, H, ratio);
}

// Zoom que mantem o ponto `point` (em unidades do mapa) parado na tela, como a roda do mouse.
export function zoomAroundPoint(view, point, factor, W, H, ratio) {
  const w = clamp(view.w * factor, W / 8, fitWidth(W, H, ratio));
  const k = w / view.w;
  return { w, x: point.x - (point.x - view.x) * k, y: point.y - (point.y - view.y) * k };
}

export function zoomAroundCenter(view, factor, W, H, ratio) {
  const w = clamp(view.w * factor, W / 8, fitWidth(W, H, ratio));
  const cx = view.x + view.w / 2, cy = view.y + (view.w * ratio) / 2;
  return { w, x: cx - w / 2, y: cy - (w * ratio) / 2 };
}

// Visao de mesma largura centrada no ponto (usada para ir ate um token).
export function centerViewOn(view, point, W, ratio) {
  const width = view?.w || W;
  return { w: width, x: point.x - width / 2, y: point.y - width * ratio / 2 };
}
