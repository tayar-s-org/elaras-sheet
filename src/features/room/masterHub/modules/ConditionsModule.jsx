import React, { useMemo, useState } from 'react';
import EffectEditor from '../../../token/EffectEditor.jsx';
import ActiveConditions from '../../../sheet/ActiveConditions.jsx';
import { changeConditions } from '../../../../lib/masterHub.js';
import { creatureOf } from '../../../../creature.js';
import { addEffect, removeEffect, conditionsOf, effectsOf, displayName } from '../../../../tokenState.js';
import { BatchResults, useMasterRun, targetsFor, defaultTarget, previewText } from '../ui.jsx';

const CREATURE = 't:';

// Status e condições: o mesmo formato das criaturas (tokenState.js). Personagens: state.conditions da mesa (RPC do mestre, vale na
// ficha, no token e no Grupo ao mesmo tempo). Criaturas: os efeitos do token, pelos mesmos manipuladores do painel da criatura.
export default function ConditionsModule({ ctx }) {
  const { tableId, players, states, tokens, tools, closed } = ctx;
  const creatures = useMemo(() => tokens.filter(t => !t.character_id && creatureOf(t)), [tokens]);
  const [target, setTarget] = useState(null);
  const run = useMasterRun();
  const valid = target === 'all' || players.some(p => p.id === target) || creatures.some(t => `${CREATURE}${t.id}` === target);
  const value = valid ? target : defaultTarget(players) || (creatures[0] ? `${CREATURE}${creatures[0].id}` : '');
  const isCreature = value.startsWith(CREATURE);
  const token = isCreature ? creatures.find(t => `${CREATURE}${t.id}` === value) : null;
  const playerTargets = isCreature ? [] : targetsFor(players, value);
  const current = isCreature ? effectsOf(token) : value === 'all' ? [] : conditionsOf(states[value]);
  const nameOf = t => (t.token ? displayName(t.token, true, 'Criatura') : t.name);
  const targets = isCreature ? (token ? [{ id: value, name: displayName(token, true, 'Criatura'), token }] : []) : playerTargets;
  const listOf = t => (t.token ? effectsOf(t.token) : conditionsOf(states[t.id]));

  // Criatura: o token guarda a lista inteira. Devolve o resultado no formato do histórico (antes/depois vindos do token).
  async function writeCreature(t, next) {
    const before = effectsOf(t.token);
    await tools.setTokenEffects(t.token, next);
    return { category: 'condition', kind: next.length >= before.length ? 'add' : 'remove', before: { conditions: before }, after: { conditions: next }, replayed: false };
  }

  function add(input) {
    if (closed || !targets.length) return;
    const gender = isCreature ? 'f' : 'm';
    run.start({
      title: 'Aplicar condição', skipConfirm: true, opKey: `cond:add:${JSON.stringify(input)}`, targets,
      fn: async (t, requestId) => {
        const before = listOf(t);
        const next = addEffect(before, { ...input, gender });
        if (next.length === before.length) return { category: 'condition', kind: 'update', before: { conditions: before }, after: { conditions: before }, replayed: true };
        // Personagem: manda só a condição nova; o servidor junta à lista atual dele (outra aba pode ter mudado a lista desde a leitura).
        return t.token ? writeCreature(t, next) : changeConditions({ tableId, characterId: t.id, add: [next[next.length - 1]], requestId });
      },
    });
  }
  function remove(id) {
    if (closed || targets.length !== 1) return;
    const label = current.find(e => e.id === id)?.label || 'a condição';
    run.start({
      title: 'Remover condição', actionLabel: 'Remover', danger: true, opKey: `cond:rm:${id}:${value}`, targets,
      text: previewText([`Remover "${label}" de ${nameOf(targets[0])}?`, 'Ela some da ficha, do token e do Grupo ao mesmo tempo.']),
      fn: (t, requestId) => (t.token ? writeCreature(t, removeEffect(listOf(t), id)) : changeConditions({ tableId, characterId: t.id, remove: [id], requestId })),
    });
  }

  return <div className="mh-sections">
    <section className="mh-section" aria-labelledby="mh-cond-h">
      <h3 id="mh-cond-h">Aplicar e remover condições</h3>
      <label className="field mh-picker"><span>Alvo</span>
        <select value={value} onChange={e => setTarget(e.target.value)}>
          {players.length > 1 && <option value="all">Todos os jogadores ({players.length})</option>}
          {players.length > 0 && <optgroup label="Jogadores">{players.map(p => <option key={p.id} value={p.id}>{p.name}{p.playerName ? ` · ${p.playerName}` : ''}</option>)}</optgroup>}
          {creatures.length > 0 && <optgroup label="Criaturas">{creatures.map(t => <option key={t.id} value={`${CREATURE}${t.id}`}>{displayName(t, true, 'Criatura')}</option>)}</optgroup>}
        </select></label>
      {value === 'all' && <p className="muted">Ao aplicar, a condição vai para todos os jogadores; para remover, escolha um jogador.</p>}
      {value !== 'all' && !current.length && <p className="muted">Nenhuma condição ativa.</p>}
      <EffectEditor effects={current} gender={isCreature ? 'f' : 'm'} details disabled={closed || run.busy || !targets.length}
        onAdd={add} onRemove={remove} />
      <BatchResults run={run} />
    </section>
    <section className="mh-section" aria-labelledby="mh-cond-all-h">
      <h3 id="mh-cond-all-h">Condições ativas na mesa</h3>
      <ul className="mh-list">
        {players.map(p => <li key={p.id}><b>{p.name}</b><ActiveConditions conditions={conditionsOf(states[p.id])} /></li>)}
        {creatures.filter(t => effectsOf(t).length).map(t => <li key={t.id}><b>{displayName(t, true, 'Criatura')}</b><ActiveConditions conditions={effectsOf(t)} /></li>)}
        {!players.length && !creatures.length && <li className="muted">Sem jogadores nem criaturas.</li>}
      </ul>
    </section>
  </div>;
}
