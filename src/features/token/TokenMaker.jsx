import React, { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '../../ui/Modal.jsx';
import { SHAPES, FRAMES, defaultDesign, drawToken, canvasToBlob, loadFrameImage } from './tokenArt.js';
import { TOKEN_SIZE, tokenSourceUrl, tokenUrl } from '../../lib/tokens.js';
import { CREATURE_FRAME, CREATURE_BG, parseHp, MAX_HP } from '../../creature.js';
import { cleanCreatureSheet, CREATURE_SIZES, HEX_COLOR, tokenArtwork } from '../../tokenArtwork.js';
import CreatureSheetFields, { creatureFieldErrors } from './CreatureSheetFields.jsx';
import './token.css';

const PREVIEW = 320;
const CREATURE_FRAME_URL = `${import.meta.env.BASE_URL}assets/frames/creature-frame.png`;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_BYTES = 8 * 1024 * 1024;
const BG_COLORS = ['#2a2a35', '#7a4dff', '#b3382c', '#2e9e5b', '#2f7fd0', '#d9a21b', '#f1ece0', '#000000'];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const initialsOf = name => (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

function ColorControl({ label, value, onChange }) {
  const [draft, setDraft] = useState(null);
  return <div className="token-color">
    <label className="field"><span>{label}</span><input type="color" value={value}
      onChange={event => { setDraft(null); onChange(event.target.value); }} /></label>
    <label className="field"><span>{label} em hexadecimal</span><input maxLength={7} value={draft ?? value}
      onBlur={() => setDraft(null)} onChange={event => {
        const next = event.target.value;
        setDraft(next);
        if (HEX_COLOR.test(next)) onChange(next);
      }} /></label>
  </div>;
}

export default function TokenMaker({ name = '', onSave, onSavePreset, onClose, saveLabel = 'Salvar token', creature, artwork, imagePath }) {
  const editorRef = useRef(null);
  const [attempted, setAttempted] = useState(false);
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const drag = useRef(null);
  const [image, setImage] = useState(null);
  const saved = tokenArtwork(artwork);
  const [sourcePath] = useState(saved?.sourcePath || '');
  const [legacyPath, setLegacyPath] = useState(saved?.legacyPath || (!saved ? imagePath : '') || '');
  const [usingFallback, setUsingFallback] = useState(false);
  const [sourceFile, setSourceFile] = useState(null);
  const [imageState, setImageState] = useState(sourcePath || legacyPath ? 'loading' : 'ready');
  const generation = useRef(0);
  const saving = useRef(false);
  const [design, setDesign] = useState(() => saved?.design || {
    ...defaultDesign(), initials: initialsOf(name), frameColor: '#d9a21b',
    ...(imagePath ? { frame: 'none', shine: false, legacyBase: true } : creature ? { frame: 'creature', bg: CREATURE_BG, frameWidth: 8, double: true } : {}),
  });
  const [size, setSize] = useState(creature?.size || 1);
  const [sheet, setSheet] = useState(creature?.sheet || {});

  useEffect(() => {
    if (!sourcePath && !legacyPath) return undefined;
    const request = ++generation.current;
    (async () => {
      const load = async url => {
        if (!url) throw new Error('Imagem indisponível.');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = url;
        await img.decode();
        return img;
      };
      let img;
      try {
        img = await load(usingFallback || !sourcePath ? tokenUrl(legacyPath) : await tokenSourceUrl(sourcePath));
      } catch (error) {
        if (!sourcePath || usingFallback || !imagePath || generation.current !== request) throw error;
        setLegacyPath(imagePath);
        setUsingFallback(true);
        setDesign(prev => ({ ...defaultDesign(), initials: prev.initials, frameColor: prev.frameColor, frame: 'none', shine: false, legacyBase: true }));
        return;
      }
      if (generation.current === request) { setImage(img); setImageState('ready'); }
    })().catch(() => {
      if (generation.current === request) {
        setImageState('failed');
        setError('Não foi possível carregar a imagem atual. Escolha outra imagem para salvar este token.');
      }
    });
    return () => { generation.current += 1; };
  }, [sourcePath, legacyPath, imagePath, usingFallback]);
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
  useEffect(() => {
    if (design.frame !== 'creature' || frameImg || frameFailed) return undefined;
    let alive = true;
    loadFrameImage(CREATURE_FRAME_URL).then(img => alive && setFrameImg(img)).catch(() => alive && setFrameFailed(true));
    return () => { alive = false; };
  }, [design.frame, frameImg, frameFailed]);
  const shown = {
    ...design, initials: creature ? initialsOf(cName) : design.initials,
    frame: design.frame === 'creature' ? CREATURE_FRAME : design.frame,
    frameImage: design.frame === 'creature' ? frameImg : null,
    legacyBase: Boolean(legacyPath && !sourceFile && design.legacyBase && design.frame === 'none'),
  };
  const ready = imageState === 'ready' && (design.frame !== 'creature' || Boolean(frameImg || frameFailed));
  const nameError = creature && !cName.trim();
  const hpError = creature && parseHp(cHp) === null && (!creature.noHp || cHp.trim());
  const fieldErrors = creature ? creatureFieldErrors(sheet) : {};
  function validateFields() {
    if (!nameError && !hpError && !Object.keys(fieldErrors).length) return true;
    setAttempted(true);
    if (Object.keys(fieldErrors).length) {
      const details = editorRef.current?.querySelector('[data-quick-sheet]');
      if (details) details.open = true;
    }
    requestAnimationFrame(() => editorRef.current?.querySelector('[aria-invalid="true"]')?.focus());
    return false;
  }
  useEffect(() => { if (canvasRef.current) drawToken(canvasRef.current, PREVIEW, shown, image); });

  const loadFile = useCallback(file => {
    setError('');
    if (!file || saving.current) return;
    if (!IMAGE_TYPES.includes(file.type)) { setError('Use uma imagem PNG, JPEG, WebP ou GIF.'); return; }
    if (file.size > MAX_BYTES) { setError('A imagem passa de 8 MB.'); return; }
    const request = ++generation.current;
    setImageState('loading');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); if (request !== generation.current) return; setImage(img); setSourceFile(file); setImageState('ready'); patch({ zoom: 1, x: 0, y: 0, rotate: 0, flip: false }); };
    img.onerror = () => { URL.revokeObjectURL(url); if (request !== generation.current) return; setImageState('failed'); setError('Não foi possível ler a imagem.'); };
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
  function payload() {
    const artwork = { sourcePath: usingFallback ? '' : sourcePath, legacyPath, sourceFile, design };
    if (!creature) return { artwork };
    return { artwork, name: cName.trim(), hp: parseHp(cHp), hideHp, hideName, size, sheet: cleanCreatureSheet(sheet) };
  }

  async function savePresetOnly() {
    if (saving.current || !validateFields()) return;
    saving.current = true;
    setBusy(true);
    setError('');
    setNote('');
    try {
      const data = payload();
      setNote(`Predefinição “${await onSavePreset(await render(), data)}” salva.`);
    } catch (e) { setError(e.message); }
    saving.current = false;
    setBusy(false);
  }
  async function save() {
    if (saving.current || !validateFields()) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const data = payload();
      await onSave(await render(), data);
      onClose(creature && !creature.editing ? "placed" : "saved");
    } catch (e) {
      setError(e.message);
      saving.current = false;
      setBusy(false);
    }
  }

  const drawnFrame = design.frame !== 'none' && design.frame !== 'creature';
  return <Modal onClose={onClose} aria-labelledby="token-title" busy={busy}>
    <div className="modal token-maker" ref={editorRef}>
      <h2 id="token-title">{creature ? (creature.preset ? 'Editar predefinição' : creature.editing ? 'Editar criatura' : 'Nova criatura') : imagePath ? 'Editar token' : 'Criar token'}</h2>
        {creature && <div className="token-controls token-basics">
          <div className="form-grid compact token-creature">
            <label className="field"><span>Nome da criatura</span>
              <input maxLength={60} value={cName} required aria-invalid={attempted && nameError || undefined} aria-describedby={attempted && nameError ? "creature-name-error" : undefined} placeholder="Ex.: Goblin, Dragão Vermelho" onChange={e => setCName(e.target.value)} />
              {attempted && nameError && <small id="creature-name-error" className="token-field-error">Informe o nome da criatura.</small>}</label>
            <label className="field"><span>Vida máxima</span>
              <input type="number" min="1" max={MAX_HP} inputMode="numeric" value={cHp} required={!creature.noHp} aria-invalid={attempted && hpError ? true : undefined} aria-describedby={attempted && hpError ? "creature-hp-error" : undefined} placeholder="Ex.: 30" onChange={e => setCHp(e.target.value)} />
              {attempted && hpError && <small id="creature-hp-error" className="token-field-error">Use um inteiro entre 1 e {MAX_HP}.</small>}</label>
            <label className="field"><span>Tamanho no mapa</span>
              <select value={size} onChange={e => setSize(Number(e.target.value))}>
                {!CREATURE_SIZES.some(([value]) => value === size) && <option value={size}>{size}× · tamanho atual</option>}
                {CREATURE_SIZES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="check token-nohp"><input type="checkbox" checked={hideHp} onChange={e => setHideHp(e.target.checked)} /> Mostrar vida apenas ao mestre</label>
            <label className="check token-nohp"><input type="checkbox" checked={hideName} onChange={e => setHideName(e.target.checked)} /> Ocultar nome e foto dos jogadores</label>
          </div>
          {creature && <CreatureSheetFields value={sheet} onChange={setSheet} errors={attempted ? fieldErrors : {}} />}
        </div>}
      <details className="token-appearance" open={creature ? undefined : true}>
        <summary>Aparência{creature ? ' · imagem opcional' : ''}</summary>
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
          {imageState === 'loading' && <p role="status" className="muted">Carregando imagem…</p>}
          {legacyPath && !sourceFile && <small className="muted">A moldura anterior faz parte desta imagem. Você pode reutilizá-la ou escolher o retrato original para recortar sem a moldura antiga.</small>}
          <small className="muted">{image ? 'Arraste a imagem para enquadrar; a roda do mouse dá zoom.' : 'Arraste uma imagem até aqui, escolha um arquivo ou cole (Ctrl+V).'}</small>
        </div>

          <div className="token-controls">
          <label className="field"><span>Zoom</span>
            <input type="range" min="0.3" max="4" step="0.01" value={design.zoom} disabled={!image} onChange={e => patch({ zoom: Number(e.target.value) })} /></label>
          <label className="field"><span>Rotação ({design.rotate}°)</span>
            <input type="range" min="-180" max="180" step="1" value={design.rotate} disabled={!image} onChange={e => patch({ rotate: Number(e.target.value) })} /></label>
          <div className="row token-row">
            <button type="button" className="outline" disabled={!image} aria-pressed={design.flip} onClick={() => patch({ flip: !design.flip })}>Espelhar</button>
            <button type="button" className="text-button" disabled={!image} onClick={() => patch({ zoom: 1, x: 0, y: 0, rotate: 0, flip: false })}>Recentralizar</button>
          </div>

          <fieldset className="token-set"><legend>Forma</legend>
            <div className="tabs-row">{SHAPES.map(s => <button key={s.id} type="button" className={design.shape === s.id ? 'primary' : 'outline'} aria-pressed={design.shape === s.id} onClick={() => patch({ shape: s.id, legacyBase: false, ...(design.frame === 'creature' ? { frame: CREATURE_FRAME } : {}) })}>{s.label}</button>)}</div>
          </fieldset>

          <fieldset className="token-set"><legend>Moldura</legend>
            <div className="token-swatches">{FRAMES.map(f => <button key={f.id} type="button" className={`token-swatch${design.frame === f.id ? ' on' : ''}`} aria-label={f.label} aria-pressed={design.frame === f.id} title={f.label}
              style={{ background: f.colors ? `linear-gradient(135deg, ${f.colors.join(',')})` : 'transparent' }} onClick={() => patch({ frame: f.id })}>{f.colors ? '' : '∅'}</button>)}</div>
            {creature && <button type="button" className="outline" aria-pressed={design.frame === 'creature'} onClick={() => patch({ frame: 'creature', shape: 'circle' })}>Moldura de criatura</button>}
            <ColorControl label="Cor da moldura" value={design.frameColor} onChange={color => patch({ frame: 'custom', frameColor: color })} />
            {drawnFrame && <>
              <label className="field"><span>Espessura</span>
                <input type="range" min="3" max="16" step="1" value={design.frameWidth} onChange={e => patch({ frameWidth: Number(e.target.value) })} /></label>
              <label className="check"><input type="checkbox" checked={design.double} onChange={e => patch({ double: e.target.checked })} /> Fio duplo na moldura</label>
            </>}
          </fieldset>

          <fieldset className="token-set"><legend>Fundo</legend>
            <div className="token-swatches">
              {BG_COLORS.map(c => <button key={c} type="button" className={`token-swatch${design.bg === c ? ' on' : ''}`} aria-label={`Fundo ${c}`} aria-pressed={design.bg === c} style={{ background: c }} onClick={() => patch({ bg: c, legacyBase: false })} />)}
            </div>
            <ColorControl label="Cor do fundo" value={design.bg} onChange={e => patch({ bg: e, legacyBase: false })} />
            <label className="check"><input type="checkbox" checked={design.shine} onChange={e => patch({ shine: e.target.checked, legacyBase: false })} /> Brilho</label>
            {!creature && !image && <label className="field"><span>Iniciais (sem imagem)</span>
              <input maxLength={2} value={design.initials} onChange={e => patch({ initials: e.target.value })} /></label>}
          </fieldset>
          </div>
        </div>
      </details>
      <div className="row token-actions">
        {error && <p role="alert" className="token-error">{error}</p>}
        {note && <p role="status" className="muted">{note}</p>}
        <button type="button" className="quiet" disabled={busy} onClick={onClose}>Cancelar</button>
        <span className="token-actions-right">
          <button type="button" className="outline" disabled={busy || imageState !== 'ready'} onClick={download}>Baixar PNG</button>
          {onSavePreset && <button type="button" className="outline" disabled={busy || !ready} title="Guarda a criatura nas predefinições sem colocá-la no mapa" onClick={savePresetOnly}>Salvar como predefinição</button>}
          {onSave && <button type="button" className="primary" disabled={busy || !ready || (!creature && !image && !design.initials)} onClick={save}>{busy ? 'Salvando…' : saveLabel}</button>}
        </span>
      </div>
    </div>
  </Modal>;
}
