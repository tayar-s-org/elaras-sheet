import React from 'react';
import {ATTRIBUTES, calculate} from './rules.js';
import {equipmentText} from './market/inventory.js';
import {racialSummary} from './templates.js';

export default function MasterView({sheets,onEdit,onSave}) {
  return <main className="master-view"><h1>Visão do mestre</h1><p className="muted">Todas as fichas abertas, lado a lado. Use Editar para alterar um personagem. Cada PDF contém somente a ficha escolhida; os rascunhos ficam neste navegador.</p><div className="master-grid">{sheets.map(({id,character:c},i)=>{
    const d=calculate(c);
    return <article className="master-card" key={id}>
      <header><h2>{c.name || `Ficha ${i+1}`}</h2><p>{c.race} · {c.concept || 'Sem conceito'}</p><small>{c.player && `Jogador: ${c.player} · `}Nível {d.level} · {c.xp} XP</small></header>
      <div className="stats">{[['Vida máx.',d.life],['Stamina máx.',d.stamina],['Mana máx.',d.mana],['Movimento',d.movement],['Aparar',d.parry],['Resistência',d.toughness]].map(([k,v])=><div key={k}><strong>{v}</strong><span>{k}</span></div>)}</div>
      <h3>Atributos</h3><p>{ATTRIBUTES.map(a=>`${a} d${c.attributes[a]}`).join(' · ')}</p>
      <h3>Perícias</h3><div className="master-skills">{Object.entries(c.skills).filter(([,v])=>v).map(([k,v])=><span key={k}>{k} <b>d{v}</b></span>)}</div>
      {[['Vantagens',c.advantages],['Desvantagens',c.hindrances],['Poderes',c.powers]].map(([title,items])=><details key={title}><summary>{title} ({items.length})</summary>{items.map((x,j)=><div key={j}><b>{x.name || 'Sem nome'}{x.severity && ` (${x.severity})`}{x.cost && ` · Mana: ${x.cost}`}</b><p className="preserve-lines">{x.description}</p></div>)}</details>)}
      {[['Traços raciais',racialSummary(c)],['Equipamento',equipmentText(c)],['História',c.history],['Anotações',c.notes]].map(([title,text])=>text && <details key={title}><summary>{title}</summary><p className="preserve-lines">{text}</p></details>)}
      <p className={d.remaining<0?'negative':'muted'}>Pontos disponíveis: {d.remaining}</p>
      <div className="sheet-tools"><button className="primary" onClick={()=>onEdit(id)}>Editar</button><button className="outline" onClick={()=>onSave(c)}>Salvar PDF</button></div>
    </article>;
  })}</div></main>;
}
