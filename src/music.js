// Música da mesa: estado de reprodução compartilhado (boards.settings.music) e cálculo da posição.
// Estado: { path, name, playing, startedAt (ms, relógio do mestre), offset (s no momento do play), loop }.
// Todos calculam a posição a partir do estado, então quem entra depois cai no ponto certo da música.

export const MUSIC_MAX_BYTES = 30 * 1024 * 1024;
export const MUSIC_TYPES = ['video/mp4', 'audio/mp4', 'audio/x-m4a', 'audio/mpeg'];
export const MUSIC_EXT = { 'video/mp4': 'mp4', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3' };

export const newMusic = (path, name) => ({ path, name, playing: false, startedAt: null, offset: 0, loop: true });

// Nome para exibir: o do arquivo, sem extensão e limitado.
export const musicTitle = fileName => String(fileName || 'Música').replace(/\.[a-z0-9]{2,4}$/i, '').trim().slice(0, 80) || 'Música';

// Posição (s) em `now` (ms). Com duration (s) conhecida, a música em loop dá a volta e a sem loop para no fim.
export function musicPosition(music, now, duration = 0) {
  if (!music) return 0;
  const base = Math.max(0, Number(music.offset) || 0);
  const elapsed = music.playing && Number.isFinite(music.startedAt) ? Math.max(0, (now - music.startedAt) / 1000) : 0;
  const pos = base + elapsed;
  if (!(duration > 0)) return pos;
  return music.loop ? pos % duration : Math.min(pos, duration);
}

export const musicFinished = (music, now, duration = 0) =>
  Boolean(music?.playing && !music.loop && duration > 0 && musicPosition(music, now, duration) >= duration);

// Transições feitas pelo mestre. `position` é a posição atual (s) lida do player dele.
export const playMusic = (music, now, position = music?.offset || 0) => ({ ...music, playing: true, startedAt: now, offset: Math.max(0, position) });
export const pauseMusic = (music, position = 0) => ({ ...music, playing: false, startedAt: null, offset: Math.max(0, position) });
export const stopMusic = music => ({ ...music, playing: false, startedAt: null, offset: 0 });
export const setLoop = (music, loop) => ({ ...music, loop: Boolean(loop) });

// Valida o arquivo escolhido; devolve a mensagem de erro ou null.
export function musicFileError(file) {
  if (!file) return 'Escolha um arquivo.';
  if (!MUSIC_TYPES.includes(file.type)) return 'Use um arquivo MP4, M4A ou MP3.';
  if (file.size > MUSIC_MAX_BYTES) return 'O arquivo passa de 30 MB.';
  return null;
}
