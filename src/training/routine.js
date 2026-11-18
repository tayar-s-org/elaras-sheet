// Rotina de treino: simula um dia (de 01:00 a 00:00) com as regras da mesa para atividades físicas,
// mágicas, descanso e meditação. Tudo calculado a partir do que o jogador escolhe em cada hora.

export const HOURS = [...Array.from({ length: 23 }, (_, i) => `${String(i + 1).padStart(2, '0')}:00`), '00:00'];

export const ACTIVITIES = [
  { id: '', label: '—' },
  { id: 'fisico', label: 'Treino físico' },
  { id: 'estudo', label: 'Estudo mágico' },
  { id: 'pratica', label: 'Prática mágica' },
  { id: 'meditar', label: 'Meditação' },
  { id: 'aprimorar', label: 'Aprimoramento de mana' },
  { id: 'descanso', label: 'Descanso completo (dormir)' },
  { id: 'simples', label: 'Descanso simples' },
  { id: 'outro', label: 'Outra atividade' },
];

export const PHYSICAL_MAX_HOURS = 12;
export const FULL_REST_HOURS = 8;
export const FULL_REST_RECOVERY = 12;
export const SIMPLE_REST_PER_HOUR = 2;
export const SIMPLE_REST_MAX_HOURS = 4;
export const MANA_IMPROVEMENT_POINTS = 50;

// Fadiga por hora de treino físico: horas 1-4 custam 1, 5-8 custam 2 e 9-12 custam 4 (4h = 4, 8h = 12, 12h = 28).
export const physicalCost = hour => (hour <= 4 ? 1 : hour <= 8 ? 2 : 4);

// Mana recuperada por hora de meditação: 1 / (4 − x/4), com x = resultado da rolagem de Meditar (máx. 12, que dá 1 por hora).
export function meditationRate(roll) {
  const x = Math.min(12, Math.max(0, Number(roll) || 0));
  return 1 / (4 - x / 4);
}
// Máximo de meditações por dia: 1/6 do Espírito, no mínimo 1.
export const maxMeditations = spiritDie => Math.max(1, Math.floor((Number(spiritDie) || 0) / 6));
// Prática mágica: no máximo metade do dado de Conjurar, em horas por dia.
export const maxPracticeHours = conjurarDie => Math.floor((Number(conjurarDie) || 0) / 2);

export const emptyRoutine = () => ({
  period: '', place: '', fed: true, meditRoll: 0, startStamina: null, startMana: null,
  rows: HOURS.map(() => ({ a: '', n: '' })),
});

// Garante o formato (dados vindos do banco podem estar incompletos ou adulterados).
export function normalizeRoutine(raw) {
  const base = emptyRoutine();
  if (!raw || typeof raw !== 'object') return base;
  const num = (v, min, max) => (v === null || v === undefined || v === '' ? null : Math.min(max, Math.max(min, Math.trunc(Number(v)) || 0)));
  const ids = new Set(ACTIVITIES.map(a => a.id));
  return {
    period: String(raw.period || '').slice(0, 60),
    place: String(raw.place || '').slice(0, 100),
    fed: raw.fed !== false,
    meditRoll: num(raw.meditRoll, 0, 12) ?? 0,
    startStamina: num(raw.startStamina, 0, 1000),
    startMana: num(raw.startMana, 0, 100000),
    rows: HOURS.map((_, i) => {
      const r = Array.isArray(raw.rows) ? raw.rows[i] : null;
      return { a: ids.has(r?.a) ? r.a : '', n: String(r?.n || '').slice(0, 200) };
    }),
  };
}

const round = n => Math.round(n * 100) / 100;

// stats: { maxStamina, maxMana, spirit (dado), conjurar (dado) }
export function simulateRoutine(routine, stats) {
  const r = normalizeRoutine(routine);
  const maxS = Math.max(0, stats.maxStamina || 0);
  const maxM = Math.max(0, stats.maxMana || 0);
  let stamina = Math.min(maxS, r.startStamina ?? maxS);
  let mana = Math.min(maxM, r.startMana ?? maxM);
  const rate = meditationRate(r.meditRoll);
  const sessionsMax = maxMeditations(stats.spirit);
  const practiceMax = maxPracticeHours(stats.conjurar);
  const count = { fisico: 0, pratica: 0, descanso: 0, simples: 0, aprimorar: 0, sessions: 0 };
  const warnings = [];
  const warn = (hour, text) => warnings.push(`${HOURS[hour]}: ${text}`);
  let previous = '';

  const rows = r.rows.map((row, i) => {
    let ve = 0, vm = 0, effect = '';
    switch (row.a) {
      case 'fisico': {
        count.fisico += 1;
        const cost = physicalCost(count.fisico);
        ve = -cost;
        effect = `Treino físico, ${count.fisico}ª hora: −${cost} de fadiga`;
        if (count.fisico > PHYSICAL_MAX_HOURS) warn(i, `passou de ${PHYSICAL_MAX_HOURS} horas de treino físico seguidas (só um descanso completo reinicia).`);
        if (stamina + ve < 0) warn(i, 'a estamina acabou: o personagem não aguenta este treino.');
        break;
      }
      case 'estudo':
        vm = -1;
        effect = 'Estudo mágico: −1 de mana (sem acréscimo ao longo do dia)';
        if (mana + vm < 0) warn(i, 'sem mana suficiente para estudar.');
        break;
      case 'pratica':
        count.pratica += 1;
        if (count.pratica > practiceMax) {
          effect = `Prática mágica passou do limite de ${practiceMax}h por dia: sem efeito`;
          warn(i, `limite de prática mágica é ${practiceMax}h por dia (metade de Conjurar).`);
        } else {
          vm = -1;
          effect = `Prática mágica, ${count.pratica}/${practiceMax}h: −1 de mana`;
          if (mana + vm < 0) warn(i, 'sem mana suficiente para praticar.');
        }
        break;
      case 'meditar':
      case 'aprimorar': {
        if (previous !== 'meditar' && previous !== 'aprimorar') count.sessions += 1;
        if (count.sessions > sessionsMax) {
          effect = `Passou do limite de ${sessionsMax} meditação(ões) por dia: sem efeito`;
          if (previous !== 'meditar' && previous !== 'aprimorar') warn(i, `limite de ${sessionsMax} entrada(s) em estado meditativo por dia (1/6 do Espírito, mínimo 1).`);
        } else if (row.a === 'meditar') {
          vm = rate;
          effect = `Meditação: +${round(rate)} de mana por hora`;
        } else if (mana < maxM) {
          effect = 'Aprimoramento de mana: a mana precisa estar cheia';
          warn(i, 'para aprimorar a mana máxima, a mana precisa estar cheia.');
        } else {
          count.aprimorar += 1;
          effect = 'Aprimoramento de mana: horas contadas no treino';
        }
        break;
      }
      case 'descanso':
        count.descanso += 1;
        if (!r.fed) {
          effect = 'Descanso completo sem estar alimentado: não recupera';
          if (count.descanso === 1) warn(i, 'a recuperação física exige estar alimentado.');
        } else if (count.descanso % FULL_REST_HOURS === 0) {
          ve = FULL_REST_RECOVERY;
          count.fisico = 0; // o treino físico é reiniciado depois de um descanso completo
          effect = `Descanso completo (${FULL_REST_HOURS}/${FULL_REST_HOURS}h): +${FULL_REST_RECOVERY} de fadiga recuperada`;
        } else {
          effect = `Descanso completo, ${count.descanso % FULL_REST_HOURS}/${FULL_REST_HOURS}h`;
        }
        break;
      case 'simples':
        count.simples += 1;
        if (!r.fed) {
          effect = 'Descanso simples sem estar alimentado: não recupera';
        } else if (count.simples > SIMPLE_REST_MAX_HOURS) {
          effect = `Descanso simples passou do limite de ${SIMPLE_REST_MAX_HOURS}h por dia: sem efeito`;
          warn(i, `descanso simples só recupera nas primeiras ${SIMPLE_REST_MAX_HOURS}h do dia.`);
        } else {
          ve = SIMPLE_REST_PER_HOUR;
          effect = `Descanso simples, ${count.simples}/${SIMPLE_REST_MAX_HOURS}h: +${SIMPLE_REST_PER_HOUR} de fadiga recuperada`;
        }
        break;
      case 'outro':
        effect = row.n ? '' : 'Outra atividade: sem efeito nas regras';
        break;
      default:
        break;
    }
    const beforeS = stamina, beforeM = mana;
    stamina = Math.min(maxS, Math.max(0, stamina + ve));
    mana = Math.min(maxM, Math.max(0, mana + vm));
    previous = row.a;
    return { hour: HOURS[i], a: row.a, n: row.n, effect, stamina: round(stamina), mana: round(mana), ve: round(stamina - beforeS), vm: round(mana - beforeM) };
  });

  // Aprimoramento: cada +1 de mana máxima exige o tempo de recuperar 50 de mana meditando (com mana cheia).
  const hoursPerPoint = Math.ceil(MANA_IMPROVEMENT_POINTS / rate);
  return {
    rows,
    warnings,
    totalVE: round(rows.reduce((s, x) => s + x.ve, 0)),
    totalVM: round(rows.reduce((s, x) => s + x.vm, 0)),
    endStamina: round(stamina),
    endMana: round(mana),
    rate: round(rate),
    sessionsMax,
    practiceMax,
    improvement: { hours: count.aprimorar, hoursPerPoint, progress: round(count.aprimorar / hoursPerPoint) },
  };
}
