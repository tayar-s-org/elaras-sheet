// Soundpad da mesa: efeitos curtos enviados pelo mestre. Regras puras (validação e nomes).
import { MUSIC_TYPES } from './music.js';

export const SOUND_MAX_BYTES = 5 * 1024 * 1024;
export const SOUND_LIMIT = 30;

export function soundFileError(file) {
  if (!file) return 'Escolha um arquivo.';
  if (!MUSIC_TYPES.includes(file.type)) return 'Use um arquivo MP3, M4A ou MP4.';
  if (file.size > SOUND_MAX_BYTES) return 'O som passa de 5 MB. Para faixas longas use a Música.';
  return null;
}

// Nome do botão a partir do arquivo: sem extensão, até 40 caracteres.
export const soundName = fileName => String(fileName || 'Som').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 40) || 'Som';

// Sons que devem estar tocando depois de um evento { id, action: 'play' | 'stop' | 'stopAll' }.
export function applySoundEvent(active, event) {
  const set = new Set(active);
  if (event?.action === 'play') set.add(event.id);
  else if (event?.action === 'stop') set.delete(event.id);
  else if (event?.action === 'stopAll') set.clear();
  return [...set];
}
