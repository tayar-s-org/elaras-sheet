import React, { useState } from 'react';

const KEY = 'elara-soundbar-min';
const readMin = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

// Soundpad na tela da mesa: o mestre vê os botões dos sons; todos têm o volume dos efeitos.
export default function SoundBar({ pad, isGm }) {
  const { sounds, active, vol, setVol, play, stop, stopAll } = pad;
  const [minimized, setMinimized] = useState(readMin);
  const toggle = () => setMinimized(v => {
    try { localStorage.setItem(KEY, v ? '0' : '1'); } catch { /* sem storage */ }
    return !v;
  });
  if (!sounds.length) return null;
  // Minimizada: sobra só uma faixa pequena para reabrir (e o aviso de quantos efeitos estão tocando).
  if (minimized) {
    return <div className="sfx-bar sfx-min" role="group" aria-label="Efeitos sonoros (minimizado)">
      <button type="button" className="quiet" aria-expanded="false" onClick={toggle}>▸ Efeitos sonoros{active.length ? ` · ${active.length} tocando` : ''}</button>
    </div>;
  }
  return <div className="sfx-bar" role="group" aria-label="Efeitos sonoros">
    {isGm && <div className="sfx-pads">
      {sounds.map(s => {
        const on = active.includes(s.id);
        return <button key={s.id} type="button" className={on ? 'primary' : 'outline'} aria-pressed={on}
          title={s.loop ? 'Ambiente em repetição: clique de novo para parar' : 'Clique para tocar'}
          onClick={() => (on && s.loop ? stop(s.id) : play(s.id))}>{s.loop ? '↻ ' : ''}{s.name}</button>;
      })}
      <button type="button" className="text-button danger" disabled={!active.length} onClick={stopAll}>Parar efeitos</button>
    </div>}
    <button type="button" className="quiet sfx-toggle" aria-expanded="true" title="Minimizar a janela de sons" aria-label="Minimizar a janela de sons" onClick={toggle}>▾ Minimizar</button>
    <span className="music-volume">
      <span className="muted">Efeitos</span>
      <button type="button" className="quiet" aria-pressed={vol.muted} onClick={() => setVol(v => ({ ...v, muted: !v.muted }))}>{vol.muted ? 'Som off' : 'Som on'}</button>
      <input type="range" min="0" max="1" step="0.05" value={vol.volume} aria-label="Volume dos efeitos"
        onChange={e => setVol({ volume: Number(e.target.value), muted: false })} />
    </span>
  </div>;
}
