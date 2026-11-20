import { SKILLS } from '../rules.js';
import { rollDie } from './dice.js';
import { meditationSessionsPerDay, spellTrainingHoursPerDay } from './tiers.js';

// Atividades da rotina. Cada linha da rotina é { a, skill, spell, mode, n }:
//   a = atividade · skill/spell = alvo do treino · mode = 'normal' | 'focused' · n = anotação do jogador.
// Todas as fórmulas de custo, ganho e limite ficam AQUI (e em tiers.js/progression.js), nunca na interface.

export const ACT = {
  SKILL: 'treinar_pericia', SPELL: 'treinar_feitico', STUDY: 'estudo_magico', WORK: 'trabalhar',
  REST: 'descanso_completo', QUICK: 'descanso_rapido', MEDITATE: 'meditar',
};
export const ACTIVITY_LABEL = {
  [ACT.SKILL]: 'Treinar Perícia', [ACT.SPELL]: 'Treinar Feitiço', [ACT.STUDY]: 'Estudo Mágico', [ACT.WORK]: 'Trabalhar',
  [ACT.REST]: 'Descanso Completo', [ACT.QUICK]: 'Descanso Rápido', [ACT.MEDITATE]: 'Meditar',
};
export const ENABLED_ACTIVITIES = [ACT.SKILL, ACT.SPELL, ACT.STUDY, ACT.WORK, ACT.REST, ACT.QUICK, ACT.MEDITATE];
export const ACTIVITIES = [{ id: '', label: '—' }, ...ENABLED_ACTIVITIES.map(id => ({ id, label: ACTIVITY_LABEL[id] }))];

export const SKILL_TRAIN_MAX_HOURS = 12;
// Treinar a perícia Conjurar gasta também mana: 1 por hora, fixo (não acompanha o custo de estamina nem o treino focado).
export const CAST_SKILL = 'Conjurar';
export const CAST_MANA_COST = 1;
export const WORK_MAX_HOURS = 12;
export const REST_MAX_HOURS = 12;
export const REST_MIN_STREAK = 4;
export const REST_PER_HOUR = 1.5;
export const QUICK_PER_HOUR = 2;
export const QUICK_MAX_HOURS = 4;
export const LOW_RESOURCE = 1; // estamina/mana em 1 ou menos: não começa atividade que a consome
// Nenhuma atividade da rotina deixa a estamina abaixo de 1: só se gasta o que passa de 1 (a hora ainda conta, o custo é limitado).
export const spendableStamina = stamina => Math.max(0, stamina - LOW_RESOURCE);
export const STUDY_HOURS_PER_DIE = 25;

// Estamina por hora de treino de perícia: horas 1–4 custam 1, 5–8 custam 2, 9–12 custam 4 (4h=4, 8h=12, 12h=28).
export const trainingStaminaCost = hour => (hour <= 4 ? 1 : hour <= 8 ? 2 : 4);
export const modalityOf = row => (row?.mode === 'focused' ? 'focused' : 'normal');
const modalityFactor = row => (modalityOf(row) === 'focused' ? 2 : 1);

// Descanso completo: nada nas 3 primeiras horas seguidas; ao completar a 4ª recupera 6 (4 × 1,5, retroativo); depois 1,5 por hora.
export function restPayout(streak) {
  if (streak < REST_MIN_STREAK) return 0;
  return streak === REST_MIN_STREAK ? REST_MIN_STREAK * REST_PER_HOUR : REST_PER_HOUR;
}
// Total acumulado de uma sequência de `hours` horas (para mostrar no editor).
export const restTotal = hours => (hours < REST_MIN_STREAK ? 0 : hours * REST_PER_HOUR);

// Meditar: mana por hora = 1 / (4 − x/4), x = rolagem de Meditar (máx. 12, que dá 1 por hora).
export function meditationRate(roll) {
  const x = Math.min(12, Math.max(0, Number(roll) || 0));
  return 1 / (4 - x / 4);
}

// Dados de Astúcia ganhos no Estudo Mágico: 1 a cada 25 horas. Sem teto no total ganho: cada tentativa gasta 16 e o saldo
// precisa poder se recompor (um teto no total ganho deixava no máximo 8 dados depois da 1ª tentativa, para sempre).
export const astuciaDiceFor = hours => Math.floor((Number(hours) || 0) / STUDY_HOURS_PER_DIE);

// Atributo ligado à perícia: o do livro ou, nas personalizadas, o escolhido na ficha (stats.customAttrs).
export const linkedAttribute = (skill, stats) => SKILLS.find(([name]) => name === skill)?.[1] || stats?.customAttrs?.[skill] || null;

// Motivo pelo qual a atividade não pode começar com estes recursos (vazio = pode).
// skill: nome da perícia treinada (treinar Conjurar também gasta mana, então com mana em 1 ou menos ela bloqueia).
export function blockedReason(activity, stamina, mana, skill = '') {
  if (activity === ACT.SKILL && stamina <= LOW_RESOURCE) return 'Bloqueado: estamina em 1 ou menos, sem forças para este treino';
  if (activity === ACT.SKILL && skill === CAST_SKILL && mana <= LOW_RESOURCE) return 'Bloqueado: mana em 1 ou menos, treinar Conjurar também gasta mana';
  if (activity === ACT.SPELL && mana <= LOW_RESOURCE) return 'Bloqueado: mana em 1 ou menos, sem mana para esta atividade';
  return '';
}

// Campos que cada atividade mostra no editor (só o que faz sentido para ela).
export function fieldsFor(activity) {
  switch (activity) {
    case ACT.SKILL: return ['skill', 'mode'];
    case ACT.SPELL: return ['spell', 'mode'];
    case ACT.STUDY: return ['spell'];
    case ACT.WORK: return ['job'];
    default: return [];
  }
}

// Problema de preenchimento de uma linha (vazio = ok). stats: ver statsFromCharacter.
export function rowIssue(row, stats) {
  switch (row?.a) {
    case ACT.SKILL:
      if (!row.skill) return 'escolha a perícia';
      if (!stats.skills.includes(row.skill)) return 'esta perícia não está na ficha';
      return linkedAttribute(row.skill, stats) ? '' : 'defina o atributo desta perícia personalizada na ficha (aba Perícias)';
    case ACT.SPELL:
      if (!row.spell) return 'escolha o feitiço';
      return stats.spells.some(s => s.id === row.spell) ? '' : 'este feitiço não está na ficha';
    case ACT.STUDY:
      if (!row.spell) return 'escolha o feitiço';
      return stats.trainedSpells.includes(row.spell) ? '' : 'só se estuda um feitiço que já passou pelo treinamento';
    case ACT.WORK:
      if (!row.job) return 'escolha o trabalho';
      return stats.jobs?.[row.job] ? '' : 'este trabalho não está aprovado';
    default: return '';
  }
}

export const newDay = dayNo => ({
  dayNo, trainHours: 0, spellHours: 0, workHours: 0, restHours: 0, restStreak: 0, quickHours: 0,
  medClosed: 0, medActive: false, medHours: 0, medRoll: 0, medRate: 0, prev: '',
});

const round = n => Math.round(n * 1000) / 1000;

// Cada atividade tem seu tratador: recebe { act, row, stats, state, d (estado do dia), ev (evento), fed, rng, fail } e devolve a variação
// de recursos { stamina, mana } (ausente = 0). Os tratadores MUTAM d e ev de propósito (o estado do dia e o evento da hora).
// Recusar a hora = fail(motivo); recursos e XP só valem se ev.ok.
function handleSkill({ row, stats, state, d, ev, fail }) {
  if (rowIssue(row, stats)) return fail(`Perícia ${rowIssue(row, stats)}.`);
  if (d.trainHours >= SKILL_TRAIN_MAX_HOURS) return fail(`Limite de ${SKILL_TRAIN_MAX_HOURS} horas de treino por dia.`);
  const blocked = blockedReason(ACT.SKILL, state.stamina, state.mana, row.skill);
  if (blocked) return fail(blocked);
  d.trainHours += 1;
  const cost = trainingStaminaCost(d.trainHours) * modalityFactor(row);
  const delta = { stamina: -Math.min(cost, spendableStamina(state.stamina)) };
  if (row.skill === CAST_SKILL) { delta.mana = -Math.min(CAST_MANA_COST, state.mana); ev.manaCost = CAST_MANA_COST; }
  const mod = modalityOf(row);
  ev.xp.push({ kind: 'skill', name: row.skill, modality: mod, amount: 1 });
  const attr = linkedAttribute(row.skill, stats);
  if (attr) ev.xp.push({ kind: 'attribute', name: attr, modality: mod, amount: 0.5 });
  ev.cost = cost;
  ev.trainHour = d.trainHours;
  return delta;
}

function handleSpell({ row, stats, state, d, ev, fail }) {
  const limit = spellTrainingHoursPerDay(stats.conjurar);
  if (rowIssue(row, stats)) return fail(`Feitiço: ${rowIssue(row, stats)}.`);
  if (d.spellHours >= limit) return fail(`Limite de ${limit} hora(s) de treino de feitiço por dia (metade do dado-base de Conjurar).`);
  const blocked = blockedReason(ACT.SPELL, state.stamina, state.mana);
  if (blocked) return fail(blocked);
  d.spellHours += 1;
  const cost = modalityFactor(row);
  const mod = modalityOf(row);
  ev.xp.push({ kind: 'spell', name: row.spell, modality: mod, amount: 1 });
  ev.xp.push({ kind: 'skill', name: 'Conjurar', modality: mod, amount: 0.5 });
  ev.xp.push({ kind: 'attribute', name: 'Espírito', modality: mod, amount: 0.25 });
  ev.cost = cost;
  return { mana: -Math.min(cost, state.mana) };
}

function handleStudy({ row, stats, ev, fail }) {
  if (rowIssue(row, stats)) return fail(`Estudo: ${rowIssue(row, stats)}.`);
  ev.study = 1;
  ev.spell = row.spell;
}

function handleRest({ d, ev, fail }) {
  if (d.restHours >= REST_MAX_HOURS) return fail(`Limite de ${REST_MAX_HOURS} horas de descanso completo por dia.`);
  d.restHours += 1;
  d.restStreak = d.prev === ACT.REST ? d.restStreak + 1 : 1;
  const pay = restPayout(d.restStreak);
  ev.rest = { streak: d.restStreak, paid: pay };
  return { stamina: pay };
}

function handleQuickRest({ d, fed, fail }) {
  d.quickHours += 1;
  if (!fed) return fail('Descanso rápido sem estar alimentado: não recupera.');
  if (d.quickHours > QUICK_MAX_HOURS) return fail(`Descanso rápido só recupera nas primeiras ${QUICK_MAX_HOURS}h do dia.`);
  return { stamina: QUICK_PER_HOUR };
}

function handleMeditate({ stats, d, ev, rng, fail }) {
  if (!d.medActive) {
    if (d.medClosed >= meditationSessionsPerDay(stats.spirit)) return fail(`Sem sessões de meditação: limite de ${meditationSessionsPerDay(stats.spirit)} por dia.`);
    const r = rollDie(stats.meditar, rng);
    d.medActive = true; d.medHours = 0; d.medRoll = Math.min(12, Math.max(0, r.total)); d.medRate = meditationRate(d.medRoll);
    ev.meditation = { ...(ev.meditation || {}), started: true, face: r.face, sides: r.sides, roll: d.medRoll, rate: round(d.medRate) };
  }
  d.medHours += 1;
  // Cada hora meditada dá +1 XP em Meditar e +0,5 em Espírito (a Aptidão é aplicada pelo servidor ao gravar).
  ev.xp.push({ kind: 'skill', name: 'Meditar', modality: 'normal', amount: 1 });
  ev.xp.push({ kind: 'attribute', name: 'Espírito', modality: 'normal', amount: 0.5 });
  return { mana: d.medRate };
}

// Trabalho configurado pelo mestre: custos de estamina e mana por faixa de horas (1–4, 5–8, 9–12), pagamento e XP por hora.
function handleWork({ row, stats, state, d, ev, fail }) {
  const job = stats.jobs?.[row.job];
  if (!row.job) return fail('Trabalho não escolhido.');
  if (!job) return fail('Este trabalho não está aprovado pelo mestre.');
  if (d.workHours >= WORK_MAX_HOURS) return fail(`Limite de ${WORK_MAX_HOURS} horas de trabalho por dia.`);
  const n = d.workHours + 1;
  const tier = n <= 4 ? 0 : n <= 8 ? 1 : 2;
  const sCost = job.staminaTiers[tier], mCost = job.manaTiers[tier];
  if (sCost > 0 && state.stamina <= LOW_RESOURCE) return fail('Bloqueado: estamina em 1 ou menos, sem forças para trabalhar.');
  if (mCost > 0 && state.mana <= LOW_RESOURCE) return fail('Bloqueado: mana em 1 ou menos, sem mana para trabalhar.');
  d.workHours = n;
  if (job.xp > 0 && job.xpSkill) ev.xp.push({ kind: 'skill', name: job.xpSkill, modality: 'normal', amount: job.xp });
  ev.pay = job.pay;
  ev.job = row.job;
  ev.workHour = n;
  return { stamina: -Math.min(sCost, spendableStamina(state.stamina)), mana: -Math.min(mCost, state.mana) };
}

// Linha vazia = hora ociosa; atividade desconhecida não tem efeito.
function handleIdle({ act, ev }) {
  ev.ok = act === '';
  if (act === '') ev.idle = true;
}

const HANDLERS = {
  [ACT.SKILL]: handleSkill, [ACT.SPELL]: handleSpell, [ACT.STUDY]: handleStudy, [ACT.REST]: handleRest,
  [ACT.QUICK]: handleQuickRest, [ACT.MEDITATE]: handleMeditate, [ACT.WORK]: handleWork,
};

// Processa UMA hora de UM personagem. Função pura: recebe o estado e devolve o evento e o novo estado.
//   ctx = { dayNo, row, fed, stats, state: { stamina, mana }, day (estado do dia ou null), rng }
// Devolve { event, state, day }. event.ok é falso (com reason) quando a hora não teve efeito; recursos e XP só mudam se ok.
export function processHour({ dayNo, row, fed = true, stats, state, day, rng }) {
  const rolled = day && day.dayNo === dayNo;
  const d = rolled ? { ...day } : newDay(dayNo);
  const act = row?.a || '';
  const ev = { activity: act, ok: true, reason: '', staminaDelta: 0, manaDelta: 0, xp: [], study: 0 };
  const fail = reason => { ev.ok = false; ev.reason = reason; };
  const closeMeditation = () => {
    ev.meditation = { ...(ev.meditation || {}), closed: true, hours: d.medHours, roll: d.medRoll, rate: round(d.medRate) };
    d.medClosed += 1; d.medActive = false; d.medHours = 0;
  };
  // Mudou o dia com uma meditação aberta: ela se encerra (o dia seguinte começa com as sessões renovadas).
  if (day && !rolled && day.medActive) {
    ev.meditation = { closed: true, hours: day.medHours, roll: day.medRoll, rate: round(day.medRate), atDayChange: true };
  }
  if (d.medActive && act !== ACT.MEDITATE) closeMeditation();

  const handler = Object.hasOwn(HANDLERS, act) ? HANDLERS[act] : handleIdle;
  const { stamina: dS = 0, mana: dM = 0 } = handler({ act, row, stats, state, d, ev, fed, rng, fail }) || {};

  // O estado também fica arredondado (3 casas): assim a soma dos efeitos gravados é sempre igual ao estado final.
  const stamina = round(Math.min(stats.maxStamina, Math.max(0, state.stamina + dS)));
  const mana = round(Math.min(stats.maxMana, Math.max(0, state.mana + dM)));
  ev.staminaDelta = round(stamina - state.stamina);
  ev.manaDelta = round(mana - state.mana);
  ev.staminaAfter = round(stamina);
  ev.manaAfter = round(mana);
  if (!ev.ok) { ev.xp = []; ev.study = 0; }
  d.prev = ev.ok && act ? act : '';
  return { event: ev, state: { stamina, mana }, day: d };
}
