import React, { useState } from 'react';
import { adjustXp, adjustExperience, upsertExperienceType, deleteExperienceType } from '../../../../lib/masterHub.js';
import { previewAdjust } from '../core.js';
import ExperienceIcon from '../ExperienceIcon.jsx';
import IconPicker from '../IconPicker.jsx';
import { IMAGE_ICONS, iconText } from '../experienceIcons.js';
import { PlayerPicker, BatchResults, useMasterRun, targetsFor, defaultTarget, previewText } from '../ui.jsx';

const MODES = [['add', 'Somar'], ['subtract', 'Remover'], ['set', 'Definir valor']];
const apiOf = (mode, n) => (mode === 'set' ? { mode: 'set', amount: n } : { mode: 'add', amount: mode === 'subtract' ? -Math.abs(n) : Math.abs(n) });
const useTarget = players => {
  const [target, setTarget] = useState(null);
  return [target === 'all' || players.some(p => p.id === target) ? target : defaultTarget(players), setTarget];
};

// Experiências: o XP de evolução (o do nível, o mesmo do Grupo) e os tipos de experiência criados pelo mestre
// (contadores nomeados por personagem, ex.: Reputação; não mexem em XP nem em nível).
export default function ExperienceModule({ ctx }) {
  const { tableId, players, extras, closed } = ctx;
  return <div className="mh-sections">
    <Xp tableId={tableId} players={players} closed={closed} />
    <Types tableId={tableId} extras={extras} closed={closed} />
    <Counters tableId={tableId} players={players} extras={extras} closed={closed} />
  </div>;
}

function Xp({ tableId, players, closed }) {
  const [target, setTarget] = useTarget(players);
  const [mode, setMode] = useState('add');
  const [text, setText] = useState('5');
  const [note, setNote] = useState('');
  const run = useMasterRun();
  const targets = targetsFor(players, target);
  const api = apiOf(mode, Math.trunc(Number(text)));
  const previews = targets.map(p => ({ p, v: previewAdjust('xp', p.xp, api.mode, api.amount) }));
  const bad = previews.find(x => !x.v.ok);
  async function submit(e) {
    e.preventDefault();
    if (bad || closed || !targets.length) return;
    await run.start({
      title: `${MODES.find(m => m[0] === mode)[1]} XP`, actionLabel: 'Aplicar', danger: mode !== 'add',
      text: previewText([`${targets.length === 1 ? targets[0].name : `${targets.length} jogadores`}:`, ...previews.map(({ p, v }) => `${p.name}: ${v.current} XP (nível ${Math.floor(v.current / 5)}) → ${v.next} XP (nível ${Math.floor(v.next / 5)})`)]),
      opKey: `xp:${mode}:${text}:${note}`, targets,
      fn: (t, requestId) => adjustXp({ tableId, characterId: t.id, ...api, note, requestId }),
    });
  }
  return <section className="mh-section" aria-labelledby="mh-xp-h">
    <h3 id="mh-xp-h">XP de evolução</h3>
    <p className="muted mh-hint">É o XP do nível (nível = XP ÷ 5). Treino, aptidão e estudo de magia continuam nos sistemas deles.</p>
    <form className="mh-form" onSubmit={submit}>
      <PlayerPicker players={players} value={target} onChange={setTarget} />
      <div className="tabs-row" role="group" aria-label="Operação">
        {MODES.map(([k, l]) => <button key={k} type="button" className={mode === k ? 'primary' : 'outline'} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}
      </div>
      <label className="field"><span>{mode === 'set' ? 'Novo XP' : 'Quantidade'}</span>
        <input type="number" inputMode="numeric" value={text} onChange={e => setText(e.target.value)} onFocus={e => e.target.select()} /></label>
      <label className="field"><span>Observação (opcional)</span><input maxLength={200} value={note} onChange={e => setNote(e.target.value)} /></label>
      <button className="primary" disabled={Boolean(bad) || closed || run.busy || !targets.length}>Aplicar</button>
    </form>
    <ul className="mh-preview" aria-label="Prévia">
      {previews.map(({ p, v }) => <li key={p.id}><b>{p.name}</b> {p.xp} XP · nível {p.level}{v.ok ? <> → <b>{v.next} XP</b> · nível {Math.floor(v.next / 5)}</> : <small className="muted"> · {v.error}</small>}</li>)}
    </ul>
    <BatchResults run={run} />
  </section>;
}

function Types({ tableId, extras, closed }) {
  const empty = { id: null, name: '', icon: IMAGE_ICONS[0].key, category: '', description: '' };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const run = useMasterRun({ onDone: () => extras.refresh() });
  const set = patch => setForm(f => ({ ...f, ...patch }));
  async function save(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Dê um nome à experiência.'); return; }
    const b = await run.start({
      title: form.id ? 'Experiência alterada' : 'Experiência criada', skipConfirm: true, opKey: `xptype:${form.id || 'new'}:${form.name}`, targets: [{ id: 't', name: form.name.trim() }],
      fn: (t, requestId) => upsertExperienceType({ tableId, ...form, requestId }),
    });
    if (b?.results.every(r => r.ok)) setForm(empty);
  }
  async function remove(t) {
    const holders = Object.entries(extras.experience).filter(([, w]) => (w[t.id] || 0) > 0);
    await run.start({
      title: 'Apagar experiência', actionLabel: 'Apagar experiência', danger: true, opKey: `xptype-del:${t.id}`, targets: [{ id: t.id, name: t.name }],
      text: previewText([`Apagar o tipo ${iconText(t.icon)} ${t.name}?`, holders.length ? `Isso apaga os valores de ${holders.length} personagem(ns). Fica registrado no histórico.` : 'Nenhum personagem tem valor nele.', 'Não dá para desfazer.']),
      fn: (x, requestId) => deleteExperienceType({ tableId, id: t.id, force: true, requestId }),
    });
  }
  return <section className="mh-section" aria-labelledby="mh-types-h">
    <h3 id="mh-types-h">Tipos de experiência</h3>
    <p className="muted mh-hint">Crie novas formas de progressão (Reputação, Maestria, Fama…). Cada uma é um contador por personagem, visível para todos da mesa (ficha, Grupo e resumo do token), como o XP.</p>
    {extras.status === 'unavailable' && <p className="callout">Falta aplicar a migração 0040 no Supabase.</p>}
    <ul className="mh-list">
      {extras.types.map(t => <li key={t.id}>
        <span><b><ExperienceIcon icon={t.icon} /> {t.name}</b>{t.category ? <small> · {t.category}</small> : null}{t.description ? <small className="muted"> — {t.description}</small> : null}</span>
        <span className="tabs-row">
          <button type="button" className="outline" disabled={closed} onClick={() => setForm({ id: t.id, name: t.name, icon: t.icon, category: t.category || '', description: t.description || '' })}>Editar</button>
          <button type="button" className="outline danger" disabled={closed || run.busy} onClick={() => remove(t)}>Apagar</button>
        </span>
      </li>)}
      {!extras.types.length && <li className="muted">Nenhum tipo criado ainda.</li>}
    </ul>
    <form className="mh-form" onSubmit={save}>
      <h4>{form.id ? 'Editar experiência' : 'Nova experiência'}</h4>
      <label className="field"><span>Nome</span><input maxLength={40} value={form.name} onChange={e => set({ name: e.target.value })} placeholder="Ex.: Reputação" /></label>
      <IconPicker icons={IMAGE_ICONS} value={form.icon} onChange={icon => set({ icon })} label="Ícone da experiência" />
      <label className="field"><span>Categoria</span><input maxLength={30} value={form.category} onChange={e => set({ category: e.target.value })} placeholder="Ex.: social" /></label>
      <label className="field"><span>Descrição</span><input maxLength={300} value={form.description} onChange={e => set({ description: e.target.value })} /></label>
      {error && <p role="alert" className="muted">{error}</p>}
      <div className="tabs-row">
        <button className="primary" disabled={closed || run.busy}>{form.id ? 'Salvar experiência' : 'Criar experiência'}</button>
        {form.id && <button type="button" className="outline" onClick={() => setForm(empty)}>Cancelar edição</button>}
      </div>
    </form>
    <BatchResults run={run} />
  </section>;
}

function Counters({ tableId, players, extras, closed }) {
  const [target, setTarget] = useTarget(players);
  const [typeId, setTypeId] = useState('');
  const [mode, setMode] = useState('add');
  const [text, setText] = useState('1');
  const [note, setNote] = useState('');
  const run = useMasterRun({ onDone: () => extras.refresh() });
  const type = extras.types.find(t => t.id === typeId) || extras.types[0] || null;
  const targets = targetsFor(players, target);
  const api = apiOf(mode, Math.trunc(Number(text)));
  const previews = type ? targets.map(p => ({ p, v: previewAdjust('experience', extras.experience[p.id]?.[type.id] || 0, api.mode, api.amount) })) : [];
  const bad = previews.find(x => !x.v.ok);
  async function submit(e) {
    e.preventDefault();
    if (!type || bad || closed || !targets.length) return;
    await run.start({
      title: `${MODES.find(m => m[0] === mode)[1]} ${type.name}`, actionLabel: 'Aplicar', danger: mode !== 'add',
      text: previewText([`${iconText(type.icon)} ${type.name}:`, ...previews.map(({ p, v }) => `${p.name}: ${v.current} → ${v.next}`)]),
      opKey: `xpcount:${type.id}:${mode}:${text}:${note}`, targets,
      fn: (t, requestId) => adjustExperience({ tableId, characterId: t.id, typeId: type.id, ...api, note, requestId }),
    });
  }
  return <section className="mh-section" aria-labelledby="mh-cnt-h">
    <h3 id="mh-cnt-h">Distribuir experiências</h3>
    {!extras.types.length ? <p className="muted">Crie um tipo de experiência acima para distribuir aos jogadores.</p> : <>
      <form className="mh-form" onSubmit={submit}>
        <PlayerPicker players={players} value={target} onChange={setTarget} />
        <label className="field"><span>Experiência</span>
          <select value={type?.id || ''} onChange={e => setTypeId(e.target.value)}>{extras.types.map(t => <option key={t.id} value={t.id}>{iconText(t.icon)} {t.name}</option>)}</select></label>
        <div className="tabs-row" role="group" aria-label="Operação">
          {MODES.map(([k, l]) => <button key={k} type="button" className={mode === k ? 'primary' : 'outline'} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}
        </div>
        <label className="field"><span>{mode === 'set' ? 'Novo valor' : 'Quantidade'}</span>
          <input type="number" inputMode="numeric" value={text} onChange={e => setText(e.target.value)} onFocus={e => e.target.select()} /></label>
        <label className="field"><span>Observação (opcional)</span><input maxLength={200} value={note} onChange={e => setNote(e.target.value)} /></label>
        <button className="primary" disabled={Boolean(bad) || closed || run.busy || !targets.length}>Aplicar</button>
      </form>
      <div className="mh-table-wrap"><table className="mh-table">
        <thead><tr><th>Jogador</th>{extras.types.map(t => <th key={t.id}><ExperienceIcon icon={t.icon} /> {t.name}</th>)}</tr></thead>
        <tbody>{players.map(p => <tr key={p.id}><td>{p.name}</td>{extras.types.map(t => <td key={t.id}>{extras.experience[p.id]?.[t.id] || 0}</td>)}</tr>)}</tbody>
      </table></div>
    </>}
    <BatchResults run={run} />
  </section>;
}
