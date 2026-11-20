import { useState } from 'react';
import { updateToken } from '../../lib/board.js';
import { snapInsideGrid } from '../../boardGrid.js';
import { keepIn } from './boardViewport.js';

// Mover o token selecionado uma celula por botao (alternativa ao arraste, tambem para teclado e leitor de tela).
export function useStepMove({ geometry, canMove, gesture, local, setError, tokenLabel }) {
  const { W, H, grid, gsize, tokenHalf } = geometry;
  const [movingToken, setMovingToken] = useState(false);
  const [moveNotice, setMoveNotice] = useState('');

  async function moveSelected(token, dx, dy, direction) {
    if (movingToken || gesture.current || !canMove(token)) return;
    const half = tokenHalf(token);
    const x = grid.snap ? snapInsideGrid(token.x + dx * gsize, gsize, grid.x, half, W) : token.x + dx * gsize;
    const y = grid.snap ? snapInsideGrid(token.y + dy * gsize, gsize, grid.y, half, H) : token.y + dy * gsize;
    const next = {
      x: dx ? keepIn(x, half, W) : token.x,
      y: dy ? keepIn(y, half, H) : token.y,
    };
    if (next.x === token.x && next.y === token.y) {
      setMoveNotice('O token chegou ao limite do mapa.');
      return;
    }
    setMovingToken(true);
    setError('');
    setMoveNotice('');
    try {
      await updateToken(token.id, next);
      local.setTokens(prev => prev.map(t => t.id === token.id ? { ...t, ...next } : t));
      setMoveNotice(`${tokenLabel(token)}: movido para ${direction}.`);
    } catch (err) {
      setError(err.message);
      local.reloadItems();
    } finally {
      setMovingToken(false);
    }
  }

  return { movingToken, moveNotice, clearMoveNotice: () => setMoveNotice(''), moveSelected };
}
