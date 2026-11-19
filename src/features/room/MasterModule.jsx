import React, { useEffect, useState } from 'react';
import Modal from '../../ui/Modal.jsx';
import { updateBoard, addToken, loadCreatureDetails, saveCreatureToken, updateToken, removeToken, clearMarks, applyMoves, gatherTokens } from '../../lib/board.js';
import { creatureOf, metaWithHideHp, metaWithHp, metaWithMaxHp, parseHp, newCreatureMeta, uniqueName, CREATURE_COLOR, MAX_HP } from '../../creature.js';
import { loadPresets, savePreset, deletePreset } from '../../lib/presets.js';
import { tokenUrl } from '../../lib/tokens.js';
import './master.css';

const COLORS = ['#7a4dff', '#2e9e5b', '#d9a21b', '#2f7fd0', '#444444'];

export default function MasterModule({ board, tokens, marks, members, characters, selected, onSelect, room, local, onClose, onCreateCreature, onEditImage, onEditPreset, mode = "map", onMapTools, onGoToToken, initialNotice = "" }) {
  const [presets, setPresets] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(initialNotice);
  const [placed, setPlaced] = useState(null);
  const library = mode === 'presets';
  const [busy, setBusy] = useState(false);
  const creature = selected ? creatureOf(selected) : null;


  const run = async fn => {
    setBusy(true);
    setError('');
    setNotice('');
    setPlaced(null);
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const patchToken = (token, patch) => run(async () => {
    await updateToken(token.id, patch);
    local.setTokens(prev => prev.map(t => (t.id === token.id ? { ...t, ...patch } : t)));
  });
  useEffect(() => {
    let alive = true;
    loadPresets(board.table_id).then(p => { if (alive) setPresets(p); }).catch(e => { if (alive) { setPresets([]); setError(e.message); } });
    return () => { alive = false; };
  }, [board.table_id]);

  const nameTaken = () => tokens.map(t => t.name);
  const placeAt = n => ({ x: board.width / 2 + (n % 5) * 20, y: board.height / 2 + (n % 5) * 20 });

  const withoutToken = members.filter(m => m.status === 'approved' && m.role === 'player' && m.character_id && characters[m.character_id]
    && !tokens.some(t => t.character_id === m.character_id));
  const place = i => ({ x: board.width / 2 + (i % 5) * 20, y: board.height / 2 + (i % 5) * 20 });

  return <Modal onClose={onClose} aria-labelledby="master-title" busy={busy}>
    <div className="modal master-module">
      <div className="row master-head">
        <h2 id="master-title">{library ? "Predefinições" : "Mapa e tokens"}</h2>
        <button type="button" className="quiet" disabled={busy} onClick={onClose}>Fechar</button>
      </div>

      {error && <p className="callout" role="alert">{error}</p>}
      {!library && <><section className="master-section" aria-labelledby="m-map">
        <h3 id="m-map">Mapa</h3>
        <div className="row master-actions">
          <button type="button" className="primary" onClick={() => onMapTools('generate')}>Gerar mapa</button>
          <button type="button" className="outline" onClick={() => onMapTools('library')}>Biblioteca de mapas</button>
          <button type="button" className="outline" onClick={() => onMapTools('import')}>Importar imagem</button>
          <button className="outline" disabled={busy || !tokens.length} title="Se algum token ficou fora da tela, traz todos para o centro" onClick={() => run(async () => { const moves = await gatherTokens(board, tokens); local.setTokens(prev => applyMoves(prev, moves)); })}>Trazer tokens ao centro</button>
        </div>
        <p className="muted">Ajuste a grade sobre a imagem em Mapas e grade.</p>
        <div className="form-grid compact">
          <label className="field"><span>Tamanho dos tokens</span>
            <select value={String(board.settings?.tokenScale || 1.25)} onChange={e => run(async () => {
              const settings = { ...(board.settings || {}), tokenScale: Number(e.target.value) };
              local.setBoard({ ...board, settings });
              await updateBoard(board.id, { settings });
            })}>
              <option value="0.8">Pequeno</option><option value="1">Igual à célula</option><option value="1.25">Grande</option>
              <option value="1.5">Maior</option><option value="2">Enorme</option></select></label>
        </div>
      </section>

      {withoutToken.length > 0 && <section className="master-section" aria-label="Tokens dos jogadores">
          <p className="master-sub">Personagens ainda sem token</p>
          <div className="row master-actions">
            {withoutToken.map((m, i) => <button key={m.user_id} type="button" className="outline" disabled={busy}
              onClick={() => run(async () => {
                const t = await addToken(board, { kind: 'pc', name: characters[m.character_id].name || m.profiles?.display_name, character_id: m.character_id, color: COLORS[i % COLORS.length], ...place(i) });
                local.setTokens(prev => (prev.some(x => x.id === t.id) ? prev : [...prev, t]));
              })}>+ {characters[m.character_id].name || m.profiles?.display_name}</button>)}
          </div>
      </section>}
      </>}

      {library && <section className="master-section" aria-label="Criaturas salvas nesta mesa">
        <button type="button" className="outline" disabled={busy} onClick={onCreateCreature}>Nova criatura</button>
        <p className="muted">Criaturas salvas ficam guardadas nesta mesa. Use para colocar no mapa de novo, quantas vezes quiser.</p>
        {!placed && notice && <p role="status">{notice}</p>}
        {presets === null && <p className="muted">Carregando…</p>}
        {presets && !presets.length && !error && <p className="muted">Crie uma criatura e escolha “Salvar como predefinição” para guardá-la sem colocá-la no mapa.</p>}
        <ul className="preset-list">
          {(presets || []).map(p => <li key={p.id} className="preset-item">
            {p.image_path ? <img src={tokenUrl(p.image_path)} alt="" width="36" height="36" /> : <span className="preset-dot" aria-hidden="true" />}
            <span className="preset-name"><strong>{p.name}</strong> <small className="muted">vida {p.max_hp}</small></span>
            <div className="preset-actions">
            <button type="button" className="outline" disabled={busy} onClick={() => run(async () => {
              const t = await saveCreatureToken(board, null, { name: uniqueName(p.name, nameTaken()), color: CREATURE_COLOR, size: p.size || 1, image_path: p.image_path, meta: newCreatureMeta(p.max_hp, p.details?.hideHp), name_hidden: Boolean(p.details?.hideName), ...placeAt(tokens.length) }, p.details || {});
              local.setTokens(prev => (prev.some(x => x.id === t.id) ? prev : [...prev, t]));
              setPlaced({ token: t, presetId: p.id });
              setNotice(`${t.name} foi colocado no mapa.`);
            })}>Colocar no mapa</button>
            <button type="button" className="outline" disabled={busy} onClick={() => onEditPreset(p)}>Editar predefinição</button>
            <button type="button" className="text-button danger" disabled={busy} onClick={() => window.confirm(`Apagar a predefinição ${p.name}?`) && run(async () => { await deletePreset(p.id); setPresets(prev => prev.filter(x => x.id !== p.id)); })}>Apagar</button>
            </div>
            {placed?.presetId === p.id && <div className="preset-feedback">
              <p role="status">{notice}</p>
              <button type="button" className="outline" disabled={busy} onClick={() => { onGoToToken(placed.token); onClose(); }}>Ir para o token</button>
            </div>}
          </li>)}
        </ul>
      </section>}

      {!library && <><section className="master-section" aria-labelledby="m-selected">
        <h3 id="m-selected">Token selecionado</h3>
        {!selected && <p className="muted">Clique num token no tabuleiro para editá-lo, ocultá-lo ou removê-lo.</p>}
        {selected && <div className="item-card">
          <strong>{(selected.character_id && characters[selected.character_id]?.name) || selected.name || 'Sem nome'}</strong> <span className="muted">{creature ? 'Criatura' : selected.kind === 'pc' ? 'Personagem' : 'Objeto'}</span>
          <div className="form-grid compact">
            {!selected.character_id && <label className="field"><span>Nome</span>
              <input maxLength={60} defaultValue={selected.name} key={`${selected.id}-${selected.name}`}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== selected.name) patchToken(selected, { name: v }); }} /></label>}
            <label className="field"><span>Tamanho</span>
              <select value={selected.size} onChange={e => patchToken(selected, { size: Number(e.target.value) })}>
                <option value="0.5">Pequeno</option><option value="1">Médio</option><option value="2">Grande</option><option value="3">Enorme</option></select></label>
            {creature && !creature.noHp && <>
              <label className="field"><span>Vida atual</span>
                <input type="number" min="0" max={creature.maxHp} defaultValue={creature.hp} key={`hp-${selected.id}-${creature.hp}-${creature.maxHp}`}
                  onBlur={e => { const v = Math.trunc(Number(e.target.value)); if (Number.isFinite(v) && v !== creature.hp) patchToken(selected, { meta: metaWithHp(selected, v) }); }} /></label>
              <label className="field"><span>Vida máxima</span>
                <input type="number" min="1" max={MAX_HP} defaultValue={creature.maxHp} key={`mx-${selected.id}-${creature.maxHp}`}
                  onBlur={e => { const v = parseHp(e.target.value); if (v && v !== creature.maxHp) patchToken(selected, { meta: metaWithMaxHp(selected, v) }); }} /></label>
              <label className="check token-nohp"><input type="checkbox" checked={Boolean(creature.hideHp)} disabled={busy}
                onChange={e => patchToken(selected, { meta: metaWithHideHp(selected, e.target.checked) })} /> Não mostrar vida aos jogadores</label>
            </>}
          </div>
          <div className="row master-actions">
            {selected.character_id
              ? <p className="muted">A imagem e o nome do token de jogador vêm da ficha dele.</p>
              : <button type="button" className="outline" disabled={busy} onClick={() => run(() => onEditImage(selected))}>
                {creature ? 'Editar criatura e ficha' : selected.image_path ? 'Trocar imagem' : 'Criar imagem do token'}</button>}
            {creature && !creature.noHp && <button type="button" className="outline" disabled={busy || !presets} onClick={() => run(async () => {
              const details = await loadCreatureDetails(selected.id);
              const p = await savePreset(board.table_id, {
                name: uniqueName(selected.name, (presets || []).map(x => x.name)), image_path: selected.image_path,
                max_hp: creature.maxHp, size: selected.size,
                details: { ...details, hideHp: Boolean(creature.hideHp), hideName: Boolean(selected.name_hidden) },
              });
              setPresets(prev => [...(prev || []), p]);
              setNotice(`Predefinição “${p.name}” salva.`);
            })}>Salvar como predefinição</button>}
            {!creature && !selected.character_id && selected.image_path && <button type="button" className="text-button" disabled={busy} onClick={() => patchToken(selected, { image_path: null })}>Tirar imagem</button>}
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
      {notice && <p role="status">{notice}</p>}
      </>}
    </div>
  </Modal>;
}
