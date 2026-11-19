import React, { useMemo, useRef, useState } from 'react';
import { useConfirm } from '../../../ui/ConfirmProvider.jsx';
import { calculate, validateCharacter } from '../../../rules.js';
import { normalizeMoney } from '../../../money.js';
import { notifyInventoryChanged } from '../../../lib/items.js';
import { resolveItem } from '../../../market/items.js';
import { runBatch, retryFailed, summarizeBatch, makePendingStore, auditDetails } from './core.js';

// Peças compartilhadas pelos módulos da Central: lista de jogadores, seletor de alvo e execução de operações em lote
// (confirmação → uma chamada atômica por alvo → resultado individual → "tentar de novo" só dos que falharam).

// Jogadores da mesa (membros aprovados com ficha). `id` é o id do personagem (o que os RPCs recebem).
export function useHubPlayers(members, characters) {
  return useMemo(() => members
    .filter(m => m.status === 'approved' && m.role === 'player' && m.character_id && characters[m.character_id])
    .map(m => {
      const row = characters[m.character_id];
      let level = 0, free = null;
      try { const d = calculate(validateCharacter(row.data)); level = d.level; free = d.remaining; } catch { /* ficha ilegível: mostra o resto */ }
      return {
        id: row.id, userId: m.user_id, name: row.name || 'Sem nome', playerName: m.profiles?.display_name || '',
        data: row.data, level, xp: Number(row.data?.xp) || 0, money: normalizeMoney(row.data?.money), free,
      };
    }), [members, characters]);
}

export const targetsFor = (players, value) => (value === 'all' ? players : players.filter(p => p.id === value));

// Escolha do alvo: um jogador ou todos.
export function PlayerPicker({ players, value, onChange, label = 'Para', allowAll = true, extra = null }) {
  return <label className="field mh-picker"><span>{label}</span>
    <select value={value} onChange={e => onChange(e.target.value)}>
      {allowAll && players.length > 1 && <option value="all">Todos os jogadores ({players.length})</option>}
      {players.map(p => <option key={p.id} value={p.id}>{p.name}{p.playerName ? ` · ${p.playerName}` : ''}</option>)}
      {extra}
    </select></label>;
}

// Valor inicial seguro do seletor (um jogador existente, ou "todos" quando houver mais de um).
export const defaultTarget = (players, allowAll = true) => (allowAll && players.length > 1 ? 'all' : players[0]?.id || '');

// Executa uma operação sobre vários alvos. start() confirma (se houver `text`), roda em lote e guarda o resultado individual.
export function useMasterRun({ onDone } = {}) {
  const confirm = useConfirm();
  const [state, setState] = useState({ busy: false, batch: null, title: '' });
  const last = useRef(null);
  const store = useMemo(() => makePendingStore(typeof sessionStorage === 'undefined' ? { getItem: () => null, setItem() {}, removeItem() {} } : sessionStorage), []);

  const finish = batch => {
    setState({ busy: false, batch, title: last.current?.title || '' });
    notifyInventoryChanged(); // a ficha/token relê a nuvem agora, sem esperar o ciclo
    onDone?.(batch);
  };

  async function start({ title, text, actionLabel = 'Confirmar', danger = false, opKey, targets, fn, skipConfirm = false }) {
    if (state.busy || !targets.length) return null;
    if (!skipConfirm && !(await confirm({ title, text, actionLabel, danger }))) return null;
    last.current = { title, targets, fn, opts: { opKey, store } };
    setState({ busy: true, batch: null, title });
    const batch = await runBatch(targets, fn, last.current.opts);
    finish(batch);
    return batch;
  }

  async function retry() {
    if (state.busy || !state.batch || !last.current) return;
    setState(s => ({ ...s, busy: true }));
    const batch = await retryFailed(state.batch, last.current.targets, last.current.fn, last.current.opts);
    finish(batch);
  }

  return { busy: state.busy, batch: state.batch, title: state.title, start, retry, clear: () => setState({ busy: false, batch: null, title: '' }) };
}

// Resultado individual de cada alvo (nunca "sucesso" geral se algo falhou).
export function BatchResults({ run }) {
  if (run.busy) return <p className="muted" role="status">Aplicando…</p>;
  if (!run.batch) return null;
  const { results } = run.batch;
  const sum = summarizeBatch(results);
  return <div className={`mh-results${sum.allOk ? ' ok' : ' warn'}`} role="status">
    <p><b>{run.title}</b> — {sum.text}{sum.replayed ? ` (${sum.replayed} já aplicad${sum.replayed > 1 ? 'os' : 'o'} antes)` : ''}</p>
    <ul>
      {results.map(r => <li key={r.id} className={r.ok ? 'ok' : 'bad'}>
        <span aria-hidden="true">{r.ok ? (r.replayed ? '↻' : '✓') : '✗'}</span> <b>{r.name || 'Alvo'}</b>
        {r.ok ? <small> {auditDetails(r.result, id => resolveItem({ id })?.name || id).map(([k, v]) => `${k}: ${v}`).join(' · ') || r.result?.summary || ''}{r.replayed ? ' · já estava aplicado' : ''}</small>
          : <small> {r.error}{r.uncertain ? ' (resultado incerto: ao tentar de novo, o mesmo identificador evita repetir)' : ''}</small>}
      </li>)}
    </ul>
    <div className="tabs-row">
      {!sum.allOk && <button type="button" className="primary" onClick={run.retry}>Tentar de novo os que falharam</button>}
      <button type="button" className="outline" onClick={run.clear}>Fechar</button>
    </div>
  </div>;
}

// Linhas "Nome: antes → depois" para o texto da confirmação.
export const previewText = lines => lines.map((l, i) => <React.Fragment key={i}>{i ? <br /> : null}{l}</React.Fragment>);
