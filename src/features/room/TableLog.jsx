import React, { useEffect, useMemo, useRef, useState } from 'react';
import { describeRoll } from '../../diceRoll.js';
import { formatMoney } from '../../money.js';
import { mergeRewards, rewardAmount } from './rewardsLog.js';
import { LOG_LIMIT, latestDiceEntries, latestVitalEntries } from './tableLogEntries.js';
import ExperienceIcon from './masterHub/ExperienceIcon.jsx';
import './tablelog.css';

const time = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const RESOURCE_LABEL = { life: 'Vida', stamina: 'Stamina', mana: 'Mana' };

// Registro da mesa sob o tabuleiro, em abas: dados/chat, vida/stamina/mana e concessoes de XP e dinheiro.
export default function TableLog({ messages, rolls, stateLog, rewards, hidden, members, characters, me, isGm }) {
  const [tab, setTab] = useState('dice');
  const boxRef = useRef(null);
  const names = useMemo(() => Object.fromEntries(members.map(m => [m.user_id, m.profiles?.display_name || 'Jogador'])), [members]);
  const diceEntries = useMemo(() => latestDiceEntries(messages, rolls, hidden), [messages, rolls, hidden]);
  const myCharacter = members.find(m => m.user_id === me)?.character_id;
  const vitalEntries = useMemo(() => latestVitalEntries(stateLog, { isGm, characterId: myCharacter }), [stateLog, isGm, myCharacter]);
  const rewardEntries = useMemo(() => mergeRewards(rewards?.xp, rewards?.money, LOG_LIMIT, rewards?.custom), [rewards]);
  const newestKey = tab === 'dice' ? diceEntries[0]?.key : tab === 'vitals' ? vitalEntries[0]?.id : rewardEntries[0]?.key;
  // A novidade aparece no topo; volta o quadro (so ele, nao a pagina) para o inicio.
  useEffect(() => { const el = boxRef.current; if (el) el.scrollTop = 0; }, [newestKey, tab]);

  return <section className="table-log" aria-label="Registro da mesa">
    <div className="tabs-row log-tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'dice'} className={tab === 'dice' ? 'primary' : 'outline'} onClick={() => setTab('dice')}>Dados</button>
      <button role="tab" aria-selected={tab === 'vitals'} className={tab === 'vitals' ? 'primary' : 'outline'} onClick={() => setTab('vitals')}>Vida, mana e stamina</button>
      <button role="tab" aria-selected={tab === 'rewards'} className={tab === 'rewards' ? 'primary' : 'outline'} onClick={() => setTab('rewards')}>XP e dinheiro</button>
    </div>
    <div className="table-log-box" ref={boxRef} role="log" aria-live="polite">
      {tab === 'dice' ? <>
        {!diceEntries.length && <p className="muted">Nada por aqui ainda. Mensagens e rolagens da mesa aparecem neste registro.</p>}
        {diceEntries.map(e => {
          if (e.type === 'msg') {
            const m = e.m;
            return <p key={e.key} className={`log-line${m.kind === 'whisper' ? ' whisper' : ''}${m.user_id === me ? ' mine' : ''}`}>
              <span className="log-time">{time(m.created_at)}</span>
              <strong>{names[m.user_id] || 'Jogador'}</strong>
              {m.kind === 'whisper' && <em> (sussurro para {m.to_user === me ? 'você' : names[m.to_user] || 'alguém'})</em>}
              <span>: {m.body}</span>
            </p>;
          }
          const r = e.r;
          const d = describeRoll(r);
          return <p key={e.key} className={`log-line log-roll ${d.tone}`}>
            <span className="log-time">{time(r.created_at)}</span>
            <strong>{names[r.user_id] || 'Jogador'}</strong>
            <span> rolou {r.label ? `${r.label} · ` : ''}{d.title}{r.visibility === 'gm' ? ' (só mestre)' : ''} → </span>
            <b className="log-total">{d.total}</b>
            {d.outcome && <span className="log-outcome"> {d.outcome}</span>}
            <span className="log-steps">{d.lines.map((line, i) => <span key={i} className="log-step">{line}</span>)}</span>
          </p>;
        })}
      </> : tab === 'rewards' ? <>
        {!rewardEntries.length && <p className="muted">Nenhuma concessão de XP, dinheiro, moeda ou experiência ainda. Elas aparecem aqui quando o mestre dá ou remove, e quando o mercado e o trabalho pagam.</p>}
        {rewardEntries.map(r => <p key={r.key} className={`log-line log-reward ${r.kind} ${Number(r.amount) < 0 ? 'down' : 'up'}`}>
          <span className="log-time">{time(r.created_at)}</span>
          <strong>{characters?.[r.character_id]?.name || 'Personagem'}</strong>
          {r.kind === 'wallet' || r.kind === 'experience'
            ? <span> · <ExperienceIcon icon={r.icon} /> {r.label || (r.kind === 'wallet' ? 'Moeda' : 'Experiência')} </span>
            : <span> · {r.kind === 'xp' ? 'XP' : 'Dinheiro'} </span>}
          <b className="log-delta">{rewardAmount(r, formatMoney)}</b>
          {(r.kind === 'wallet' || r.kind === 'experience') && <span className="log-detail"> · {r.set ? `definido em ${formatMoney(r.total)}` : `saldo ${formatMoney(r.total)}`}</span>}
          {r.note && <span className="log-detail"> · {r.note}</span>}
          {r.granted_by && <span className="log-detail"> · por {names[r.granted_by] || 'Mestre'}</span>}
          {!r.claimed_at && <span className="log-detail"> · a caminho</span>}
        </p>)}
      </> : <>
        {!vitalEntries.length && <p className="muted">Nenhuma alteração de Vida, Mana ou Stamina ainda. Elas aparecem aqui quando alguém ajusta os contadores na aba Fichas.</p>}
        {vitalEntries.map(v => {
          const delta = v.new_value - v.old_value;
          return <p key={v.id} className={`log-line log-vital ${delta < 0 ? 'down' : 'up'}`}>
            <span className="log-time">{time(v.created_at)}</span>
            <strong>{characters?.[v.character_id]?.name || 'Personagem'}</strong>
            <span> · {RESOURCE_LABEL[v.resource]}: {v.old_value} → {v.new_value} </span>
            <b className="log-delta">{delta > 0 ? `+${delta}` : delta}</b>
            {v.user_id && <span className="log-detail"> · por {names[v.user_id] || 'Jogador'}</span>}
          </p>;
        })}
      </>}
    </div>
  </section>;
}
