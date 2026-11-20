import { drawToken, canvasToBlob } from './tokenArt.js';
import { TOKEN_SIZE } from '../../lib/tokens.js';

const MAX_BLOB_BYTES = 900 * 1024;
const REDUCED_SCALE = 0.7;

// PNG final do token. O bucket aceita 1 MB: se a foto deixou o arquivo pesado, desenha de novo em tamanho menor.
export async function renderTokenBlob(design, image) {
  const out = document.createElement('canvas');
  drawToken(out, TOKEN_SIZE, design, image);
  const blob = await canvasToBlob(out);
  if (blob.size <= MAX_BLOB_BYTES) return blob;
  drawToken(out, Math.round(TOKEN_SIZE * REDUCED_SCALE), design, image);
  return canvasToBlob(out);
}
