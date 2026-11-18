import { calculate, validateCharacter } from '../rules.js';
import { readDie } from './dice.js';
import { processHour, newDay, ACT } from './activities.js';
import { dayOfTick, slotOfTick } from './clock.js';
import { xpWithAptitude, pointsOf } from './aptitude.js';

// Processador de tempo: transforma "a campanha andou de tick A a tick B" em eventos do ledger, hora a hora.
// É puro (não acessa rede); quem grava é o servidor (advance_time), que garante unicidade e atomicidade.

// Estatísticas que as regras de atividade precisam, tiradas da ficha. trainedSpells = ids de feitiços que já passaram pelo treino.
// jobs = trabalhos aprovados pelo mestre para esta ficha: [{ id, name, staminaTiers, manaTiers, pay, xp, xpSkill }].
export function statsFromCharacter(data, trainedSpells = [], jobs = []) {
  const c = validateCharacter(data);
  const d = calculate(c);
  return {
    maxStamina: d.stamina,
    maxMana: d.mana,
    spirit: readDie(c, 'attribute', 'Espírito'),
    conjurar: readDie(c, 'skill', 'Conjurar'),
    meditar: readDie(c, 'skill', 'Meditar'),
    skills: Object.keys(c.skills).filter(k => c.skills[k] > 0),
    spells: c.powers.map(p => ({ id: p.id, name: p.name })),
    trainedSpells,
    jobs: Object.fromEntries(jobs.map(j => [j.id, j])),
  };
}

// Identificador único e estável de um evento: o mesmo personagem na mesma hora gera sempre o mesmo id.
export const eventId = (tableId, characterId, tick) => `${tableId}:${characterId}:${tick}`;

// entries: [{ characterId, stats, state: {stamina, mana}, day, rowAt(dayNo, slot) -> { row, routineId, fed } | null }]
// Devolve, por personagem, os eventos e o estado final. Avança de fromTick até fromTick + hours (cada hora = um tick).
export function processTicks({ entries, fromTick, hours, rng }) {
  return entries.map(entry => {
    let state = { ...entry.state };
    let day = entry.day || null;
    const events = [];
    for (let tick = fromTick; tick < fromTick + hours; tick += 1) {
      const dayNo = dayOfTick(tick);
      const slot = slotOfTick(tick);
      const at = entry.rowAt(dayNo, slot);
      const out = processHour({ dayNo, row: at?.row, fed: at?.fed !== false, stats: entry.stats, state, day, rng });
      state = out.state;
      day = out.day;
      const row = at?.row || {};
      events.push({
        ...out.event, tick, dayNo, slot, characterId: entry.characterId, routineId: at?.routineId || null,
        row: { a: row.a || '', skill: row.skill || '', spell: row.spell || '', job: row.job || '', mode: row.mode === 'focused' ? 'focused' : 'normal' },
      });
    }
    return { characterId: entry.characterId, events, state, day };
  });
}

// Simulação de um dia inteiro para o editor de rotina (mesmas regras do processamento real, Meditar usa o valor médio).
export function simulateDay(rows, { stats, fed = true, startStamina, startMana }) {
  let state = { stamina: Math.min(stats.maxStamina, startStamina ?? stats.maxStamina), mana: Math.min(stats.maxMana, startMana ?? stats.maxMana) };
  let day = null;
  const avg = sides => (sides + 1) / 2;
  const out = rows.map((row, slot) => {
    const before = { ...state };
    const r = processHour({ dayNo: 0, row, fed, stats, state, day, rng: avg });
    state = r.state; day = r.day;
    return { slot, row, ...r.event, staminaBefore: before.stamina, manaBefore: before.mana };
  });
  const xp = {};
  for (const e of out) for (const x of e.xp) { const k = `${x.kind}:${x.name}:${x.modality}`; xp[k] = { ...x, amount: (xp[k]?.amount || 0) + x.amount }; }
  // Prévia: o servidor aplica a Aptidão ao gravar; aqui só mostramos o ganho já com o bônus (stats.aptitude = distribuição confirmada).
  const preview = Object.values(xp).map(x => ({ ...x, base: x.amount, amount: xpWithAptitude(x.amount, x.kind, pointsOf(stats.aptitude, x.kind, x.name)) }));
  return {
    rows: out,
    endStamina: state.stamina,
    endMana: state.mana,
    totalStamina: out.reduce((s, e) => s + e.staminaDelta, 0),
    totalMana: out.reduce((s, e) => s + e.manaDelta, 0),
    xp: preview,
    day,
    warnings: out.filter(e => e.reason).map(e => ({ slot: e.slot, text: e.reason })),
  };
}

export { ACT };
