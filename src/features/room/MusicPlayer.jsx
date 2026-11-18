import React, { useEffect, useRef, useState } from 'react';
import { updateBoard } from '../../lib/board.js';
import { musicUrl } from '../../lib/music.js';
import { musicPosition, musicFinished, playMusic, pauseMusic, stopMusic, setLoop } from '../../music.js';

const VOLUME_KEY = 'manrakora-music-volume';
const loadVolume = () => {
  try { const v = JSON.parse(localStorage.getItem(VOLUME_KEY)); return { volume: Math.min(1, Math.max(0, Number(v?.volume ?? 0.6))), muted: Boolean(v?.muted) }; } catch { return { volume: 0.6, muted: false }; }
};

// Barra de música da mesa. O estado vem de board.settings.music (igual para todos); cada um controla só o próprio volume.
// O mestre também tem tocar/pausar/parar/repetir aqui, que gravam o novo estado no tabuleiro.
export default function MusicPlayer({ board, isGm, local, setError }) {
  const music = board.settings?.music;
  const audioRef = useRef(null);
  const musicRef = useRef(music);
  musicRef.current = music;
  const [src, setSrc] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const [vol, setVol] = useState(loadVolume);

  // Link temporário do arquivo, renovado quando a música muda.
  useEffect(() => {
    let alive = true;
    setSrc(null);
    if (music?.path) musicUrl(music.path).then(u => { if (alive) setSrc(u); }).catch(e => { if (alive) setError?.(e.message); });
    return () => { alive = false; };
  }, [music?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const a = audioRef.current;
    if (a) { a.volume = vol.volume; a.muted = vol.muted; }
    try { localStorage.setItem(VOLUME_KEY, JSON.stringify(vol)); } catch { /* sem armazenamento */ }
  }, [vol]);

  // Mantém o áudio no ponto certo: ao mudar o estado, ao carregar e corrigindo desvio a cada poucos segundos.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !src) return undefined;
    const sync = hard => {
      const m = musicRef.current;
      if (!m) return;
      const dur = Number.isFinite(a.duration) ? a.duration : 0;
      if (!m.playing || musicFinished(m, Date.now(), dur)) { if (!a.paused) a.pause(); if (!m.playing && hard) a.currentTime = m.offset || 0; return; }
      const want = musicPosition(m, Date.now(), dur);
      if (hard || Math.abs(a.currentTime - want) > 1.5) a.currentTime = want;
      a.loop = m.loop;
      if (a.paused) a.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    };
    sync(true);
    const id = setInterval(() => sync(false), 4000);
    const onMeta = () => sync(true);
    a.addEventListener('loadedmetadata', onMeta);
    return () => { clearInterval(id); a.removeEventListener('loadedmetadata', onMeta); };
  }, [src, music?.playing, music?.startedAt, music?.offset, music?.loop]);

  if (!music?.path) return null;

  const save = async next => {
    setError?.('');
    const settings = { ...(board.settings || {}), music: next };
    local.setBoard({ ...board, settings });
    try { await updateBoard(board.id, { settings }); } catch (e) { setError?.(e.message); }
  };
  const playing = Boolean(music.playing);

  return <div className="music-bar" role="group" aria-label="Música da mesa">
    <audio ref={audioRef} src={src || undefined} preload="auto" loop={music.loop} />
    <span className="music-title" title={music.name}>♪ {music.name}</span>
    {isGm && <span className="music-controls">
      <button type="button" className="outline" onClick={() => save(playing ? pauseMusic(music, musicPosition(music, Date.now(), audioRef.current?.duration || 0)) : playMusic(music, Date.now(), music.offset))}>{playing ? 'Pausar' : 'Tocar'}</button>
      <button type="button" className="outline" onClick={() => save(stopMusic(music))}>Parar</button>
      <label className="check"><input type="checkbox" checked={Boolean(music.loop)} onChange={e => save(setLoop(music, e.target.checked))} /> Repetir</label>
    </span>}
    {!isGm && !playing && <span className="muted">pausada</span>}
    {playing && blocked && <button type="button" className="primary" onClick={() => audioRef.current?.play().then(() => setBlocked(false)).catch(() => {})}>Ativar som</button>}
    <span className="music-volume">
      <button type="button" className="quiet" aria-pressed={vol.muted} onClick={() => setVol(v => ({ ...v, muted: !v.muted }))}>{vol.muted ? 'Som off' : 'Som on'}</button>
      <input type="range" min="0" max="1" step="0.05" value={vol.volume} aria-label="Volume da música"
        onChange={e => setVol({ volume: Number(e.target.value), muted: false })} />
    </span>
  </div>;
}
