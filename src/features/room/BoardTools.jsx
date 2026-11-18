import React, { useRef, useState } from 'react';
import { updateBoard, uploadMap, removeMap, addToken, updateToken, removeToken, clearMarks } from '../../lib/board.js';

const COLORS = ['#7a4dff', '#b3382c', '#2e9e5b', '#d9a21b', '#2f7fd0', '#444444'];

export default function BoardTools({ board, tokens, marks, members, characters, selected, onSelect, room, local, setError }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [npc, setNpc] = useState({ name: '', color: COLORS[1], size: 1 });
  const grid = board.grid || { size: 70, visible: true };

  const run = async fn => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const refreshOthers = () => room.sendBroadcast('board_refresh', {});
  const setGrid = patch => run(async () => {
    const next = { ...grid, ...patch };
    local.setBoard({ ...board, grid: next });
    await updateBoard(board.id, { grid: next });
  });

  const withoutToken = members.filter(m => m.status === 'approved' && m.role === 'player' && m.character_id && characters[m.character_id]
    && !tokens.some(t => t.character_id === m.character_id));
  const place = (i) => ({ x: board.width / 2 + (i % 5) * 20, y: board.height / 2 + (i % 5) * 20 });

  return <section className="board-tools item-card" aria-label="Ferramentas do mestre">
    <h3>Ferramentas do mestre</h3>
    <div className="row">
      <button className="outline" disabled={busy} onClick={() => fileRef.current.click()}>{board.map_path ? 'Trocar mapa' : 'Enviar mapa'}</button>
      {board.map_path && <button className="text-button danger" disabled={busy} onClick={() => window.confirm('Remover o mapa?') && run(async () => { await removeMap(board); local.setBoard({ ...board, map_path: null }); local.reloadMap(); })}>Remover mapa</button>}
      <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run(async () => { const r = await uploadMap(board, f); local.setBoard({ ...board, map_path: r.path, width: r.width, height: r.height }); local.reloadMap(); }); }} />
    </div>
    <p className="muted">PNG, JPEG ou WebP até 5 MB. Só quem está na mesa vê o mapa.</p>
    <div className="form-grid compact">
      <label className="field"><span>Tamanho da célula (px)</span>
        <input type="number" min="20" max="400" defaultValue={grid.size} key={grid.size}
          onBlur={e => { const v = Math.min(400, Math.max(20, Number(e.target.value) || 70)); if (v !== grid.size) setGrid({ size: v }); }} /></label>
      <label className="field"><span><input type="checkbox" checked={Boolean(grid.visible)} onChange={e => setGrid({ visible: e.target.checked })} /> Mostrar grade e ajustar à grade</span></label>
    </div>

    <h4>Tokens</h4>
    {withoutToken.length > 0 && <div className="row">
      {withoutToken.map((m, i) => <button key={m.user_id} className="outline" disabled={busy}
        onClick={() => run(async () => { const t = await addToken(board, { kind: 'pc', name: characters[m.character_id].name || m.profiles?.display_name, character_id: m.character_id, color: COLORS[(i + 2) % COLORS.length], ...place(i) }); local.setTokens(prev => (prev.some(x => x.id === t.id) ? prev : [...prev, t])); })}>
        + {characters[m.character_id].name || m.profiles?.display_name}</button>)}
    </div>}
    <form className="row" onSubmit={e => { e.preventDefault(); if (!npc.name.trim()) return; run(async () => { const t = await addToken(board, { kind: 'npc', name: npc.name.trim(), color: npc.color, size: Number(npc.size), ...place(tokens.length) }); local.setTokens(prev => (prev.some(x => x.id === t.id) ? prev : [...prev, t])); setNpc(n => ({ ...n, name: '' })); onSelect(t.id); }); }}>
      <input aria-label="Nome do inimigo" placeholder="Novo inimigo ou objeto" maxLength={60} value={npc.name} onChange={e => setNpc(n => ({ ...n, name: e.target.value }))} />
      <select aria-label="Cor" value={npc.color} onChange={e => setNpc(n => ({ ...n, color: e.target.value }))}>{COLORS.map(c => <option key={c} value={c} style={{ color: c }}>● {c}</option>)}</select>
      <select aria-label="Tamanho" value={npc.size} onChange={e => setNpc(n => ({ ...n, size: e.target.value }))}>
        <option value="0.5">Pequeno</option><option value="1">Médio</option><option value="2">Grande</option><option value="3">Enorme</option></select>
      <button className="primary" disabled={busy || !npc.name.trim()}>Adicionar</button>
    </form>

    {selected ? <div className="item-card">
      <strong>{selected.name || 'Sem nome'}</strong> <span className="muted">{selected.kind === 'pc' ? 'Personagem' : 'Inimigo/objeto'}</span>
      <div className="row">
        <label className="field"><span>Nome</span>
          <input maxLength={60} defaultValue={selected.name} key={`${selected.id}-${selected.name}`}
            onBlur={e => { const v = e.target.value.trim(); if (v !== selected.name) run(async () => { await updateToken(selected.id, { name: v }); local.setTokens(prev => prev.map(t => t.id === selected.id ? { ...t, name: v } : t)); }); }} /></label>
        <label className="field"><span>Tamanho</span>
          <select value={selected.size} onChange={e => run(async () => { const size = Number(e.target.value); await updateToken(selected.id, { size }); local.setTokens(prev => prev.map(t => t.id === selected.id ? { ...t, size } : t)); })}>
            <option value="0.5">Pequeno</option><option value="1">Médio</option><option value="2">Grande</option><option value="3">Enorme</option></select></label>
      </div>
      <div className="row">
        <button className="outline" disabled={busy} onClick={() => run(async () => { const hidden = !selected.hidden; await updateToken(selected.id, { hidden }); local.setTokens(prev => prev.map(t => t.id === selected.id ? { ...t, hidden } : t)); refreshOthers(); })}>
          {selected.hidden ? 'Revelar aos jogadores' : 'Ocultar dos jogadores'}</button>
        <button className="text-button danger" disabled={busy} onClick={() => window.confirm(`Remover o token ${selected.name}?`) && run(async () => { await removeToken(selected.id); local.setTokens(prev => prev.filter(t => t.id !== selected.id)); onSelect(null); })}>Remover token</button>
      </div>
    </div> : <p className="muted">Clique num token para editá-lo, ocultá-lo ou removê-lo.</p>}

    <button className="text-button danger" disabled={busy || !marks.length} onClick={() => window.confirm('Apagar todos os marcadores?') && run(async () => { await clearMarks(board.id); local.setMarks([]); })}>Limpar marcadores ({marks.length})</button>
  </section>;
}
