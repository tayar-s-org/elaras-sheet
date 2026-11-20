import React, { useId } from 'react';
import { FRAMING_RESET, ZOOM_MIN, ZOOM_MAX, offsetToPercent, offsetFromPercent, verticalToPercent, verticalFromPercent } from './tokenFraming.js';

// Zoom, rotação e posição da imagem. Tudo operável por teclado (setas nos controles deslizantes); o arrastar com o mouse
// na pré-visualização é só um atalho.
export default function TokenFramingControls({ design, patch, disabled }) {
  const hintId = useId();
  return <>
    <label className="field"><span>Zoom</span>
      <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step="0.01" value={design.zoom} disabled={disabled} onChange={e => patch({ zoom: Number(e.target.value) })} /></label>
    <label className="field"><span>Rotação ({design.rotate}°)</span>
      <input type="range" min="-180" max="180" step="1" value={design.rotate} disabled={disabled} onChange={e => patch({ rotate: Number(e.target.value) })} /></label>
    <label className="field"><span>Posição horizontal ({offsetToPercent(design.x)}%)</span>
      <input type="range" min="-100" max="100" step="1" value={offsetToPercent(design.x)} disabled={disabled} aria-describedby={hintId}
        onChange={e => patch({ x: offsetFromPercent(e.target.value) })} /></label>
    <label className="field"><span>Posição vertical ({verticalToPercent(design.y)}%)</span>
      <input type="range" min="-100" max="100" step="1" value={verticalToPercent(design.y)} disabled={disabled} aria-describedby={hintId}
        onChange={e => patch({ y: verticalFromPercent(e.target.value) })} /></label>
    <small id={hintId} className="muted">Sem mouse: foque um controle acima e use as setas do teclado. Seta para cima sobe a imagem; seta para a direita a move para a direita.</small>
    <div className="row token-row">
      <button type="button" className="outline" disabled={disabled} aria-pressed={design.flip} onClick={() => patch({ flip: !design.flip })}>Espelhar</button>
      <button type="button" className="text-button" disabled={disabled} onClick={() => patch(FRAMING_RESET)}>Recentralizar</button>
    </div>
  </>;
}
