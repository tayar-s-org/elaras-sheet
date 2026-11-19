import React, { useRef, useState } from 'react';
import Modal from '../../ui/Modal.jsx';
import { updateBoard } from '../../lib/board.js';
import { uploadMusic, removeMusicFile } from '../../lib/music.js';
import { addSound, updateSound, deleteSound } from '../../lib/sounds.js';
import { newMusic, musicTitle, musicFileError } from '../../music.js';
import { DEFAULT_SOUNDS } from '../../defaultSounds.js';
import { soundFileError, SOUND_LIMIT } from '../../soundpad.js';
import './master.css';

// Janelas do mestre para a música da mesa (botão verde) e para o soundpad (botão amarelo).
export default function AudioModal({ kind, board, pad, local, setError, onClose }) {
  const musicRef = useRef(null);
  const soundRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const music = board.settings?.music;


  const run = async fn => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const setMusic = async next => {
    const settings = { ...(board.settings || {}) };
    if (next) settings.music = next; else delete settings.music;
    local.setBoard({ ...board, settings });
    await updateBoard(board.id, { settings });
  };

  return <Modal onClose={onClose} aria-labelledby="audio-title" busy={busy}>
    <div className="modal master-module">
      <div className="row master-head">
        <h2 id="audio-title">{kind === 'music' ? 'Música da mesa' : 'Soundpad'}</h2>
        <button type="button" className="quiet" onClick={onClose}>Fechar</button>
      </div>

      {kind === 'music' && <section className="master-section" aria-labelledby="m-music">
        <h3 id="m-music">Música</h3>
        <div className="row master-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => musicRef.current.click()}>{music ? 'Trocar música' : 'Enviar música'}</button>
          {music && <button type="button" className="text-button danger" disabled={busy} onClick={() => window.confirm('Remover a música da mesa?') && run(async () => { const path = music.path; await setMusic(null); await removeMusicFile(path); })}>Remover música</button>}
          <input ref={musicRef} type="file" hidden accept="video/mp4,audio/mp4,audio/x-m4a,audio/mpeg,.mp4,.m4a,.mp3"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const bad = musicFileError(f); if (bad) { setError(bad); return; }
              run(async () => { const path = await uploadMusic(board.table_id, f, music?.path); await setMusic(newMusic(path, musicTitle(f.name))); }); }} />
        </div>
        <p className="muted">{music ? `Carregada: ${music.name}. Use a barra de música acima do tabuleiro para tocar, pausar e parar.` : 'MP4, M4A ou MP3 até 30 MB. Toca para todos na mesa ao mesmo tempo; cada um ajusta o próprio volume.'}</p>
      </section>}

      {kind === 'sound' && <section className="master-section" aria-labelledby="m-sounds">
        <h3 id="m-sounds">Efeitos sonoros</h3>
        <div className="row master-actions">
          <button type="button" className="primary" disabled={busy || pad.custom.length >= SOUND_LIMIT} onClick={() => soundRef.current.click()}>Adicionar sons</button>
          <button type="button" className="text-button danger" disabled={!pad.active.length} onClick={pad.stopAll}>Parar efeitos</button>
          <input ref={soundRef} type="file" hidden multiple accept="audio/mpeg,audio/mp4,audio/x-m4a,video/mp4,.mp3,.m4a,.mp4"
            onChange={e => { const files = [...(e.target.files || [])]; e.target.value = ''; if (!files.length) return;
              run(async () => { const errors = []; for (const f of files) { const bad = soundFileError(f); if (bad) { errors.push(`${f.name}: ${bad}`); continue; } try { await addSound(board.table_id, f); } catch (err) { errors.push(`${f.name}: ${err.message}`); } }
                await pad.changed(); if (errors.length) throw new Error(errors.join(' ')); }); }} />
        </div>
        <p className="muted">Efeitos curtos (MP3, M4A ou MP4, até 5 MB cada, {SOUND_LIMIT} por mesa). Os botões aparecem acima do tabuleiro e tocam para todos. Use só sons que você tem permissão para usar.</p>
        <p className="master-sub">Sons padrão ({DEFAULT_SOUNDS.length}) — já disponíveis nos botões acima do tabuleiro</p>
        <p className="muted">{DEFAULT_SOUNDS.map(s => s.name).join(' · ')}</p>
        <p className="master-sub">Sons da sua mesa</p>
        {!pad.custom.length && <p className="muted">Nenhum som próprio ainda.</p>}
        {pad.custom.map(s => <div key={s.id} className="sound-item">
          <input type="text" maxLength={40} defaultValue={s.name} key={`${s.id}-${s.name}`} aria-label={`Nome do som ${s.name}`}
            onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.name) run(async () => { await updateSound(s.id, { name: v }); await pad.changed(); }); }} />
          <label className="check"><input type="checkbox" checked={s.loop} onChange={e => run(async () => { await updateSound(s.id, { loop: e.target.checked }); await pad.changed(); })} /> Repetir</label>
          <button type="button" className="outline" onClick={() => (pad.active.includes(s.id) ? pad.stop(s.id) : pad.play(s.id))}>{pad.active.includes(s.id) ? 'Parar' : 'Tocar'}</button>
          <button type="button" className="text-button danger" disabled={busy} onClick={() => window.confirm(`Apagar o som ${s.name}?`) && run(async () => { pad.stop(s.id); await deleteSound(s); await pad.changed(); })}>Apagar</button>
        </div>)}
      </section>}
    </div>
  </Modal>;
}
