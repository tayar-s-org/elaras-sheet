import React, { useState } from 'react';
import catalog from './catalog.json';
import { calculate } from './rules.js';
import { checkAdvantage, normalize, stageForXP, stages } from './catalogRules.js';

const advantageNames = catalog.filter(entry => entry.kind === 'advantages').map(entry => entry.name);

export default function Catalog({ character, onAdd, onOpenPage }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('advantages');
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [stage, setStage] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const current = calculate(character);
  const categories = [...new Set(catalog.filter(e => e.kind === kind).map(e => e.category))];
  const entries = catalog.filter(e => e.kind === kind && (!category || e.category === category) && (!severity || e.severities.includes(severity)) && normalize(`${e.name} ${e.requirements} ${e.description}`).includes(normalize(query)))
    .map(entry => ({entry, check:kind === 'advantages' ? checkAdvantage(entry, character, advantageNames, current) : null}))
    .filter(({check}) => !check || ((!stage || check.stage === stage) && (!availableOnly || (!check.missing.length && !check.manual.length))));
  return <section className="catalog">
    <h3>Escolher no livro</h3>
    <p className="muted">Leia os efeitos antes de adicionar. Os pontos seguem as regras da mesa. Requisitos que a ficha não consegue verificar são marcados para revisão.</p>
    <div className="catalog-filters"><label className="field"><span>Tipo</span><select value={kind} onChange={e => {setKind(e.target.value);setCategory('');setSeverity('');}}><option value="advantages">Vantagens</option><option value="hindrances">Desvantagens / Complicações</option></select></label>
      <label className="field"><span>Buscar por nome, requisito ou efeito</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Carismático, arco, Espírito…" /></label>
      <label className="field"><span>{kind === 'advantages' ? 'Categoria' : 'Impacto'}</span>{kind === 'advantages' ? <select value={category} onChange={e => setCategory(e.target.value)}><option value="">Todas</option>{categories.map(x => <option key={x}>{x}</option>)}</select> : <select value={severity} onChange={e => setSeverity(e.target.value)}><option value="">Todos</option><option>Menor</option><option>Maior</option></select>}</label>
      {kind === 'advantages' && <label className="field"><span>Estágio exigido</span><select value={stage} onChange={e => setStage(e.target.value)}><option value="">Todos</option>{stages.map(value => <option key={value}>{value}</option>)}</select></label>}
    </div>
    {kind === 'advantages' && <div className="catalog-toolbar"><span>{stageForXP(character.xp)} · {character.xp} XP · {current.remaining} pontos livres</span><label><input type="checkbox" checked={availableOnly} onChange={e => setAvailableOnly(e.target.checked)} /> Só com requisitos atendidos</label></div>}
    <p className="muted" role="status">{entries.length} opções • {catalog.filter(e => e.kind === kind).length} no catálogo</p>
    <div className="catalog-results">{entries.map(({entry, check}) => {
      const added = character[kind].some(x => normalize(x.name) === normalize(entry.name));
      const add = impact => onAdd(kind, {name:entry.name, description:[entry.requirements && `Requisitos: ${entry.requirements}`,entry.description,`Fonte: livro, página ${entry.page} do PDF.`].filter(Boolean).join('\n\n'), ...(kind === 'advantages' ? {power:false} : {severity:impact})});
      const status = added ? 'Na ficha · pode repetir' : check?.missing.length ? 'Requisitos pendentes' : check?.manual.length ? 'Revisão do mestre' : check ? 'Disponível' : '';
      return <details className="catalog-entry" key={entry.id}><summary><b>{entry.name}</b><span>{[check?.stage, check ? entry.category : entry.severities.join(' / '), status].filter(Boolean).join(' · ')}</span></summary>
        {entry.requirements && <p><strong>Requisitos:</strong> {entry.requirements}</p>}
        {check && <p><strong>{added ? 'Custo de repetir:' : 'Custo nesta ficha:'}</strong> {check.cost} {check.cost === 1 ? 'ponto' : 'pontos'}.{check.missing.length > 0 && <><br /><strong>Falta:</strong> {check.missing.join('; ')}.</>}{check.manual.length > 0 && <><br /><strong>Confirme com o mestre:</strong> {check.manual.join('; ')}.</>}</p>}
        <div className="catalog-description">{entry.description.split('\n\n').map((p,i) => <p key={i}>{p}</p>)}</div>
        <div className="catalog-actions"><button className="text-button" onClick={() => onOpenPage(entry.page)}>Ver página {entry.page} do PDF ↗</button>
          {check ? <button className="primary" disabled={check.missing.length > 0} onClick={() => add()}>{check.missing.length ? 'Requisitos pendentes' : added ? `Adicionar outra (${check.cost} ${check.cost === 1 ? 'ponto' : 'pontos'})` : check.manual.length ? 'Adicionar para revisão' : 'Adicionar à ficha'}</button> : entry.severities.map(s => <button key={s} className="primary" disabled={added} onClick={() => add(s)}>Adicionar {s.toLowerCase()} (+{s === 'Maior' ? 5 : 3})</button>)}
        </div>
      </details>;
    })}{!entries.length && <p>Nenhuma opção encontrada. <button className="text-button" onClick={() => {setQuery('');setCategory('');setSeverity('');setStage('');setAvailableOnly(false);}}>Limpar filtros</button></p>}</div>
  </section>;
}
