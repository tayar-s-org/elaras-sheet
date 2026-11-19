import React, { useState } from 'react';

const KEY = 'elara-soundbar-min';
const readMin = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

function GmSoundBar({ pad, isGm }) {
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

// Soundpad do mestre na tela da mesa (botões dos sons + volume). Jogadores não têm janela: só o SfxVolume na barra do tabuleiro.
export default function SoundBar({ pad, isGm }) {
  return isGm ? <GmSoundBar pad={pad} isGm /> : null;
}

// Volume dos efeitos sonoros para os jogadores: som ligado/desligado e controle deslizante, compacto, ao lado de "Tela cheia".
export function SfxVolume({ pad }) {
  const { vol, setVol } = pad;
  return <span className="sfx-volume" role="group" aria-label="Volume dos efeitos sonoros">
    <button type="button" className="outline" aria-pressed={vol.muted} title={vol.muted ? 'Ligar os efeitos sonoros' : 'Desligar os efeitos sonoros'}
      onClick={() => setVol(v => ({ ...v, muted: !v.muted }))}>{vol.muted ? 'Efeitos: off' : 'Efeitos: on'}</button>
    <input type="range" min="0" max="1" step="0.05" value={vol.volume} aria-label="Volume dos efeitos sonoros"
      onChange={e => setVol({ volume: Number(e.target.value), muted: false })} />
  </span>;
}
