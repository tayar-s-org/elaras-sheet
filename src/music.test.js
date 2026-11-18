import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newMusic, musicTitle, musicPosition, musicFinished, playMusic, pauseMusic, stopMusic, setLoop, musicFileError, MUSIC_MAX_BYTES,
} from './music.js';

const base = () => newMusic('mesa/x.mp4', 'Taverna');

test('música nova começa parada, no início e em loop', () => {
  assert.deepEqual(base(), { path: 'mesa/x.mp4', name: 'Taverna', playing: false, startedAt: null, offset: 0, loop: true });
});

test('título vem do nome do arquivo, sem extensão e limitado', () => {
  assert.equal(musicTitle('Batalha Épica.mp4'), 'Batalha Épica');
  assert.equal(musicTitle('trilha.final.m4a'), 'trilha.final');
  assert.equal(musicTitle(''), 'Música');
  assert.equal(musicTitle(undefined), 'Música');
  assert.equal(musicTitle('a'.repeat(200) + '.mp3').length, 80);
});

test('posição: parada fica no offset; tocando soma o tempo desde o início', () => {
  assert.equal(musicPosition(null, 1000), 0);
  assert.equal(musicPosition({ ...base(), offset: 12 }, 99999), 12);                       // pausada
  const m = playMusic(base(), 10_000, 5);
  assert.equal(musicPosition(m, 10_000), 5);
  assert.equal(musicPosition(m, 14_500), 9.5);
  assert.equal(musicPosition(m, 9_000), 5);                                                // relógio atrasado nunca volta no tempo
});

test('posição com duração: loop dá a volta e sem loop para no fim', () => {
  const m = playMusic(base(), 0, 0);
  assert.equal(musicPosition(m, 125_000, 100), 25);                                        // 125 s numa faixa de 100 s
  assert.equal(musicPosition(setLoop(m, false), 125_000, 100), 100);
  assert.equal(musicPosition(m, 30_000, 0), 30);                                           // duração ainda desconhecida
});

test('fim da música sem loop é detectado só para quem está tocando', () => {
  const m = setLoop(playMusic(base(), 0, 0), false);
  assert.equal(musicFinished(m, 99_000, 100), false);
  assert.equal(musicFinished(m, 100_000, 100), true);
  assert.equal(musicFinished(playMusic(base(), 0, 0), 500_000, 100), false);               // loop nunca termina
  assert.equal(musicFinished(pauseMusic(m, 100), 500_000, 100), false);                    // pausada não "termina"
  assert.equal(musicFinished(null, 0, 100), false);
});

test('pausar guarda a posição, parar zera e tocar retoma de onde parou', () => {
  const playing = playMusic(base(), 1_000, 0);
  const paused = pauseMusic(playing, 42.5);
  assert.deepEqual([paused.playing, paused.startedAt, paused.offset], [false, null, 42.5]);
  const resumed = playMusic(paused, 50_000);
  assert.deepEqual([resumed.playing, resumed.startedAt, resumed.offset], [true, 50_000, 42.5]);
  assert.equal(musicPosition(resumed, 53_000), 45.5);
  const stopped = stopMusic(resumed);
  assert.deepEqual([stopped.playing, stopped.startedAt, stopped.offset], [false, null, 0]);
  assert.equal(stopped.path, 'mesa/x.mp4');                                                // continua carregada
  assert.equal(pauseMusic(playing, -5).offset, 0);
});

test('arquivo: aceita MP4/M4A/MP3 até 30 MB', () => {
  const f = (type, size = 1000) => ({ type, size });
  for (const ok of ['video/mp4', 'audio/mp4', 'audio/x-m4a', 'audio/mpeg']) assert.equal(musicFileError(f(ok)), null, ok);
  assert.match(musicFileError(f('audio/wav')), /MP4/);
  assert.match(musicFileError(f('image/png')), /MP4/);
  assert.match(musicFileError(f('video/mp4', MUSIC_MAX_BYTES + 1)), /30 MB/);
  assert.equal(musicFileError(f('video/mp4', MUSIC_MAX_BYTES)), null);
  assert.ok(musicFileError(null));
});
