// Enquadramento da imagem dentro do token: zoom, rotação e deslocamento (x/y em fração do lado, de -1 a 1).
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 4;
export const FRAMING_RESET = { zoom: 1, x: 0, y: 0, rotate: 0, flip: false };

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clampOffset = value => clamp(value, -1, 1);

export const draggedOffset = (start, deltaPx, sidePx) => clampOffset(start + deltaPx / sidePx);
export const wheelZoom = (zoom, deltaY) => clamp(zoom * (deltaY < 0 ? 1.06 : 0.94), ZOOM_MIN, ZOOM_MAX);

// Os campos de posição trabalham em porcentagem inteira (-100 a 100), para o teclado mover de 1 em 1.
export const offsetToPercent = offset => Math.round(clampOffset(offset) * 100);
export const offsetFromPercent = percent => clampOffset(Number(percent) / 100);

// O eixo y do desenho cresce para baixo, mas o controle deslizante precisa subir com a seta para cima: o vertical é invertido.
export const verticalToPercent = offset => offsetToPercent(-offset) + 0; // + 0 evita -0
export const verticalFromPercent = percent => offsetFromPercent(-percent) + 0;
