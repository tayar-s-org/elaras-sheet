import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SHAPES, FRAMES, defaultDesign, drawToken, canvasToBlob, loadFrameImage } from './tokenArt.js';
import { TOKEN_SIZE } from '../../lib/tokens.js';
import { CREATURE_FRAME, CREATURE_BG, parseHp, MAX_HP } from '../../creature.js';
import './token.css';

const PREVIEW = 320;
const CREATURE_FRAME_URL = `${import.meta.env.BASE_URL}assets/frames/creature-frame.png`;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_BYTES = 8 * 1024 * 1024;
const BG_COLORS = ['#2a2a35', '#7a4dff', '#b3382c', '#2e9e5b', '#2f7fd0', '#d9a21b', '#f1ece0', '#000000'];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const initialsOf = name => (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

// Criador de tokens: envie um retrato, enquadre, escolha forma/moldura e salve (ou baixe o PNG).
// onSave(blob) devolve uma promessa; o modal fecha quando ela resolve.
// Modo criatura (mestre): moldura, forma e cor são únicas; escolhe-se nome, foto, vida e se o nome fica oculto (os efeitos ficam só no cartão do token).
// onSave(blob, { name, hp, hideHp, hideName }).
export default function TokenMaker({ name = '', onSave, onSavePreset, onClose, saveLabel = 'Salvar token', creature }) {
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const drag = useRef(null);
  const [image, setImage] = useState(null);
  const [design, setDesign] = useState(() => ({ ...defaultDesign(), initials: initialsOf(name) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const patch = p => setDesign(d => ({ ...d, ...p }));
  const [cName, setCName] = useState(creature?.name || '');
  const [cHp, setCHp] = useState(creature?.hp ? String(creature.hp) : '');
  const [hideHp, setHideHp] = useState(Boolean(creature?.hideHp)); // vida oculta dos jogadores (o mestre sempre vê)
  const [note, setNote] = useState('');
  const [hideName, setHideName] = useState(Boolean(creature?.hideName)); // nome e foto ocultos dos jogadores (aparece ?)
  const [frameImg, setFrameImg] = useState(null);
  const [frameFailed, setFrameFailed] = useState(false);
  // Moldura das criaturas: imagem única. Se não carregar, cai na moldura vermelha desenhada.
  useEffect(() => {
    if (!creature) return undefined;
    let alive = true;
    loadFrameImage(CREATURE_FRAME_URL).then(img => alive && setFrameImg(img)).catch(() => alive && setFrameFailed(true));
    return () => { alive = false; };
  }, [Boolean(creature)]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = creature
    ? { ...design, shape: 'circle', frame: CREATURE_FRAME, frameWidth: 8, double: true, bg: CREATURE_BG, shine: true, initials: initialsOf(cName), frameImage: frameImg || undefined }
    : design;
  const creatureReady = !creature || ((frameImg || frameFailed) && cName.trim().length > 0 && parseHp(cHp) !== null);

  useEffect(() => { if (canvasRef.current) drawToken(canvasRef.current, PREVIEW, shown, image); }, [design, image, creature, cName, frameImg]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const loadFile = useCallback(file => {
    setError('');
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) { setError('Use uma imagem PNG, JPEG, WebP ou GIF.'); return; }
    if (file.size > MAX_BYTES) { setError('A imagem passa de 8 MB.'); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); setImage(img); patch({ zoom: 1, x: 0, y: 0, rotate: 0, flip: false }); };
    img.onerror = () => { URL.revokeObjectURL(url); setError('Não foi possível ler a imagem.'); };
    img.src = url;
  }, []);

  // Colar uma imagem da area de transferencia (Ctrl+V), como no TokenStamp.
  useEffect(() => {
    const onPaste = e => {
      const f = Array.from(e.clipboardData?.files || []).find(x => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); loadFile(f); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadFile]);

  function onPointerDown(e) {
    if (!image) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, x: design.x, y: design.y };
  }
  function onPointerMove(e) {
    const g = drag.current;
    if (!g) return;
    const rect = e.currentTarget.getBoundingClientRect();
    patch({ x: clamp(g.x + (e.clientX - g.sx) / rect.width, -1, 1), y: clamp(g.y + (e.clientY - g.sy) / rect.height, -1, 1) });
  }
  const onPointerUp = () => { drag.current = null; };
  const onWheel = e => { if (image) { e.preventDefault(); patch({ zoom: clamp(design.zoom * (e.deltaY < 0 ? 1.06 : 0.94), 0.3, 4) }); } };

  async function render() {
    const out = document.createElement('canvas');
    drawToken(out, TOKEN_SIZE, shown, image);
    let blob = await canvasToBlob(out);
    if (blob.size > 900 * 1024) { // limite do bucket e 1 MB: reduz se a foto ficou pesada
      drawToken(out, Math.round(TOKEN_SIZE * 0.7), shown, image);
      blob = await canvasToBlob(out);
    }
    return blob;
  }
  async function download() {
    setError('');
    try {
      const url = URL.createObjectURL(await render());
      const a = document.createElement('a');
      a.href = url;
      a.download = `token-${((creature ? cName : name) || 'personagem').trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-') || 'personagem'}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.message); }
  }
  // Criatura nova: guarda só a predefinição (sem pôr no mapa), para deixar os monstros preparados. O modal continua aberto.
  async function savePresetOnly() {
    setBusy(true);
    setError('');
    setNote('');
    try { setNote(`Predefinição “${await onSavePreset(await render(), { name: cName.trim(), hp: parseHp(cHp) })}” salva.`); } catch (e) { setError(e.message); }
    setBusy(false);
  }
  async function save() {
    setBusy(true);
    setError('');
    try { await onSave(await render(), creature ? { name: cName.trim(), hp: parseHp(cHp), hideHp, hideName } : undefined); onClose(); } catch (e) { setError(e.message); setBusy(false); }
  }

  const frame = FRAMES.find(f => f.id === design.frame);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="modal token-maker" role="dialog" aria-modal="true" aria-labelledby="token-title">
      <h2 id="token-title">{creature ? (creature.editing ? 'Editar criatura' : 'Criar criatura') : 'Criador de token'}</h2>
      <div className="token-maker-body">
        <div className="token-stage">
          <div className={`token-drop${over ? ' over' : ''}`}
            onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); loadFile(e.dataTransfer.files?.[0]); }}>
            <canvas ref={canvasRef} width={PREVIEW} height={PREVIEW} className={image ? 'draggable' : ''}
              aria-label="Pré-visualização do token. Arraste para reposicionar, use a roda do mouse para o zoom."
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel} />
          </div>
          <button type="button" className="outline" onClick={() => fileRef.current.click()}>{image ? 'Trocar imagem' : 'Escolher imagem'}</button>
          <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { loadFile(e.target.files?.[0]); e.target.value = ''; }} />
          <small className="muted">{image ? 'Arraste a imagem para enquadrar; a roda do mouse dá zoom.' : 'Arraste uma imagem até aqui, escolha um arquivo ou cole (Ctrl+V).'}</small>
        </div>

        <div className="token-controls">
          {creature && <div className="form-grid compact token-creature">
            <label className="field"><span>Nome da criatura</span>
              <input maxLength={60} value={cName} placeholder="Ex.: Goblin, Dragão Vermelho" onChange={e => setCName(e.target.value)} /></label>
            <label className="field"><span>Vida</span>
              <input type="number" min="1" max={MAX_HP} inputMode="numeric" value={cHp} placeholder="Ex.: 30" onChange={e => setCHp(e.target.value)} /></label>
            <label className="check token-nohp"><input type="checkbox" checked={hideHp} onChange={e => setHideHp(e.target.checked)} /> Não mostrar vida (só o mestre vê a barra e os números)</label>
            <label className="check token-nohp"><input type="checkbox" checked={hideName} onChange={e => setHideName(e.target.checked)} /> Ocultar nome e foto (os jogadores veem “?” até você desmarcar)</label>
          </div>}
          <label className="field"><span>Zoom</span>
            <input type="range" min="0.3" max="4" step="0.01" value={design.zoom} disabled={!image} onChange={e => patch({ zoom: Number(e.target.value) })} /></label>
          <label className="field"><span>Rotação ({design.rotate}°)</span>
            <input type="range" min="-180" max="180" step="1" value={design.rotate} disabled={!image} onChange={e => patch({ rotate: Number(e.target.value) })} /></label>
          <div className="row token-row">
            <button type="button" className="outline" disabled={!image} aria-pressed={design.flip} onClick={() => patch({ flip: !design.flip })}>Espelhar</button>
            <button type="button" className="text-button" disabled={!image} onClick={() => patch({ zoom: 1, x: 0, y: 0, rotate: 0, flip: false })}>Recentralizar</button>
          </div>

          {creature ? <p className="muted token-fixed">Moldura, forma e cor são as mesmas de todas as criaturas.</p> : <>
          <fieldset className="token-set"><legend>Forma</legend>
            <div className="tabs-row">{SHAPES.map(s => <button key={s.id} type="button" className={design.shape === s.id ? 'primary' : 'outline'} aria-pressed={design.shape === s.id} onClick={() => patch({ shape: s.id })}>{s.label}</button>)}</div>
          </fieldset>

          <fieldset className="token-set"><legend>Moldura</legend>
            <div className="token-swatches">{FRAMES.map(f => <button key={f.id} type="button" className={`token-swatch${design.frame === f.id ? ' on' : ''}`} aria-label={f.label} aria-pressed={design.frame === f.id} title={f.label}
              style={{ background: f.colors ? `linear-gradient(135deg, ${f.colors.join(',')})` : 'transparent' }} onClick={() => patch({ frame: f.id })}>{f.colors ? '' : '∅'}</button>)}</div>
            {frame?.colors && <>
              <label className="field"><span>Espessura</span>
                <input type="range" min="3" max="16" step="1" value={design.frameWidth} onChange={e => patch({ frameWidth: Number(e.target.value) })} /></label>
              <label className="check"><input type="checkbox" checked={design.double} onChange={e => patch({ double: e.target.checked })} /> Fio duplo na moldura</label>
            </>}
          </fieldset>

          <fieldset className="token-set"><legend>Fundo</legend>
            <div className="token-swatches">
              {BG_COLORS.map(c => <button key={c} type="button" className={`token-swatch${design.bg === c ? ' on' : ''}`} aria-label={`Fundo ${c}`} aria-pressed={design.bg === c} style={{ background: c }} onClick={() => patch({ bg: c })} />)}
              <input type="color" aria-label="Cor do fundo personalizada" value={design.bg} onChange={e => patch({ bg: e.target.value })} />
            </div>
            <label className="check"><input type="checkbox" checked={design.shine} onChange={e => patch({ shine: e.target.checked })} /> Brilho</label>
            {!image && <label className="field"><span>Iniciais (sem imagem)</span>
              <input maxLength={2} value={design.initials} onChange={e => patch({ initials: e.target.value })} /></label>}
          </fieldset>
          </>}
        </div>
      </div>
      {error && <p role="alert" className="token-error">{error}</p>}
      {note && <p role="status" className="muted">{note}</p>}
      <div className="row token-actions">
        <button type="button" className="quiet" disabled={busy} onClick={onClose}>Cancelar</button>
        <span className="token-actions-right">
          <button type="button" className="outline" disabled={busy} onClick={download}>Baixar PNG</button>
          {creature && !creature.editing && onSavePreset && <button type="button" className="outline" disabled={busy || !creatureReady} title="Guarda a criatura nas predefinições sem colocá-la no mapa" onClick={savePresetOnly}>Salvar predefinição</button>}
          {onSave && <button type="button" className="primary" disabled={busy || !creatureReady || (!creature && !image && !design.initials)} onClick={save}>{busy ? 'Salvando…' : saveLabel}</button>}
        </span>
      </div>
    </div>
  </div>;
}
