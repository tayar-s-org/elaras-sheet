import { ACT } from './activities.js';

// Histórico de treinamentos: transforma o ledger (uma linha por hora) em registros legíveis e indicadores.
// Tudo é calculado a partir do que o servidor gravou; nada aqui altera dados (registros processados não se editam).

const TRACKED = new Set([ACT.SKILL, ACT.SPELL, ACT.STUDY, ACT.WORK, ACT.REST, ACT.QUICK, ACT.MEDITATE]);
const round = n => Math.round(n * 1000) / 1000;

// Alvo de um evento: perícia, feitiço ou trabalho (com a modalidade nos treinos).
function targetOf(run) {
  const row = run.row_snapshot || {};
  switch (run.activity) {
    case ACT.SKILL: return { key: `s:${row.skill}`, kind: 'skill', name: row.skill || '' };
    case ACT.SPELL: case ACT.STUDY: return { key: `p:${row.spell}`, kind: 'spell', name: row.spell || '' };
    case ACT.WORK: return { key: `j:${row.job}`, kind: 'job', name: row.job || '' };
    default: return { key: '', kind: '', name: '' };
  }
}

// Junta horas seguidas da mesma atividade e do mesmo alvo num registro. `names` resolve ids em nomes ({ spell(id), job(id) }).
export function buildRecords(runs, names = {}) {
  const sorted = [...runs].filter(r => TRACKED.has(r.activity)).sort((a, b) => a.tick - b.tick);
  const out = [];
  let cur = null;
  for (const run of sorted) {
    const t = targetOf(run);
    const mode = run.row_snapshot?.mode === 'focused' ? 'focused' : 'normal';
    const modeKey = run.activity === ACT.SKILL || run.activity === ACT.SPELL ? mode : '';
    if (!cur || cur.activity !== run.activity || cur.targetKey !== t.key || cur.mode !== modeKey || run.tick !== cur.endTick) {
      cur = {
        id: run.tick, activity: run.activity, targetKey: t.key, mode: modeKey, target: t, startTick: run.tick, endTick: run.tick,
        hours: 0, okHours: 0, failedHours: 0, reasons: [], routine: run.routine_name || '',
        staminaSpent: 0, staminaGained: 0, manaSpent: 0, manaGained: 0, pay: 0, xp: {}, rolls: [], sessionsClosed: 0,
        restPaid: 0, maxStreak: 0, studyHours: 0, events: [],
      };
      out.push(cur);
    }
    cur.endTick = run.tick + 1;
    cur.hours += 1;
    cur.events.push(run);
    if (run.ok) cur.okHours += 1; else { cur.failedHours += 1; if (run.reason && !cur.reasons.includes(run.reason)) cur.reasons.push(run.reason); }
    if (run.stamina_delta < 0) cur.staminaSpent += -run.stamina_delta; else cur.staminaGained += run.stamina_delta;
    if (run.mana_delta < 0) cur.manaSpent += -run.mana_delta; else cur.manaGained += run.mana_delta;
    cur.pay += Number(run.detail?.pay) || 0;
    if (run.detail?.study && run.ok) cur.studyHours += 1;
    if (run.detail?.rest) { cur.restPaid += Number(run.detail.rest.paid) || 0; cur.maxStreak = Math.max(cur.maxStreak, run.detail.rest.streak || 0); }
    const med = run.detail?.meditation;
    if (med?.started) cur.rolls.push({ tick: run.tick, face: med.face, sides: med.sides, roll: med.roll, rate: med.rate });
    if (med?.closed) cur.sessionsClosed += 1;
    for (const x of run.xp || []) {
      const k = `${x.kind}:${x.name}:${x.modality}`;
      const e = (cur.xp[k] ||= { kind: x.kind, name: x.name, modality: x.modality, amount: 0, discarded: 0 });
      e.amount = round(e.amount + Number(x.amount || 0));
      e.discarded = round(e.discarded + Number(x.discarded || 0));
      e.availableAfter = Number(x.availableAfter);
      e.earnedAfter = Number(x.earnedAfter);
    }
  }
  return out.map(r => ({
    ...r,
    xp: Object.values(r.xp),
    staminaSpent: round(r.staminaSpent), staminaGained: round(r.staminaGained), manaSpent: round(r.manaSpent), manaGained: round(r.manaGained),
    resultText: r.failedHours ? `${r.okHours} de ${r.hours} h com efeito` : 'Concluído',
    targetLabel: r.target.kind === 'spell' ? (names.spell?.(r.target.name) || 'feitiço') : r.target.kind === 'job' ? (names.job?.(r.target.name) || 'trabalho') : r.target.name,
  })).sort((a, b) => b.startTick - a.startTick);
}

// Indicadores do topo da aba.
export function summarize({ runs, progress = [], training = null, spellProgress = {} }) {
  const ok = runs.filter(r => r.ok);
  const hoursOf = acts => ok.filter(r => acts.includes(r.activity)).length;
  const distinct = (act, field) => new Set(ok.filter(r => r.activity === act && r.row_snapshot?.[field]).map(r => r.row_snapshot[field])).size;
  return {
    trainedHours: hoursOf([ACT.SKILL, ACT.SPELL]),
    xpReceived: round(progress.reduce((s, p) => s + Number(p.earned_total || 0), 0)),
    skillsTrained: distinct(ACT.SKILL, 'skill'),
    spellsTrained: distinct(ACT.SPELL, 'spell'),
    studyHours: Number(training?.study_hours || 0),
    improvements: Object.values(spellProgress).reduce((s, p) => s + (p.improvements || 0), 0),
    workHours: hoursOf([ACT.WORK]),
    jobsDone: distinct(ACT.WORK, 'job'),
    restHours: hoursOf([ACT.REST, ACT.QUICK]),
    meditationSessions: runs.filter(r => r.detail?.meditation?.closed).length,
  };
}

// Situação de hoje (dia atual da campanha): descanso em andamento, sessões de meditação e limites que ainda sobram.
export function todayStatus({ training, dayNo, runs, limits }) {
  const st = training?.day_state && training.day_no === dayNo ? training.day_state : null;
  const today = runs.filter(r => r.day_no === dayNo && r.ok);
  const recovered = round(today.filter(r => r.activity === ACT.REST).reduce((s, r) => s + Math.max(0, r.stamina_delta), 0));
  const used = st?.medClosed || 0;
  const active = Boolean(st?.medActive);
  return {
    restStreak: st?.restStreak || 0,
    restHours: st?.restHours || 0,
    restLeft: Math.max(0, limits.restMax - (st?.restHours || 0)),
    restRecovered: recovered,
    streakText: !st?.restStreak ? 'Sem descanso em andamento' : st.restStreak < 4 ? `${st.restStreak} h seguidas: a recuperação vem ao completar 4 h` : `${st.restStreak} h seguidas: recuperando`,
    trainLeft: Math.max(0, limits.trainMax - (st?.trainHours || 0)),
    spellLeft: Math.max(0, limits.spellMax - (st?.spellHours || 0)),
    meditationUsed: used,
    meditationActive: active,
    meditationMax: limits.sessions,
    meditationLeft: Math.max(0, limits.sessions - used - (active ? 1 : 0)),
  };
}

// Sessões de meditação em ordem (mais recentes primeiro): início, duração e rolagem.
export function meditationSessions(runs) {
  const sessions = [];
  let cur = null;
  for (const r of [...runs].sort((a, b) => a.tick - b.tick)) {
    const med = r.detail?.meditation;
    if (r.activity === ACT.MEDITATE && r.ok && med?.started) { cur = { startTick: r.tick, face: med.face, sides: med.sides, roll: med.roll, rate: med.rate, hours: 0, closed: false }; sessions.push(cur); }
    if (r.activity === ACT.MEDITATE && r.ok && cur && !cur.closed) cur.hours += 1;
    if (med?.closed && cur) { cur.closed = true; cur.hours = med.hours || cur.hours; cur = null; }
  }
  return sessions.reverse();
}

// Agrupa os acumuladores de XP por alvo: [{ kind, name, normal, focused }], perícias e atributos primeiro.
export function groupPools(progress) {
  const map = new Map();
  for (const p of progress) {
    const k = `${p.kind}:${p.name}`;
    const g = map.get(k) || { kind: p.kind, name: p.name, normal: null, focused: null };
    g[p.modality] = p;
    map.set(k, g);
  }
  const order = { skill: 0, attribute: 1, spell: 2 };
  return [...map.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
}
