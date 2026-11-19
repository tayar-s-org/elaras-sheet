import React, { useState } from 'react';
import { formatMoney } from '../../../../money.js';
import { adjustMoney, adjustWallet, upsertCurrency, deleteCurrency } from '../../../../lib/masterHub.js';
import { previewAdjust } from '../core.js';
import ExperienceIcon from '../ExperienceIcon.jsx';
import IconPicker from '../IconPicker.jsx';
import { CURRENCY_ICONS, iconText, DEFAULT_CURRENCY_ICON } from '../experienceIcons.js';
import { PlayerPicker, BatchResults, useMasterRun, targetsFor, defaultTarget, previewText } from '../ui.jsx';
import '../../../../ui/money.css';

const MODES = [['add', 'Somar'], ['subtract', 'Retirar'], ['set', 'Definir valor']];
const apiOf = (mode, n) => (mode === 'set' ? { mode: 'set', amount: n } : { mode: 'add', amount: mode === 'subtract' ? -Math.abs(n) : Math.abs(n) });
const useTarget = players => {
  const [target, setTarget] = useState(null);
  const value = target === 'all' || players.some(p => p.id === target) ? target : defaultTarget(players);
  return [value, setTarget];
};

// Dinheiro ($ da ficha, com prévia antes → depois), moedas personalizadas da mesa e a carteira de cada personagem.
export default function MoneyModule({ ctx }) {
  const { tableId, players, extras, closed } = ctx;
  return <div className="mh-sections">
    <SheetMoney tableId={tableId} players={players} closed={closed} />
    <Currencies tableId={tableId} extras={extras} closed={closed} />
    <Wallets tableId={tableId} players={players} extras={extras} closed={closed} />
  </div>;
}

function SheetMoney({ tableId, players, closed }) {
  const [target, setTarget] = useTarget(players);
  const [mode, setMode] = useState('add');
  const [text, setText] = useState('100');
  const [note, setNote] = useState('');
  const run = useMasterRun();
  const targets = targetsFor(players, target);
  const api = apiOf(mode, Math.trunc(Number(text)));
  const previews = targets.map(p => ({ p, v: previewAdjust('money', p.money, api.mode, api.amount) }));
  const bad = previews.find(x => !x.v.ok);
  async function submit(e) {
    e.preventDefault();
    if (bad || closed || !targets.length) return;
    await run.start({
      title: `${MODES.find(m => m[0] === mode)[1]} dinheiro`, actionLabel: 'Aplicar', danger: mode !== 'add',
      text: previewText([`${targets.length === 1 ? targets[0].name : `${targets.length} jogadores`}:`, ...previews.map(({ p, v }) => `${p.name}: $${formatMoney(v.current)} → $${formatMoney(v.next)}`)]),
      opKey: `money:${mode}:${text}:${note}`, targets,
      fn: (t, requestId) => adjustMoney({ tableId, characterId: t.id, ...api, note, requestId }),
    });
  }
  return <section className="mh-section" aria-labelledby="mh-money-h">
    <h3 id="mh-money-h">Dinheiro dos jogadores ($)</h3>
    <form className="mh-form" onSubmit={submit}>
      <PlayerPicker players={players} value={target} onChange={setTarget} />
      <div className="tabs-row" role="group" aria-label="Operação">
        {MODES.map(([k, l]) => <button key={k} type="button" className={mode === k ? 'primary' : 'outline'} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}
      </div>
      <label className="field"><span>{mode === 'set' ? 'Novo saldo' : 'Valor'}</span>
        <input type="number" inputMode="numeric" value={text} onChange={e => setText(e.target.value)} onFocus={e => e.target.select()} /></label>
      <label className="field"><span>Observação (opcional)</span><input maxLength={200} value={note} onChange={e => setNote(e.target.value)} /></label>
      <button className="primary" disabled={Boolean(bad) || closed || run.busy || !targets.length}>Aplicar</button>
    </form>
    <ul className="mh-preview" aria-label="Prévia">
      {previews.map(({ p, v }) => <li key={p.id}><b>{p.name}</b> <span className="money-coin" aria-hidden="true">$</span> {formatMoney(p.money)}{v.ok ? <> → <b>{formatMoney(v.next)}</b>{v.delta !== api.amount && api.mode === 'add' ? <small> (limitado)</small> : null}</> : <small className="muted"> · {v.error}</small>}</li>)}
    </ul>
    <BatchResults run={run} />
  </section>;
}

function Currencies({ tableId, extras, closed }) {
  const empty = { id: null, name: '', symbol: CURRENCY_ICONS[0].key, description: '', rate: '' };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const run = useMasterRun();
  const set = patch => setForm(f => ({ ...f, ...patch }));
  async function save(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Dê um nome à moeda.'); return; }
    const rate = form.rate === '' ? null : Number(String(form.rate).replace(',', '.'));
    if (rate !== null && !(rate > 0)) { setError('A taxa de referência deve ser maior que 0 (ou fique em branco).'); return; }
    const b = await run.start({
      title: form.id ? 'Moeda alterada' : 'Moeda criada', skipConfirm: true, opKey: `currency:${form.id || 'new'}:${form.name}`, targets: [{ id: 'c', name: form.name.trim() }],
      fn: (t, requestId) => upsertCurrency({ tableId, id: form.id, name: form.name, symbol: form.symbol, description: form.description, rate, requestId }),
    });
    if (b?.results.every(r => r.ok)) { setForm(empty); extras.refresh(); }
  }
  async function remove(c) {
    const holders = Object.entries(extras.wallets).filter(([, w]) => (w[c.id] || 0) > 0);
    const total = holders.reduce((n, [, w]) => n + w[c.id], 0);
    const b = await run.start({
      title: 'Apagar moeda', actionLabel: 'Apagar moeda', danger: true, opKey: `currency-del:${c.id}`, targets: [{ id: c.id, name: c.name }],
      text: previewText([`Apagar a moeda ${iconText(c.symbol, DEFAULT_CURRENCY_ICON)} ${c.name}?`, holders.length ? `Isso apaga os saldos de ${holders.length} personagem(ns) (total ${formatMoney(total)}). Fica registrado no histórico.` : 'Nenhum personagem tem saldo dela.', 'Não dá para desfazer.']),
      fn: (t, requestId) => deleteCurrency({ tableId, id: c.id, force: true, requestId }),
    });
    if (b?.results.every(r => r.ok)) extras.refresh();
  }
  return <section className="mh-section" aria-labelledby="mh-cur-h">
    <h3 id="mh-cur-h">Moedas da mesa</h3>
    <p className="muted mh-hint">Cada moeda tem a própria carteira por personagem. O valor em $ é só uma referência: o dinheiro da ficha e o Mercado continuam em $.</p>
    {extras.status === 'unavailable' && <p className="callout">Falta aplicar a migração 0040 no Supabase.</p>}
    <ul className="mh-list">
      {extras.currencies.map(c => <li key={c.id}>
        <span><b><ExperienceIcon icon={c.symbol} /> {c.name}</b>{c.rate ? <small> · referência: {c.rate} $</small> : null}{c.description ? <small className="muted"> — {c.description}</small> : null}</span>
        <span className="tabs-row">
          <button type="button" className="outline" disabled={closed} onClick={() => setForm({ id: c.id, name: c.name, symbol: c.symbol, description: c.description || '', rate: c.rate ?? '' })}>Editar</button>
          <button type="button" className="outline danger" disabled={closed || run.busy} onClick={() => remove(c)}>Apagar</button>
        </span>
      </li>)}
      {!extras.currencies.length && <li className="muted">Nenhuma moeda criada ainda.</li>}
    </ul>
    <form className="mh-form" onSubmit={save}>
      <h4>{form.id ? 'Editar moeda' : 'Nova moeda'}</h4>
      <label className="field"><span>Nome</span><input maxLength={40} value={form.name} onChange={e => set({ name: e.target.value })} placeholder="Ex.: Ouro, Cristal, Moeda Real" /></label>
      <IconPicker icons={CURRENCY_ICONS} value={form.symbol} onChange={symbol => set({ symbol })} label="Ícone da moeda" />
      <label className="field"><span>Valor de referência em $ (opcional)</span><input inputMode="decimal" value={form.rate} onChange={e => set({ rate: e.target.value })} placeholder="Ex.: 10" /></label>
      <label className="field"><span>Descrição</span><input maxLength={300} value={form.description} onChange={e => set({ description: e.target.value })} /></label>
      {error && <p role="alert" className="muted">{error}</p>}
      <div className="tabs-row">
        <button className="primary" disabled={closed || run.busy}>{form.id ? 'Salvar moeda' : 'Criar moeda'}</button>
        {form.id && <button type="button" className="outline" onClick={() => setForm(empty)}>Cancelar edição</button>}
      </div>
    </form>
    <BatchResults run={run} />
  </section>;
}

function Wallets({ tableId, players, extras, closed }) {
  const [target, setTarget] = useTarget(players);
  const [currencyId, setCurrencyId] = useState('');
  const [mode, setMode] = useState('add');
  const [text, setText] = useState('10');
  const [note, setNote] = useState('');
  const run = useMasterRun({ onDone: () => extras.refresh() });
  const cur = extras.currencies.find(c => c.id === currencyId) || extras.currencies[0] || null;
  const targets = targetsFor(players, target);
  const api = apiOf(mode, Math.trunc(Number(text)));
  const previews = cur ? targets.map(p => ({ p, v: previewAdjust('wallet', extras.wallets[p.id]?.[cur.id] || 0, api.mode, api.amount) })) : [];
  const bad = previews.find(x => !x.v.ok);
  async function submit(e) {
    e.preventDefault();
    if (!cur || bad || closed || !targets.length) return;
    await run.start({
      title: `${MODES.find(m => m[0] === mode)[1]} ${cur.name}`, actionLabel: 'Aplicar', danger: mode !== 'add',
      text: previewText([`${iconText(cur.symbol, DEFAULT_CURRENCY_ICON)} ${cur.name}:`, ...previews.map(({ p, v }) => `${p.name}: ${formatMoney(v.current)} → ${formatMoney(v.next)}`)]),
      opKey: `wallet:${cur.id}:${mode}:${text}:${note}`, targets,
      fn: (t, requestId) => adjustWallet({ tableId, characterId: t.id, currencyId: cur.id, ...api, note, requestId }),
    });
  }
  return <section className="mh-section" aria-labelledby="mh-wal-h">
    <h3 id="mh-wal-h">Carteiras</h3>
    {!extras.currencies.length ? <p className="muted">Crie uma moeda acima para dar saldo aos personagens.</p> : <>
      <form className="mh-form" onSubmit={submit}>
        <PlayerPicker players={players} value={target} onChange={setTarget} />
        <label className="field"><span>Moeda</span>
          <select value={cur?.id || ''} onChange={e => setCurrencyId(e.target.value)}>{extras.currencies.map(c => <option key={c.id} value={c.id}>{iconText(c.symbol, DEFAULT_CURRENCY_ICON)} {c.name}</option>)}</select></label>
        <div className="tabs-row" role="group" aria-label="Operação">
          {MODES.map(([k, l]) => <button key={k} type="button" className={mode === k ? 'primary' : 'outline'} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}
        </div>
        <label className="field"><span>{mode === 'set' ? 'Novo saldo' : 'Valor'}</span>
          <input type="number" inputMode="numeric" value={text} onChange={e => setText(e.target.value)} onFocus={e => e.target.select()} /></label>
        <label className="field"><span>Observação (opcional)</span><input maxLength={200} value={note} onChange={e => setNote(e.target.value)} /></label>
        <button className="primary" disabled={Boolean(bad) || closed || run.busy || !targets.length}>Aplicar</button>
      </form>
      <div className="mh-table-wrap"><table className="mh-table">
        <thead><tr><th>Jogador</th>{extras.currencies.map(c => <th key={c.id}><ExperienceIcon icon={c.symbol} /> {c.name}</th>)}</tr></thead>
        <tbody>{players.map(p => <tr key={p.id}><td>{p.name}</td>{extras.currencies.map(c => <td key={c.id}>{formatMoney(extras.wallets[p.id]?.[c.id] || 0)}</td>)}</tr>)}</tbody>
      </table></div>
    </>}
    <BatchResults run={run} />
  </section>;
}
