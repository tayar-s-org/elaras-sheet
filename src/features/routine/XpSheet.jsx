import React, { useMemo, useState } from 'react';
import { xpSheetRows, sortXpRows, xpSheetTotals } from '../../rpg/history.js';
import { evolutionCost, MODALITY_LABEL } from '../../rpg/progression.js';
import { describeDie, readDie, stepUp } from '../../rpg/dice.js';
import { accumulationCap, pointsOf } from '../../rpg/aptitude.js';
import { tickToParts, formatDay } from '../../rpg/clock.js';
import { fmt } from '../../rpg/describe.js';

const KIND_LABEL = { skill: 'Perícia', attribute: 'Atributo', spell: 'Feitiço' };
const FILTERS = [['all', 'Todos'], ['attribute', 'Atributos'], ['skill', 'Perícias'], ['spell', 'Feitiços']];
const COLUMNS = [
  ['label', 'Característica treinada', 'text'], ['kind', 'Tipo', 'text'], ['die', 'Dado', 'num'], ['earned', 'Pts. adquiridos', 'num'],
  ['spent', 'Pts. aplicados', 'num'], ['available', 'Pts. disponíveis', 'num'], ['lastTick', 'Último treino', 'text'],
];
const hh = h => `${String(h).padStart(2, '0')}:00`;

// Planilha de XP do personagem: uma linha por característica (atributo, perícia ou feitiço) com o que já foi adquirido,
// aplicado em evoluções e ainda disponível. Clique no cabeçalho para ordenar e numa linha para ver Normal/Focado e evoluir.
export default function XpSheet({ pools, character, allocation, spellName, lastTicks, owner, closed, busy, onEvolve }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [onlyFree, setOnlyFree] = useState(false);
  const [sort, setSort] = useState({ key: 'kind', dir: 'asc' });
  const [open, setOpen] = useState(null);

  const rows = useMemo(() => xpSheetRows(pools, {
    lastTicks,
    dieOf: (kind, name) => (kind === 'spell' || !character ? 0 : readDie(character, kind, name).die),
    nameOf: (kind, name) => (kind === 'spell' ? spellName(name) : name),
  }), [pools, lastTicks, character, spellName]);
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => sortXpRows(
    rows.filter(r => (filter === 'all' || r.kind === filter) && (!onlyFree || r.available > 0) && (!q || r.label.toLowerCase().includes(q))),
    sort.key, sort.dir,
  ), [rows, filter, onlyFree, q, sort]);
  const totals = xpSheetTotals(visible);
  const toggleSort = key => setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'label' || key === 'kind' ? 'asc' : 'desc' }));
  const evolvable = r => r.kind !== 'spell' && character;
  const costOf = r => evolutionCost(readDie(character, r.kind, r.name));
  const canEvolve = r => evolvable(r) && ['normal', 'focused'].some(m => r[m] && r[m].available >= costOf(r));

  return <div className="xs">
    <div className="xs-tools">
      <div className="xs-filters" role="tablist" aria-label="Tipo de característica">
        {FILTERS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? 'primary' : 'outline'} onClick={() => setFilter(id)}>
          {label} <span className="xs-count">{id === 'all' ? rows.length : rows.filter(r => r.kind === id).length}</span></button>)}
      </div>
      <input type="search" className="xs-search" placeholder="Buscar característica…" aria-label="Buscar característica" value={query} onChange={e => setQuery(e.target.value)} />
      <label className="check xs-free"><input type="checkbox" checked={onlyFree} onChange={e => setOnlyFree(e.target.checked)} /> Só com pontos disponíveis</label>
    </div>

    <div className="xs-scroll">
      <table className="xs-table">
        <thead><tr>
          {COLUMNS.map(([key, label, kind]) => <th key={key} scope="col" className={`xs-${kind}`} aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
            <button type="button" className="xs-sort" onClick={() => toggleSort(key)}>{label}<span aria-hidden="true">{sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span></button></th>)}
          <th scope="col"><span className="sr-only">Detalhes</span></th>
        </tr></thead>
        <tbody>
          {!visible.length && <tr><td colSpan={COLUMNS.length + 1} className="xs-empty">{rows.length ? 'Nenhuma característica com esses filtros.' : 'Ainda não há XP de treino. Ela aparece depois que o mestre avançar o tempo com treinos na rotina.'}</td></tr>}
          {visible.map(r => {
            const last = r.lastTick == null ? null : tickToParts(r.lastTick);
            const isOpen = open === r.key;
            return <React.Fragment key={r.key}>
              <tr className={`xs-row k-${r.kind}${isOpen ? ' open' : ''}`} onClick={() => setOpen(o => (o === r.key ? null : r.key))}>
                <th scope="row" data-label="Característica" className="xs-name">{r.label}{canEvolve(r) && <span className="xs-can" title="Tem XP suficiente para evoluir">pode evoluir</span>}</th>
                <td data-label="Tipo"><span className={`xs-kind k-${r.kind}`}>{KIND_LABEL[r.kind]}</span></td>
                <td data-label="Dado" className="xs-num">{r.die ? `d${r.die}` : '—'}</td>
                <td data-label="Pts. adquiridos" className="xs-num">{fmt(r.earned)}</td>
                <td data-label="Pts. aplicados" className="xs-num">{fmt(r.spent)}</td>
                <td data-label="Pts. disponíveis" className={`xs-num xs-free-cell${r.available > 0 ? ' on' : ''}`}>{fmt(r.available)}</td>
                <td data-label="Último treino" className="xs-last">{last ? <>{formatDay(last.dayNo)} <small>{hh(last.hour)}</small></> : '—'}</td>
                <td className="xs-toggle"><button type="button" className="text-button" aria-expanded={isOpen} aria-label={`Detalhes de ${r.label}`} onClick={e => { e.stopPropagation(); setOpen(o => (o === r.key ? null : r.key)); }}>{isOpen ? '▾' : '▸'}</button></td>
              </tr>
              {isOpen && <tr className="xs-detail"><td colSpan={COLUMNS.length + 1}>
                <div className="xs-detail-body">
                  <table className="th-xp"><thead><tr><th /><th>Disponível</th><th>Adquirida</th><th>Aplicada</th></tr></thead>
                    <tbody>{['normal', 'focused'].map(m => {
                      const p = r[m];
                      return <tr key={m}><th scope="row">{MODALITY_LABEL[m]}</th>
                        <td>{p ? `${fmt(p.available)} / ${fmt(accumulationCap(r.kind, pointsOf(allocation, r.kind, r.name)))}` : '—'}</td><td>{p ? fmt(p.earned_total) : '—'}</td><td>{p ? fmt(p.spent_total) : '—'}</td></tr>;
                    })}</tbody></table>
                  {evolvable(r) ? <div className="th-evolve">
                    <span className="muted">Próxima evolução: {describeDie(stepUp(readDie(character, r.kind, r.name)))} · custa {costOf(r)} XP</span>
                    {['normal', 'focused'].map(m => {
                      const can = owner && !closed && r[m] && r[m].available >= costOf(r);
                      return <button key={m} type="button" className={can ? 'primary' : 'outline'} disabled={!can || Boolean(busy)} title={owner ? (r[m] ? `Disponível: ${fmt(r[m].available)}` : 'Sem XP neste acumulador') : 'Só o dono da ficha evolui'}
                        onClick={() => onEvolve({ kind: r.kind, name: r.name }, m)}>{busy === `${r.kind}${r.name}${m}` ? 'Evoluindo…' : `Evoluir (${MODALITY_LABEL[m]})`}</button>;
                    })}
                  </div> : <p className="muted th-hint">A XP de feitiço só acumula por enquanto; o que ela compra ainda não foi definido.</p>}
                </div>
              </td></tr>}
            </React.Fragment>;
          })}
        </tbody>
        {visible.length > 0 && <tfoot><tr>
          <th scope="row" colSpan={3}>Total ({visible.length})</th>
          <td className="xs-num">{fmt(totals.earned)}</td><td className="xs-num">{fmt(totals.spent)}</td><td className="xs-num xs-free-cell on">{fmt(totals.available)}</td><td colSpan={2} />
        </tr></tfoot>}
      </table>
    </div>
  </div>;
}
