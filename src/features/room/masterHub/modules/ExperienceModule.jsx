import React, { useState } from 'react';
import { adjustXp, adjustExperience, upsertExperienceType, deleteExperienceType } from '../../../../lib/masterHub.js';
import ExperienceIcon from '../ExperienceIcon.jsx';
import IconPicker from '../IconPicker.jsx';
import ModuleTabs from '../ModuleTabs.jsx';
import AdjustForm from '../AdjustForm.jsx';
import { IMAGE_ICONS, iconText } from '../experienceIcons.js';
import { BatchResults, useMasterRun, previewText } from '../ui.jsx';

const amountLabel = (mode, unit) => `${mode === 'set' ? `Novo ${unit}` : mode === 'subtract' ? `${unit === 'XP' ? 'XP' : 'Pontos'} a remover` : `${unit === 'XP' ? 'XP' : 'Pontos'} a somar`}`;
// Experiências: o XP de evolução (o do nível, o mesmo do Grupo) e os tipos de experiência criados pelo mestre
// (contadores nomeados por personagem, ex.: Reputação; não mexem em XP nem em nível).
export default function ExperienceModule({ ctx }) {
  const { tableId, players, extras, closed } = ctx;
  const [tab, setTab] = useState('xp');
  return <div className="mh-sections">
    <ModuleTabs label="Seções de experiências" value={tab} onChange={setTab} tabs={[['xp', 'XP de evolução'], ['counters', 'Distribuir'], ['types', 'Tipos']]} />
    {tab === 'xp' && <Xp tableId={tableId} players={players} closed={closed} />}
    {tab === 'counters' && <Counters tableId={tableId} players={players} extras={extras} closed={closed} onCreate={() => setTab('types')} />}
    {tab === 'types' && <Types tableId={tableId} extras={extras} closed={closed} />}
  </div>;
}

function Xp({ tableId, players, closed }) {
  return <section className="mh-section" aria-label="XP de evolução">
    <p className="muted mh-hint">É o XP do nível (nível = XP ÷ 5). Treino, aptidão e estudo de magia continuam nos sistemas deles.</p>
    <AdjustForm kind="xp" storageKey="xp" players={players} closed={closed} quick={[1, 5, 10, 50]} labels={{ subtract: 'Remover' }}
      amountLabel={mode => amountLabel(mode, 'XP')} currentOf={p => p.xp}
      format={n => `${n} XP · nível ${Math.floor(n / 5)}`} confirmTitle={name => `${name} XP`}
      call={(t, { mode, amount, note }, requestId) => adjustXp({ tableId, characterId: t.id, mode, amount, note, requestId })}
      undoCall={(t, delta, requestId) => adjustXp({ tableId, characterId: t.id, mode: 'add', amount: delta, note: 'Desfeito', requestId })}
      deltaOf={r => (r?.after?.xp ?? 0) - (r?.before?.xp ?? 0)} />
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
  return <section className="mh-section" aria-label="Tipos de experiência">
    <p className="muted mh-hint">Crie novas formas de progressão (Reputação, Maestria, Fama…). Cada uma é um contador por personagem, visível para todos da mesa (ficha, Grupo e resumo do token), como o XP.</p>
    {extras.status === 'unavailable' && <p className="callout">Atualização do banco pendente (0040): aplique-a no Supabase e recarregue a página.</p>}
    <ul className="mh-list">
      {extras.types.map(t => <li key={t.id}>
        <span><b><ExperienceIcon icon={t.icon} /> {t.name}</b>{t.category ? <small> · {t.category}</small> : null}{t.description ? <small className="muted"> — {t.description}</small> : null}</span>
        <span className="tabs-row">
          <button type="button" className="outline" aria-label={`Editar ${t.name}`} disabled={closed} onClick={() => setForm({ id: t.id, name: t.name, icon: t.icon, category: t.category || '', description: t.description || '' })}>Editar</button>
          <button type="button" className="outline danger mh-danger" aria-label={`Apagar ${t.name}`} disabled={closed || run.busy} onClick={() => remove(t)}>Apagar</button>
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

function Counters({ tableId, players, extras, closed, onCreate }) {
  const [typeId, setTypeId] = useState('');
  const type = extras.types.find(t => t.id === typeId) || extras.types[0] || null;
  return <section className="mh-section" aria-label="Distribuir experiências">
    <p className="muted mh-hint">Dê, retire ou defina os pontos de um tipo de experiência (Reputação…) para um jogador ou para todos.</p>
    {!extras.types.length ? <div className="mh-empty"><p className="muted">Ainda não há tipos de experiência, então não há o que distribuir.</p><button type="button" className="outline" onClick={onCreate}>Criar o primeiro tipo</button></div> : <>
      <AdjustForm kind="experience" storageKey="counter" extraKey={type?.id || ''} players={players} closed={closed} blocked={!type} quick={[1, 5, 10]} labels={{ subtract: 'Remover' }}
        extra={<label className="field mh-picker"><span>Experiência</span>
          <select value={type?.id || ''} onChange={e => setTypeId(e.target.value)}>{extras.types.map(t => <option key={t.id} value={t.id}>{iconText(t.icon)} {t.name}</option>)}</select></label>}
        amountLabel={mode => amountLabel(mode, 'valor')} currentOf={p => extras.experience[p.id]?.[type?.id] || 0}
        confirmTitle={name => `${name} ${type?.name || 'experiência'}`}
        call={(t, { mode, amount, note }, requestId) => adjustExperience({ tableId, characterId: t.id, typeId: type.id, mode, amount, note, requestId })}
        undoCall={(t, delta, requestId) => adjustExperience({ tableId, characterId: t.id, typeId: type.id, mode: 'add', amount: delta, note: 'Desfeito', requestId })}
        deltaOf={r => (r?.after?.amount ?? 0) - (r?.before?.amount ?? 0)} onDone={() => extras.refresh()} />
      <div className="mh-table-wrap"><table className="mh-table">
        <thead><tr><th>Jogador</th>{extras.types.map(t => <th key={t.id}><ExperienceIcon icon={t.icon} /> {t.name}</th>)}</tr></thead>
        <tbody>{players.map(p => <tr key={p.id}><td>{p.name}</td>{extras.types.map(t => <td key={t.id}>{extras.experience[p.id]?.[t.id] || 0}</td>)}</tr>)}</tbody>
      </table></div>
    </>}
  </section>;
}
