import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSounds } from '../../lib/sounds.js';
import { musicUrl } from '../../lib/music.js';
import { DEFAULT_SOUNDS } from '../../defaultSounds.js';
import { createOperationGuard } from '../../operationGuard.js';

const KEY = 'manrakora-sfx-volume';
const loadVolume = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return { volume: Math.min(1, Math.max(0, Number(v?.volume ?? 0.8))), muted: Boolean(v?.muted) }; } catch { return { volume: 0.8, muted: false }; }
};

// Soundpad: lista de sons da mesa e reprodução. O mestre toca (e avisa todos por broadcast); cada um ouve no próprio volume.
export default function useSoundpad(room, tableId, isGm) {
  const [custom, setCustom] = useState([]);
  const [active, setActive] = useState([]);
  const [vol, setVol] = useState(loadVolume);
  const [error, setError] = useState('');
  const [operations] = useState(createOperationGuard);
  const soundsRef = useRef([]);
  const volRef = useRef(vol);
  const audios = useRef(new Map());
  const sounds = [...DEFAULT_SOUNDS, ...custom];
  soundsRef.current = sounds;
  volRef.current = vol;
  const { onBroadcast, sendBroadcast, ready } = room;

  const reload = useCallback(async () => {
    try { const list = await loadSounds(tableId); setCustom(list); soundsRef.current = [...DEFAULT_SOUNDS, ...list]; return soundsRef.current; } catch { return soundsRef.current; }
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

  // Cada pedido de tocar pega um token: depois dos awaits só segue se nenhum parar/tocar de novo/sair da tela o invalidou.
  const startLocal = useCallback(async id => {
    const token = operations.begin(id);
    setError('');
    try {
      const sound = soundsRef.current.find(s => s.id === id) ?? (await reload()).find(s => s.id === id);
      if (!sound) return;
      const url = sound.url || await musicUrl(sound.path);
      if (!operations.isCurrent(token)) return;
      end(id);
      const a = new Audio(url);
      a.loop = sound.loop;
      a.volume = volRef.current.volume;
      a.muted = volRef.current.muted;
      a.onended = () => end(id);
      audios.current.set(id, a);
      setActive(prev => (prev.includes(id) ? prev : [...prev, id]));
      a.play().catch(() => { if (audios.current.get(id) === a) end(id); });
    } catch (e) {
      if (operations.isCurrent(token)) setError(e.message);
    }
  }, [operations, end, reload]);

  const cancel = useCallback(id => { operations.cancel(id); end(id); }, [operations, end]);
  const stopAllLocal = useCallback(() => { operations.cancelAll(); [...audios.current.keys()].forEach(end); }, [operations, end]);

  useEffect(() => onBroadcast('sound', p => {
    if (p?.action === 'play') startLocal(p.id); else if (p?.action === 'stop') cancel(p.id); else if (p?.action === 'stopAll') stopAllLocal();
  }), [onBroadcast, startLocal, cancel, stopAllLocal]);
  useEffect(() => onBroadcast('sounds_refresh', () => { reload(); }), [onBroadcast, reload]);
  useEffect(() => () => { operations.cancelAll(); audios.current.forEach(a => a.pause()); audios.current.clear(); }, [operations]);

  // Ações do mestre: tocam aqui e avisam a mesa.
  const play = useCallback(id => { if (!isGm) return; sendBroadcast('sound', { id, action: 'play' }); startLocal(id); }, [isGm, sendBroadcast, startLocal]);
  const stop = useCallback(id => { if (!isGm) return; sendBroadcast('sound', { id, action: 'stop' }); cancel(id); }, [isGm, sendBroadcast, cancel]);
  const stopAll = useCallback(() => { if (!isGm) return; sendBroadcast('sound', { action: 'stopAll' }); stopAllLocal(); }, [isGm, sendBroadcast, stopAllLocal]);
  const changed = useCallback(async () => { await reload(); sendBroadcast('sounds_refresh', {}); }, [reload, sendBroadcast]);

  return { sounds, custom, active, vol, setVol, play, stop, stopAll, changed, error };
}
