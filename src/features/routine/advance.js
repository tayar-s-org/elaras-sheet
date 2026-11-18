import { loadCharacters, loadStates } from '../../lib/room.js';
import { loadRoutines } from '../../lib/training.js';
import { loadRoutineDays } from '../../lib/clock.js';
import { loadProgress, loadTraining, advanceTime } from '../../lib/engine.js';
import { loadRequests, approvedJobs } from '../../lib/requests.js';
import { statsFromCharacter, processTicks } from '../../rpg/processor.js';
import { checkAdvance } from '../../rpg/readiness.js';
import { normalizeRoutine } from '../../training/routine.js';
import { safeMaxima } from '../room/vitals.js';
import { cryptoRng } from '../../rpg/dice.js';

// Passagem de tempo do mestre. Tudo é relido do servidor na hora (nada de dado antigo da tela), a validação é refeita,
// as atividades de TODOS os personagens são processadas hora a hora e o resultado vai ao servidor, que confere de novo
// e grava tudo (relógio, ledger, recursos, XP) numa única transação.
export async function runAdvance({ tableId, members, tick, hours, kind }) {
  const roster = members.filter(m => m.status === 'approved' && m.character_id);
  const ids = roster.map(m => m.character_id);
  const [chars, states, routines, days, progress, training, requests] = await Promise.all([
    loadCharacters(ids), loadStates(tableId), loadRoutines(tableId), loadRoutineDays(tableId), loadProgress(tableId), loadTraining(tableId), loadRequests(tableId),
  ]);
  if (!routines || !days || !progress || !training || !requests) throw new Error('As migrations 0023, 0024 e 0025 precisam estar rodadas no Supabase.');
  const byId = Object.fromEntries(routines.map(r => [r.id, r]));

  const report = checkAdvance({
    characters: roster.map(m => ({ characterId: m.character_id, userId: m.user_id, name: chars[m.character_id]?.name || '' })),
    assignments: days, routines: byId, fromTick: tick, hours,
  });
  if (!report.ok) throw new Error('Há pendências nos calendários. Confira o resumo antes de avançar.');

  const entries = roster.map(m => {
    const id = m.character_id;
    const row = chars[id];
    if (!row) throw new Error(`Ficha de ${m.profiles?.display_name || 'um jogador'} não encontrada.`);
    const trained = (progress[id] || []).filter(p => p.kind === 'spell' && p.earned_total > 0).map(p => p.name);
    const stats = statsFromCharacter(row.data, [...new Set(trained)], approvedJobs(requests, id));
    const max = safeMaxima(row.data);
    const st = states[id] || {};
    const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' && v !== undefined ? Number(v) : fallback);
    const state = {
      stamina: Math.min(stats.maxStamina, Math.max(0, num(st.stamina, stats.maxStamina))),
      mana: Math.min(stats.maxMana, Math.max(0, num(st.mana, stats.maxMana))),
    };
    const dayState = training[id]?.day_state && Object.keys(training[id].day_state).length ? { ...training[id].day_state, dayNo: training[id].day_no } : null;
    const mine = days[id] || {};
    const normalized = {};
    return {
      characterId: id, stats, state, day: dayState, max,
      rowAt: (dayNo, slot) => {
        const rid = mine[dayNo];
        const routine = rid && byId[rid];
        if (!routine) return null;
        const data = (normalized[rid] ||= normalizeRoutine(routine.data));
        return { row: data.rows[slot], routineId: rid, fed: data.fed };
      },
    };
  });

  const results = processTicks({ entries, fromTick: tick, hours, rng: cryptoRng });
  const events = results.flatMap(r => r.events);
  const daysOut = Object.fromEntries(results.map((r, i) => [r.characterId, { dayNo: r.day?.dayNo ?? 0, state: r.day || {}, max: entries[i].max }]));
  return advanceTime(tableId, hours, tick, kind, events, daysOut);
}
