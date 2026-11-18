import React from 'react';

// Soundpad na tela da mesa: o mestre vê os botões dos sons; todos têm o volume dos efeitos.
export default function SoundBar({ pad, isGm }) {
  const { sounds, active, vol, setVol, play, stop, stopAll } = pad;
  if (!sounds.length) return null;
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
    <span className="music-volume">
      <span className="muted">Efeitos</span>
      <button type="button" className="quiet" aria-pressed={vol.muted} onClick={() => setVol(v => ({ ...v, muted: !v.muted }))}>{vol.muted ? 'Som off' : 'Som on'}</button>
      <input type="range" min="0" max="1" step="0.05" value={vol.volume} aria-label="Volume dos efeitos"
        onChange={e => setVol({ volume: Number(e.target.value), muted: false })} />
    </span>
  </div>;
}
