import React, { useEffect, useRef, useState } from 'react';
import { updateBoard, uploadMap, removeMap, addToken, updateToken, removeToken, clearMarks, applyMoves, gatherTokens } from '../../lib/board.js';
import { creatureOf, metaWithHp, metaWithMaxHp, parseHp, newCreatureMeta, uniqueName, CREATURE_COLOR, MAX_HP } from '../../creature.js';
import { loadPresets, savePreset, deletePreset } from '../../lib/presets.js';
import { tokenUrl } from '../../lib/tokens.js';
import './master.css';

const COLORS = ['#7a4dff', '#2e9e5b', '#d9a21b', '#2f7fd0', '#444444'];

// Módulo do mestre (janela aberta pelo botão ao lado de "Trocar imagem do token"): mapa, grade, criaturas,
// token selecionado e marcadores. Substitui o antigo bloco "Ferramentas do mestre" que ficava abaixo do registro.
export default function MasterModule({ board, tokens, marks, members, characters, selected, onSelect, room, local, setError, onClose, onCreateCreature, onEditImage }) {
  const fileRef = useRef(null);
  const [presets, setPresets] = useState(null);
  const [presetNote, setPresetNote] = useState('');
  const [busy, setBusy] = useState(false);
  const grid = board.grid || { size: 70, visible: true };
  const creature = selected ? creatureOf(selected) : null;

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const run = async fn => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const patchToken = (token, patch) => run(async () => {
    await updateToken(token.id, patch);
    local.setTokens(prev => prev.map(t => (t.id === token.id ? { ...t, ...patch } : t)));
  });
  const setGrid = patch => run(async () => {
    const next = { ...grid, ...patch };
    local.setBoard({ ...board, grid: next });
    await updateBoard(board.id, { grid: next });
  });

  useEffect(() => {
    let alive = true;
    loadPresets(board.table_id).then(p => { if (alive) setPresets(p); }).catch(e => { if (alive) { setPresets([]); setPresetNote(e.message); } });
    return () => { alive = false; };
  }, [board.table_id]);

  const nameTaken = () => tokens.map(t => t.name);
  const placeAt = n => ({ x: board.width / 2 + (n % 5) * 20, y: board.height / 2 + (n % 5) * 20 });

  const withoutToken = members.filter(m => m.status === 'approved' && m.role === 'player' && m.character_id && characters[m.character_id]
    && !tokens.some(t => t.character_id === m.character_id));
  const place = i => ({ x: board.width / 2 + (i % 5) * 20, y: board.height / 2 + (i % 5) * 20 });

  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="modal master-module" role="dialog" aria-modal="true" aria-labelledby="master-title">
      <div className="row master-head">
        <h2 id="master-title">Módulo do mestre</h2>
        <button type="button" className="quiet" onClick={onClose}>Fechar</button>
      </div>

      <section className="master-section" aria-labelledby="m-map">
        <h3 id="m-map">Mapa</h3>
        <div className="row master-actions">
          <button type="button" className="outline" disabled={busy} onClick={() => fileRef.current.click()}>{board.map_path ? 'Trocar mapa' : 'Enviar mapa'}</button>
          {board.map_path && <button type="button" className="text-button danger" disabled={busy}
            onClick={() => window.confirm('Remover o mapa?') && run(async () => { const r = await removeMap(board, tokens); local.setBoard({ ...board, map_path: null, width: r.width, height: r.height }); local.setTokens(prev => applyMoves(prev, r.moved)); local.setMarks([]); local.reloadMap(); })}>Remover mapa</button>}
          <button className="outline" disabled={busy || !tokens.length} title="Se algum token ficou fora da tela, traz todos para o centro" onClick={() => run(async () => { const moves = await gatherTokens(board, tokens); local.setTokens(prev => applyMoves(prev, moves)); })}>Trazer tokens ao centro</button>
          <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run(async () => { const r = await uploadMap(board, f, tokens); local.setBoard({ ...board, map_path: r.path, width: r.width, height: r.height }); local.setTokens(prev => applyMoves(prev, r.moved)); local.setMarks([]); local.reloadMap(); }); }} />
        </div>
        <p className="muted">PNG, JPEG ou WebP até 5 MB. Só quem está na mesa vê o mapa.</p>
        <div className="form-grid compact">
          <label className="field"><span>Tamanho da célula (px)</span>
            <input type="number" min="20" max="400" defaultValue={grid.size} key={grid.size}
              onBlur={e => { const v = Math.min(400, Math.max(20, Number(e.target.value) || 70)); if (v !== grid.size) setGrid({ size: v }); }} /></label>
          <label className="field"><span>Tamanho dos tokens</span>
            <select value={String(board.settings?.tokenScale || 1.25)} onChange={e => run(async () => {
              const settings = { ...(board.settings || {}), tokenScale: Number(e.target.value) };
              local.setBoard({ ...board, settings });
              await updateBoard(board.id, { settings });
            })}>
              <option value="0.8">Pequeno</option><option value="1">Igual à célula</option><option value="1.25">Grande</option>
              <option value="1.5">Maior</option><option value="2">Enorme</option></select></label>
          <label className="check"><input type="checkbox" checked={Boolean(grid.visible)} onChange={e => setGrid({ visible: e.target.checked })} /> Mostrar grade e ajustar à grade</label>
        </div>
      </section>

      <section className="master-section" aria-labelledby="m-creature">
        <h3 id="m-creature">Criaturas e tokens</h3>
        <div className="row master-actions">
          <button type="button" className="primary" disabled={busy} onClick={onCreateCreature}>Criar token de criatura</button>
        </div>
        <p className="muted">Escolha o nome, a foto e a vida. A moldura e a cor são as mesmas para todas as criaturas.</p>
        {withoutToken.length > 0 && <>
          <p className="master-sub">Personagens ainda sem token</p>
          <div className="row master-actions">
            {withoutToken.map((m, i) => <button key={m.user_id} type="button" className="outline" disabled={busy}
              onClick={() => run(async () => {
                const t = await addToken(board, { kind: 'pc', name: characters[m.character_id].name || m.profiles?.display_name, character_id: m.character_id, color: COLORS[i % COLORS.length], ...place(i) });
                local.setTokens(prev => (prev.some(x => x.id === t.id) ? prev : [...prev, t]));
              })}>+ {characters[m.character_id].name || m.profiles?.display_name}</button>)}
          </div>
        </>}
      </section>

      <section className="master-section" aria-labelledby="m-presets">
        <h3 id="m-presets">Predefinições de criaturas</h3>
        <p className="muted">Criaturas salvas ficam guardadas nesta mesa. Use para colocar no mapa de novo, quantas vezes quiser.</p>
        {presetNote && <p role="alert" className="muted">{presetNote}</p>}
        {presets === null && <p className="muted">Carregando…</p>}
        {presets && !presets.length && !presetNote && <p className="muted">Nenhuma predefinição ainda. Selecione uma criatura no tabuleiro e use “Salvar como predefinição”.</p>}
        <ul className="preset-list">
          {(presets || []).map(p => <li key={p.id} className="preset-item">
            {p.image_path ? <img src={tokenUrl(p.image_path)} alt="" width="36" height="36" /> : <span className="preset-dot" aria-hidden="true" />}
            <span className="preset-name"><strong>{p.name}</strong> <small className="muted">vida {p.max_hp}</small></span>
            <button type="button" className="outline" disabled={busy} onClick={() => run(async () => {
              const t = await addToken(board, { kind: 'npc', name: uniqueName(p.name, nameTaken()), color: CREATURE_COLOR, size: p.size || 1, image_path: p.image_path, meta: newCreatureMeta(p.max_hp), ...placeAt(tokens.length) });
              local.setTokens(prev => (prev.some(x => x.id === t.id) ? prev : [...prev, t]));
              onSelect(t.id);
            })}>Colocar no mapa</button>
            <button type="button" className="text-button danger" disabled={busy} onClick={() => window.confirm(`Apagar a predefinição ${p.name}?`) && run(async () => { await deletePreset(p.id); setPresets(prev => prev.filter(x => x.id !== p.id)); })}>Apagar</button>
          </li>)}
        </ul>
      </section>

      <section className="master-section" aria-labelledby="m-selected">
        <h3 id="m-selected">Token selecionado</h3>
        {!selected && <p className="muted">Clique num token no tabuleiro para editá-lo, ocultá-lo ou removê-lo.</p>}
        {selected && <div className="item-card">
          <strong>{selected.name || 'Sem nome'}</strong> <span className="muted">{creature ? 'Criatura' : selected.kind === 'pc' ? 'Personagem' : 'Objeto'}</span>
          <div className="form-grid compact">
            <label className="field"><span>Nome</span>
              <input maxLength={60} defaultValue={selected.name} key={`${selected.id}-${selected.name}`}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== selected.name) patchToken(selected, { name: v }); }} /></label>
            <label className="field"><span>Tamanho</span>
              <select value={selected.size} onChange={e => patchToken(selected, { size: Number(e.target.value) })}>
                <option value="0.5">Pequeno</option><option value="1">Médio</option><option value="2">Grande</option><option value="3">Enorme</option></select></label>
            {creature && <>
              <label className="field"><span>Vida atual</span>
                <input type="number" min="0" max={creature.maxHp} defaultValue={creature.hp} key={`hp-${selected.id}-${creature.hp}-${creature.maxHp}`}
                  onBlur={e => { const v = Math.trunc(Number(e.target.value)); if (Number.isFinite(v) && v !== creature.hp) patchToken(selected, { meta: metaWithHp(selected, v) }); }} /></label>
              <label className="field"><span>Vida máxima</span>
                <input type="number" min="1" max={MAX_HP} defaultValue={creature.maxHp} key={`mx-${selected.id}-${creature.maxHp}`}
                  onBlur={e => { const v = parseHp(e.target.value); if (v && v !== creature.maxHp) patchToken(selected, { meta: metaWithMaxHp(selected, v) }); }} /></label>
            </>}
          </div>
          <div className="row master-actions">
            <button type="button" className="outline" disabled={busy} onClick={() => onEditImage(selected)}>
              {creature ? 'Trocar imagem da criatura' : selected.image_path ? 'Trocar imagem' : 'Criar imagem do token'}</button>
            {creature && <button type="button" className="outline" disabled={busy || !presets} onClick={() => run(async () => {
              const p = await savePreset(board.table_id, { name: uniqueName(selected.name, (presets || []).map(x => x.name)), image_path: selected.image_path, max_hp: creature.maxHp, size: selected.size });
              setPresets(prev => [...(prev || []), p]);
            })}>Salvar como predefinição</button>}
            {!creature && selected.image_path && <button type="button" className="text-button" disabled={busy} onClick={() => patchToken(selected, { image_path: null })}>Tirar imagem</button>}
            <button type="button" className="outline" disabled={busy}
              onClick={() => run(async () => { const hidden = !selected.hidden; await updateToken(selected.id, { hidden }); local.setTokens(prev => prev.map(t => (t.id === selected.id ? { ...t, hidden } : t))); room.sendBroadcast('board_refresh', {}); })}>
              {selected.hidden ? 'Revelar aos jogadores' : 'Ocultar dos jogadores'}</button>
            <button type="button" className="text-button danger" disabled={busy}
              onClick={() => window.confirm(`Remover o token ${selected.name}?`) && run(async () => { await removeToken(selected.id); local.setTokens(prev => prev.filter(t => t.id !== selected.id)); onSelect(null); })}>Remover token</button>
          </div>
        </div>}
      </section>

      <section className="master-section" aria-labelledby="m-marks">
        <h3 id="m-marks">Marcadores</h3>
        <button type="button" className="text-button danger" disabled={busy || !marks.length}
          onClick={() => window.confirm('Apagar todos os marcadores?') && run(async () => { await clearMarks(board.id); local.setMarks([]); })}>Limpar marcadores ({marks.length})</button>
      </section>
    </div>
  </div>;
}
