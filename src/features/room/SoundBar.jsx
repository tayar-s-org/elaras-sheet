import React from 'react';

const SoundError = ({ error }) => error && <p role="alert" className="muted">{error}</p>;

// Botões dos sons do soundpad para o mestre (tocam para todos), parar efeitos e o volume dos efeitos.
// Ficam dentro do módulo "Soundpad" da Central do Mestre (masterHub/modules/ToolModules.jsx).
export function SoundPads({ pad }) {
  const { sounds, active, vol, setVol, play, stop, stopAll, error } = pad;
  return <div className="sfx-bar" role="group" aria-label="Efeitos sonoros">
    <div className="sfx-pads">
      {sounds.map(s => {
        const on = active.includes(s.id);
        return <button key={s.id} type="button" className={on ? 'primary' : 'outline'} aria-pressed={on}
          title={s.loop ? 'Ambiente em repetição: clique de novo para parar' : 'Clique para tocar'}
          onClick={() => (on && s.loop ? stop(s.id) : play(s.id))}>{s.loop ? '↻ ' : ''}{s.name}</button>;
      })}
      <button type="button" className="text-button danger" disabled={!active.length} onClick={stopAll}>Parar efeitos</button>
    </div>
    <SoundError error={error} />
    <span className="music-volume">
      <span className="muted">Efeitos</span>
      <button type="button" className="quiet" aria-pressed={vol.muted} onClick={() => setVol(v => ({ ...v, muted: !v.muted }))}>{vol.muted ? 'Som off' : 'Som on'}</button>
      <input type="range" min="0" max="1" step="0.05" value={vol.volume} aria-label="Volume dos efeitos"
        onChange={e => setVol({ volume: Number(e.target.value), muted: false })} />
    </span>
  </div>;
}

// Volume dos efeitos sonoros para os jogadores: som ligado/desligado e controle deslizante, compacto, ao lado de "Tela cheia".
export function SfxVolume({ pad }) {
  const { vol, setVol, error } = pad;
  return <span className="sfx-volume" role="group" aria-label="Volume dos efeitos sonoros">
    <button type="button" className="outline" aria-pressed={vol.muted} title={vol.muted ? 'Ligar os efeitos sonoros' : 'Desligar os efeitos sonoros'}
      onClick={() => setVol(v => ({ ...v, muted: !v.muted }))}>{vol.muted ? 'Efeitos: off' : 'Efeitos: on'}</button>
    <input type="range" min="0" max="1" step="0.05" value={vol.volume} aria-label="Volume dos efeitos sonoros"
      onChange={e => setVol({ volume: Number(e.target.value), muted: false })} />
    <SoundError error={error} />
  </span>;
}
