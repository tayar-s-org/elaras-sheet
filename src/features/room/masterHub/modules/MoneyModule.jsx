import React, { useState } from 'react';
import { formatMoney } from '../../../../money.js';
import { adjustMoney, adjustWallet, upsertCurrency, deleteCurrency } from '../../../../lib/masterHub.js';
import ExperienceIcon from '../ExperienceIcon.jsx';
import IconPicker from '../IconPicker.jsx';
import ModuleTabs from '../ModuleTabs.jsx';
import AdjustForm from '../AdjustForm.jsx';
import { CURRENCY_ICONS, iconText, DEFAULT_CURRENCY_ICON } from '../experienceIcons.js';
import { BatchResults, useMasterRun, previewText } from '../ui.jsx';
import '../../../../ui/money.css';

// Rótulo do campo de quantidade conforme a operação (e a unidade, quando há): diz o que o número significa.
const amountLabel = (mode, unit = '') => `${mode === 'set' ? 'Novo saldo' : mode === 'subtract' ? 'Quantidade a retirar' : 'Quantidade a somar'}${unit ? ` (${unit})` : ''}`;
// Dinheiro ($ da ficha, com prévia antes → depois), moedas personalizadas da mesa e a carteira de cada personagem.
export default function MoneyModule({ ctx }) {
  const { tableId, players, extras, closed } = ctx;
  const [tab, setTab] = useState('money');
  return <div className="mh-sections">
    <ModuleTabs label="Seções de moedas" value={tab} onChange={setTab} tabs={[['money', 'Dinheiro ($)'], ['currencies', 'Moedas da mesa'], ['wallets', 'Carteiras']]} />
    {tab === 'money' && <SheetMoney tableId={tableId} players={players} closed={closed} />}
    {tab === 'currencies' && <Currencies tableId={tableId} extras={extras} closed={closed} />}
    {tab === 'wallets' && <Wallets tableId={tableId} players={players} extras={extras} closed={closed} onCreate={() => setTab('currencies')} />}
  </div>;
}

function SheetMoney({ tableId, players, closed }) {
  return <section className="mh-section" aria-label="Dinheiro ($)">
    <p className="muted mh-hint">É o dinheiro ($) da ficha de cada jogador, o mesmo que ele gasta no Mercado do livro.</p>
    <AdjustForm kind="money" storageKey="money" players={players} closed={closed} quick={[10, 50, 100, 500]}
      amountLabel={mode => amountLabel(mode, '$')} currentOf={p => p.money} format={formatMoney}
      confirmTitle={name => `${name} dinheiro`}
      call={(t, { mode, amount, note }, requestId) => adjustMoney({ tableId, characterId: t.id, mode, amount, note, requestId })}
      undoCall={(t, delta, requestId) => adjustMoney({ tableId, characterId: t.id, mode: 'add', amount: delta, note: 'Desfeito', requestId })}
      deltaOf={r => (r?.after?.money ?? 0) - (r?.before?.money ?? 0)} />
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
  return <section className="mh-section" aria-label="Moedas da mesa">
    <p className="muted mh-hint">Moedas criadas por você (Ouro, Cristal…). Cada jogador tem uma carteira separada para cada moeda. Elas não viram dinheiro ($) e só pagam itens da Loja do Mestre.</p>
    {extras.status === 'unavailable' && <p className="callout">Atualização do banco pendente (0040): aplique-a no Supabase e recarregue a página.</p>}
    <ul className="mh-list">
      {extras.currencies.map(c => <li key={c.id}>
        <span><b><ExperienceIcon icon={c.symbol} /> {c.name}</b>{c.rate ? <small> · referência: {c.rate} $</small> : null}{c.description ? <small className="muted"> — {c.description}</small> : null}</span>
        <span className="tabs-row">
          <button type="button" className="outline" aria-label={`Editar ${c.name}`} disabled={closed} onClick={() => setForm({ id: c.id, name: c.name, symbol: c.symbol, description: c.description || '', rate: c.rate ?? '' })}>Editar</button>
          <button type="button" className="outline danger mh-danger" aria-label={`Apagar ${c.name}`} disabled={closed || run.busy} onClick={() => remove(c)}>Apagar</button>
        </span>
      </li>)}
      {!extras.currencies.length && <li className="muted">Nenhuma moeda criada ainda.</li>}
    </ul>
    <form className="mh-form" onSubmit={save}>
      <h4>{form.id ? 'Editar moeda' : 'Nova moeda'}</h4>
      <label className="field"><span>Nome</span><input maxLength={40} value={form.name} onChange={e => set({ name: e.target.value })} placeholder="Ex.: Ouro, Cristal, Moeda Real" /></label>
      <IconPicker icons={CURRENCY_ICONS} value={form.symbol} onChange={symbol => set({ symbol })} label="Ícone da moeda" />
      <label className="field"><span>Quanto vale em $ (só referência, não converte)</span><input inputMode="decimal" value={form.rate} onChange={e => set({ rate: e.target.value })} placeholder="Ex.: 10" /></label>
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

function Wallets({ tableId, players, extras, closed, onCreate }) {
  const [currencyId, setCurrencyId] = useState('');
  const cur = extras.currencies.find(c => c.id === currencyId) || extras.currencies[0] || null;
  return <section className="mh-section" aria-label="Carteiras">
    <p className="muted mh-hint">Saldo de cada jogador em cada moeda. Só o dono da ficha e você veem a carteira.</p>
    {!extras.currencies.length ? <div className="mh-empty"><p className="muted">Ainda não há moedas na mesa, então não há carteira para dar saldo.</p><button type="button" className="outline" onClick={onCreate}>Criar a primeira moeda</button></div> : <>
      <AdjustForm kind="wallet" storageKey="wallet" extraKey={cur?.id || ''} players={players} closed={closed} blocked={!cur} quick={[1, 10, 100]}
        extra={<label className="field mh-picker"><span>Moeda</span>
          <select value={cur?.id || ''} onChange={e => setCurrencyId(e.target.value)}>{extras.currencies.map(c => <option key={c.id} value={c.id}>{iconText(c.symbol, DEFAULT_CURRENCY_ICON)} {c.name}</option>)}</select></label>}
        amountLabel={mode => amountLabel(mode, cur?.name)} currentOf={p => extras.wallets[p.id]?.[cur?.id] || 0} format={formatMoney}
        confirmTitle={name => `${name} ${cur?.name || 'moeda'}`}
        call={(t, { mode, amount, note }, requestId) => adjustWallet({ tableId, characterId: t.id, currencyId: cur.id, mode, amount, note, requestId })}
        undoCall={(t, delta, requestId) => adjustWallet({ tableId, characterId: t.id, currencyId: cur.id, mode: 'add', amount: delta, note: 'Desfeito', requestId })}
        deltaOf={r => (r?.after?.amount ?? 0) - (r?.before?.amount ?? 0)} onDone={() => extras.refresh()} />
      <div className="mh-table-wrap"><table className="mh-table">
        <thead><tr><th>Jogador</th>{extras.currencies.map(c => <th key={c.id}><ExperienceIcon icon={c.symbol} /> {c.name}</th>)}</tr></thead>
        <tbody>{players.map(p => <tr key={p.id}><td>{p.name}</td>{extras.currencies.map(c => <td key={c.id}>{formatMoney(extras.wallets[p.id]?.[c.id] || 0)}</td>)}</tr>)}</tbody>
      </table></div>
    </>}
  </section>;
}
