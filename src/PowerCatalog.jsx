import React, { useEffect, useState } from 'react';
import { normalize, powersFromBook, stageForXP, stageIndex, stages } from './catalogRules.js';

export default function PowerCatalog({ character, onAdd, onOpenPage }) {
  const [open, setOpen] = useState(false);
  const [powers, setPowers] = useState(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [rank, setRank] = useState('');
  const currentStage = stageForXP(character.xp);

  useEffect(() => {
    if (!open || powers || error) return;
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}assets/book.json`, { signal:controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(book => {
        const entries = powersFromBook(book.pages);
        if (!entries.length) throw new Error();
        setPowers(entries);
      })
      .catch(err => { if (err.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, [open, powers, error]);

  const results = powers?.filter(power => !(rank && rank !== power.stage) && normalize(`${power.name} ${power.summary}`).includes(normalize(query)));
  return <details className="catalog power-catalog" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><strong>Buscar poderes no livro</strong></summary>
    <p className="muted">Seu estágio: {currentStage}. Os custos vêm do livro; confirme com o mestre como se aplicam à mana da mesa.</p>
    <div className="catalog-filters">
      <label className="field"><span>Buscar por nome ou efeito</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Cura, raio, armadura…" /></label>
      <label className="field"><span>Estágio exigido</span><select value={rank} onChange={event => setRank(event.target.value)}><option value="">Todos</option>{[...stages, 'Especial'].map(stage => <option key={stage}>{stage}</option>)}</select></label>
    </div>
    {error ? <p role="status">Não foi possível carregar os poderes. <button className="text-button" onClick={() => setError(false)}>Tentar novamente</button></p> : !results ? <p role="status">Carregando poderes do livro…</p> : <>
      <p className="muted" role="status">{results.length} de {powers.length} poderes</p>
      <div className="catalog-results">{results.map(power => {
        const added = character.powers.some(item => normalize(item.name) === normalize(power.name));
        const locked = stageIndex(power.stage) > stageIndex(currentStage);
        const description = [`Estágio: ${power.stage}. Alcance: ${power.range}. Duração: ${power.duration}.`, power.summary, `Fonte: página ${power.page} do PDF.`].filter(Boolean).join('\n\n');
        return <details className="catalog-entry" key={power.name}>
          <summary><b>{power.name}</b><span>{power.stage} · Custo do livro: {power.cost}{added ? ' · Na ficha' : ''}</span></summary>
          <p><strong>Alcance:</strong> {power.range} · <strong>Duração:</strong> {power.duration}</p>
          {power.summary && <p>{power.summary}</p>}
          {locked && <p>Disponível a partir de {stageIndex(power.stage) * 20} XP.</p>}
          {power.stage === 'Especial' && <p>Confirme os requisitos na página do livro antes de adicionar.</p>}
          <div className="catalog-actions">
            <button className="text-button" onClick={() => onOpenPage(power.page)}>Ver página {power.page} do PDF ↗</button>
            <button className="primary" disabled={added || locked} onClick={() => onAdd({name:power.name, cost:power.cost, damage:power.damage, range:power.range, duration:power.duration, description})}>{added ? 'Já adicionado' : locked ? 'Estágio insuficiente' : power.stage === 'Especial' ? 'Adicionar para revisão' : 'Adicionar à ficha'}</button>
          </div>
        </details>;
      })}{!results.length && <p>Nenhum poder encontrado. <button className="text-button" onClick={() => {setQuery('');setRank('');}}>Limpar filtros</button></p>}</div>
    </>}
  </details>;
}
