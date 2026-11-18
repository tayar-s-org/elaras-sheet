import React, { useState } from 'react';
import { races, archetypes, applyRace, racialEffects, loadArchetype } from './templates.js';
import { newCharacter, SKILLS } from './rules.js';
import CustomArchetype from './CustomArchetype.jsx';

export default function Templates({ character:c, onChange, onLoad }) {
  const [view, setView] = useState('races');
  const [query, setQuery] = useState('');
  const race = races.find(r => r.id === c.raceId);
  const effects = racialEffects(c);
  return <section className="templates">
    <h3>Começar com o livro</h3>
    <div className="template-tabs"><button className={view==='races'?'primary':'outline'} onClick={()=>setView('races')}>Raças ({races.length})</button><button className={view==='archetypes'?'primary':'outline'} onClick={()=>setView('archetypes')}>Arquétipos prontos ({archetypes.length})</button><button className={view==='custom'?'primary':'outline'} onClick={()=>setView('custom')}>Criar o meu</button></div>
    {view === 'races' ? <>
      <label className="field"><span>Aplicar raça do livro</span><select value={c.raceId || ''} onChange={e => onChange(applyRace(c,e.target.value))}><option value="">Personalizada / ficha anterior</option>{races.map(r=><option key={r.id}>{r.id}</option>)}</select></label>
      {race && <div className="race-details">
        <h3>{race.id} <small>Livro · página {race.page} do PDF</small></h3>
        {race.id==='Meio-elfo' && <label className="field"><span>Herança</span><select value={c.raceChoice} onChange={e=>onChange(applyRace(c,c.raceId,e.target.value,c.raceSkill))}><option>Agilidade</option><option>Vantagem</option></select></label>}
        {race.id==='Androide' && <label className="field"><span>Programação: perícia gratuita d6</span><select value={c.raceSkill} onChange={e=>onChange(applyRace(c,c.raceId,c.raceChoice,e.target.value))}>{SKILLS.map(([name])=><option key={name}>{name}</option>)}</select></label>}
        <div className="callout"><b>Aplicado nos cálculos</b><p>{Object.entries(effects.base).map(([name,die])=>`${name} começa em d${die}, sem custo. `)}{effects.skill && `${effects.skill} d6 gratuita. `}{effects.toughness ? `Resistência ${effects.toughness > 0 ? '+' : ''}${effects.toughness}. ` : ''}{effects.movement ? 'Movimento −1 em relação à fórmula da mesa (adaptação do movimento 5 do livro). ' : ''}{effects.freeEdges ? 'A primeira vantagem da lista é gratuita e fica fora da sequência de custos. ' : ''}{!Object.keys(effects.base).length && !effects.skill && !effects.toughness && !effects.freeEdges ? 'Veja os bônus situacionais abaixo. ' : ''}Complicações raciais não concedem pontos extras.</p>
        <p>Carisma racial: {effects.charisma > 0 ? '+' : ''}{effects.charisma} (aplique apenas no contexto indicado). Benes extras: {effects.benes}. {effects.notice ? `Perceber +${effects.notice}. ` : ''}{effects.climb ? `Escalar +${effects.climb} em superfícies apropriadas.` : ''}</p></div>
        <details><summary>Descrição e todos os traços raciais</summary>{race.text.map((text,i)=><p key={i}>{text}</p>)}</details>
        <p className="muted">Visão, imunidades, voo, penalidades e demais efeitos condicionais são lembretes para as rolagens. Os valores dos dados não incluem modificadores de testes. Trocar de raça mantém os avanços pagos dos atributos.</p>
      </div>}
    </> : view === 'custom' ? <CustomArchetype character={c} onChange={onChange} onLoad={onLoad} />
    : <>
      <p className="muted">Escolha um modelo para carregar atributos, perícias, vantagens e uma sugestão de bagagem. Depois preencha nome e história. Todos os modelos do livro são humanos; você pode trocar a raça depois. Magias e equipamento dependem do cenário e da aprovação do mestre.</p>
      <label className="field"><span>Buscar arquétipo</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Mago, ladrão, atirador…" /></label>
      <div className="archetype-grid">{archetypes.filter(a=>a.id.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(query.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''))).map(a=><article className="archetype-card" key={a.id}>
        <h3>{a.id}</h3><small>Humano · Novato · PDF {a.page}</small>
        <p>{Object.entries(a.attributes).map(([k,v])=>`${k} d${v}`).join(' · ')}</p>
        <p><b>Vantagens:</b> {a.advantages.join(', ')}</p>
        <details><summary>Ver perícias</summary><p>{Object.entries(a.skills).map(([k,v])=>`${k} d${v}`).join(' · ')}</p>{a.extraSkills>0 && <p>+{a.extraSkills} pontos distribuídos como sugestão ao carregar.</p>}</details>
        <button className="primary" onClick={()=>onLoad(`Carregar ${a.id}?`,()=>onChange(loadArchetype(newCharacter(),a,c)))}>Usar {a.id}</button>
      </article>)}</div>
    </>}
  </section>;
}
