import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSounds } from '../../lib/sounds.js';
import { musicUrl } from '../../lib/music.js';

const KEY = 'manrakora-sfx-volume';
const loadVolume = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return { volume: Math.min(1, Math.max(0, Number(v?.volume ?? 0.8))), muted: Boolean(v?.muted) }; } catch { return { volume: 0.8, muted: false }; }
};

// Soundpad: lista de sons da mesa e reprodução. O mestre toca (e avisa todos por broadcast); cada um ouve no próprio volume.
export default function useSoundpad(room, tableId, isGm) {
  const [sounds, setSounds] = useState([]);
  const [active, setActive] = useState([]);
  const [vol, setVol] = useState(loadVolume);
  const soundsRef = useRef([]);
  const volRef = useRef(vol);
  const urls = useRef(new Map());
  const audios = useRef(new Map());
  soundsRef.current = sounds;
  volRef.current = vol;
  const { onBroadcast, sendBroadcast, ready } = room;

  const reload = useCallback(async () => {
    try { const list = await loadSounds(tableId); setSounds(list); soundsRef.current = list; return list; } catch { return soundsRef.current; }
  }, [tableId]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(vol)); } catch { /* sem armazenamento */ }
    audios.current.forEach(a => { a.volume = vol.volume; a.muted = vol.muted; });
  }, [vol]);

  const end = useCallback(id => {
    const a = audios.current.get(id);
    if (a) { a.pause(); audios.current.delete(id); }
    setActive(prev => prev.filter(x => x !== id));
  }, []);

  const startLocal = useCallback(async id => {
    let sound = soundsRef.current.find(s => s.id === id);
    if (!sound) sound = (await reload()).find(s => s.id === id);
    if (!sound) return;
    end(id);
    let url = urls.current.get(sound.path);
    if (!url) { url = await musicUrl(sound.path); urls.current.set(sound.path, url); }
    const a = new Audio(url);
    a.loop = sound.loop;
    a.volume = volRef.current.volume;
    a.muted = volRef.current.muted;
    a.onended = () => end(id);
    audios.current.set(id, a);
    setActive(prev => (prev.includes(id) ? prev : [...prev, id]));
    a.play().catch(() => end(id));
  }, [end, reload]);

  const stopAllLocal = useCallback(() => { [...audios.current.keys()].forEach(end); }, [end]);

  useEffect(() => onBroadcast('sound', p => {
    if (p?.action === 'play') startLocal(p.id); else if (p?.action === 'stop') end(p.id); else if (p?.action === 'stopAll') stopAllLocal();
  }), [onBroadcast, startLocal, end, stopAllLocal]);
  useEffect(() => onBroadcast('sounds_refresh', () => { reload(); }), [onBroadcast, reload]);
  useEffect(() => () => { audios.current.forEach(a => a.pause()); audios.current.clear(); }, []);

  // Ações do mestre: tocam aqui e avisam a mesa.
  const play = useCallback(id => { if (!isGm) return; sendBroadcast('sound', { id, action: 'play' }); startLocal(id); }, [isGm, sendBroadcast, startLocal]);
  const stop = useCallback(id => { if (!isGm) return; sendBroadcast('sound', { id, action: 'stop' }); end(id); }, [isGm, sendBroadcast, end]);
  const stopAll = useCallback(() => { if (!isGm) return; sendBroadcast('sound', { action: 'stopAll' }); stopAllLocal(); }, [isGm, sendBroadcast, stopAllLocal]);
  const changed = useCallback(async () => { await reload(); sendBroadcast('sounds_refresh', {}); }, [reload, sendBroadcast]);

  return { sounds, active, vol, setVol, play, stop, stopAll, changed };
}
