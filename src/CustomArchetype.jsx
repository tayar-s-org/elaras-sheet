import React, { useState } from 'react';
import { useConfirm } from './ui/ConfirmProvider.jsx';
import { ATTRIBUTES, SKILLS, DICE, calculate } from './rules.js';
import { blankDraft, draftFromSheet, isDraftDirty } from './archetypeDraft.js';
import { useReportUnsavedChanges } from './unsavedChanges.js';
import { loadCustomArchetype, advantageNames } from './templates.js';
import './custom-archetype.css';

const KEY = 'manrakora-custom-archetypes';
const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch { return []; } };
const store = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* sem storage */ } };

// Aba "Criar o meu": monta um arquétipo próprio, aplica na ficha e guarda como modelo reutilizável neste navegador.
export default function CustomArchetype({ character: c, onChange, onLoad }) {
  const askConfirm = useConfirm();
  const [draft, setDraft] = useState(blankDraft);
  const [baseline, setBaseline] = useState(draft); // ponto de partida do rascunho: so o que diverge dele se perderia ao fechar
  const [saved, setSaved] = useState(load);
  const [skillPick, setSkillPick] = useState('');
  const [edgePick, setEdgePick] = useState('');
  const set = patch => setDraft(d => ({ ...d, ...patch }));
  const startDraft = next => { setDraft(next); setBaseline(next); };
  useReportUnsavedChanges(isDraftDirty(draft, baseline));
  const ready = draft.name.trim().length > 0;
  const tpl = { ...draft, name: draft.name.trim() };
  const remaining = ready ? calculate(loadCustomArchetype(c, tpl)).remaining : null;
  const freeSkills = SKILLS.map(([n]) => n).filter(n => !(n in draft.skills));

  function addEdge() {
    const name = edgePick.trim();
    if (name && !draft.advantages.some(a => a.toLowerCase() === name.toLowerCase())) set({ advantages: [...draft.advantages, name] });
    setEdgePick('');
  }
  function save() {
    const item = { ...tpl, id: draft.id || (crypto.randomUUID?.() || String(Date.now())) };
    const next = saved.some(s => s.id === item.id) ? saved.map(s => (s.id === item.id ? item : s)) : [...saved, item];
    setSaved(next);
    store(next);
    setBaseline(item);
    set({ id: item.id });
  }
  function remove(id) {
    const next = saved.filter(s => s.id !== id);
    setSaved(next);
    store(next);
    if (draft.id === id) set({ id: '' });
  }
  const apply = (t, afterApply) => onLoad(`Aplicar o arquétipo ${t.name}?`, () => { onChange(loadCustomArchetype(c, t)); afterApply?.(); });

  return <div className="custom-arch">
    <p className="muted">Monte o seu próprio modelo: atributos, perícias e vantagens. O equipamento você compra no Mercado. Depois aplique na ficha ou guarde para reutilizar. Os pontos seguem as regras da mesa, e você vê o saldo antes de aplicar.</p>
    <div className="row token-row">
      <button type="button" className="outline" onClick={() => startDraft(draftFromSheet(c))}>Começar da minha ficha</button>
      <button type="button" className="text-button" onClick={() => startDraft(blankDraft())}>Limpar</button>
    </div>
    <label className="field"><span>Nome do arquétipo</span>
      <input maxLength={60} value={draft.name} onChange={e => set({ name: e.target.value })} placeholder="Ex.: Bardo errante, Caçador de recompensas…" /></label>

    <fieldset className="custom-set"><legend>Atributos</legend>
      <div className="custom-attrs">{ATTRIBUTES.map(a => <label key={a} className="field"><span>{a}</span>
        <select value={draft.attributes[a]} onChange={e => set({ attributes: { ...draft.attributes, [a]: Number(e.target.value) } })}>{DICE.map(d => <option key={d} value={d}>d{d}</option>)}</select></label>)}</div>
    </fieldset>

    <fieldset className="custom-set"><legend>Perícias</legend>
      {Object.entries(draft.skills).map(([name, die]) => <div className="custom-line" key={name}>
        <span>{name}</span>
        <select className="die" aria-label={`Dado de ${name}`} value={die} onChange={e => set({ skills: { ...draft.skills, [name]: Number(e.target.value) } })}>{DICE.map(d => <option key={d} value={d}>d{d}</option>)}</select>
        <button type="button" className="text-button danger" aria-label={`Remover ${name}`} onClick={() => { const { [name]: _removed, ...rest } = draft.skills; set({ skills: rest }); }}>×</button>
      </div>)}
      <div className="custom-line">
        <select aria-label="Nova perícia" value={skillPick} onChange={e => setSkillPick(e.target.value)}><option value="">Adicionar perícia…</option>{freeSkills.map(n => <option key={n}>{n}</option>)}</select>
        <button type="button" className="outline" disabled={!skillPick} onClick={() => { set({ skills: { ...draft.skills, [skillPick]: 4 } }); setSkillPick(''); }}>Adicionar</button>
      </div>
    </fieldset>

    <fieldset className="custom-set"><legend>Vantagens</legend>
      <div className="custom-chips">{draft.advantages.map(a => <span className="chip-edge" key={a}>{a}<button type="button" aria-label={`Remover ${a}`} onClick={() => set({ advantages: draft.advantages.filter(x => x !== a) })}>×</button></span>)}
        {!draft.advantages.length && <span className="muted">Nenhuma ainda.</span>}</div>
      <div className="custom-line">
        <input list="custom-arch-edges" aria-label="Nova vantagem" value={edgePick} placeholder="Busque no livro ou digite uma" onChange={e => setEdgePick(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEdge(); } }} />
        <datalist id="custom-arch-edges">{advantageNames.map(n => <option key={n} value={n} />)}</datalist>
        <button type="button" className="outline" disabled={!edgePick.trim()} onClick={addEdge}>Adicionar</button>
      </div>
    </fieldset>

    {ready && <p className="callout">Saldo de pontos de criação depois de aplicar: <b className={remaining < 0 ? 'negative' : ''}>{remaining}</b>{remaining < 0 ? ' (acima do orçamento da ficha)' : ''}</p>}
    <div className="row token-row">
      <button type="button" className="primary" disabled={!ready} onClick={() => apply(tpl, () => setBaseline(draft))}>Aplicar na minha ficha</button>
      <button type="button" className="outline" disabled={!ready} onClick={save}>{draft.id ? 'Atualizar meu modelo' : 'Salvar como meu modelo'}</button>
    </div>

    {saved.length > 0 && <>
      <h3>Meus arquétipos ({saved.length})</h3>
      <div className="archetype-grid">{saved.map(t => <article className="archetype-card" key={t.id}>
        <h3>{t.name}</h3>
        <p>{Object.entries(t.attributes).map(([k, v]) => `${k} d${v}`).join(' · ')}</p>
        {Object.keys(t.skills).length > 0 && <p><b>Perícias:</b> {Object.entries(t.skills).map(([k, v]) => `${k} d${v}`).join(' · ')}</p>}
        {t.advantages.length > 0 && <p><b>Vantagens:</b> {t.advantages.join(', ')}</p>}
        <div className="row token-row">
          <button type="button" className="primary" onClick={() => apply(t)}>Usar {t.name}</button>
          <button type="button" className="outline" onClick={() => startDraft({ ...t })}>Editar</button>
          <button type="button" className="text-button danger" onClick={async () => await askConfirm({ title: 'Apagar modelo?', text: `Apagar o modelo "${t.name}"?`, actionLabel: 'Apagar modelo', danger: true }) && remove(t.id)}>Apagar</button>
        </div>
      </article>)}</div>
    </>}
  </div>;
}
