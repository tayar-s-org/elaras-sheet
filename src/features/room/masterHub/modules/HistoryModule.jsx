import React, { useCallback, useEffect, useState } from 'react';
import { loadAudit } from '../../../../lib/masterHub.js';
import { resolveItem } from '../../../../market/items.js';
import { AUDIT_CATEGORIES, categoryLabel, auditDetails, auditTitle } from '../core.js';

const PAGE = 30;
const dt = iso => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
const dayStart = d => (d ? new Date(`${d}T00:00:00`).toISOString() : '');
const dayEnd = d => (d ? new Date(`${d}T23:59:59.999`).toISOString() : '');
const itemName = id => resolveItem({ id })?.name || id;

// Histórico administrativo: tudo o que o mestre fez pela Central (e pelo Grupo), com responsável, jogador, operação,
// valor antes → depois e data/hora. Filtros por período, jogador e categoria; cada linha abre os detalhes.
export default function HistoryModule({ ctx }) {
  const { tableId, players } = ctx;
  const [filters, setFilters] = useState({ from: '', to: '', characterId: '', category: '' });
  const [rows, setRows] = useState(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const query = f => ({ from: dayStart(f.from), to: dayEnd(f.to), characterId: f.characterId, category: f.category });
  const nameOf = id => players.find(p => p.id === id)?.name || (id ? 'Personagem removido' : '');

  const load = useCallback(async (offset = 0) => {
    setBusy(true);
    setError('');
    try {
      const page = await loadAudit(tableId, { ...query(filters), offset, limit: PAGE });
      setRows(prev => (offset ? [...(prev || []), ...page] : page));
      setMore(page.length === PAGE);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }, [tableId, filters]);
  useEffect(() => { load(0); }, [load]);

  const set = patch => setFilters(f => ({ ...f, ...patch }));
  return <div className="mh-sections">
    <section className="mh-section">
      <h3>Histórico administrativo</h3>
      <form className="mh-filters" onSubmit={e => { e.preventDefault(); load(0); }}>
        <label className="field"><span>De</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={e => set({ from: e.target.value })} /></label>
        <label className="field"><span>Até</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={e => set({ to: e.target.value })} /></label>
        <label className="field"><span>Jogador</span>
          <select value={filters.characterId} onChange={e => set({ characterId: e.target.value })}>
            <option value="">Todos</option>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
        <label className="field"><span>Categoria</span>
          <select value={filters.category} onChange={e => set({ category: e.target.value })}>
            <option value="">Todas</option>{AUDIT_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></label>
        <button type="button" className="outline" onClick={() => setFilters({ from: '', to: '', characterId: '', category: '' })}>Limpar filtros</button>
        <button type="button" className="outline" disabled={busy} onClick={() => load(0)}>Atualizar</button>
      </form>
      {error && <p role="alert" className="muted">{error}</p>}
      {rows === null && !error && <p className="muted" role="status">Carregando…</p>}
      {rows && !rows.length && <p className="muted">Nenhuma operação registrada com esses filtros.</p>}
      <ul className="mh-audit">
        {(rows || []).map(r => <li key={r.id}>
          <details>
            <summary>
              <span className={`mh-cat mh-cat-${r.category}`}>{categoryLabel(r.category)}</span>
              <span className="mh-audit-title">{auditTitle(r, nameOf(r.character_id), itemName)}</span>
              <time dateTime={r.created_at}>{dt(r.created_at)}</time>
            </summary>
            <dl className="mh-audit-detail">
              <div><dt>Responsável</dt><dd>{r.profiles?.display_name || 'Mestre'}</dd></div>
              <div><dt>Jogador afetado</dt><dd>{nameOf(r.character_id) || '—'}</dd></div>
              <div><dt>Operação</dt><dd>{categoryLabel(r.category)} · {r.kind}</dd></div>
              {auditDetails(r, itemName).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              {r.note ? <div><dt>Observação</dt><dd>{r.note}</dd></div> : null}
              <div><dt>Data e hora</dt><dd>{dt(r.created_at)}</dd></div>
              <div><dt>Identificador</dt><dd><small>{r.request_id || '—'}</small></dd></div>
            </dl>
          </details>
        </li>)}
      </ul>
      {more && <button type="button" className="outline" disabled={busy} onClick={() => load(rows.length)}>{busy ? 'Carregando…' : 'Carregar mais'}</button>}
    </section>
  </div>;
}
