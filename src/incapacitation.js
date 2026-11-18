// Incapacitação de Vida e Stamina (regras da mesa). Lógica pura, usada pela sala e conferida nos testes.
//
// Cada reserva tem um nível próprio: 0 (acima da metade), 1 (na metade ou menos) e 2 (abaixo de 25%).
// As incapacitações SOMAM: nível da Vida + nível da Stamina = Incapacitação 0..4.
//   Incapacitação 1: perde 1 estágio de todos os dados.
//   Incapacitação 2: perde 2 de Movimentação.
//   Incapacitação 3: perde 2 estágios de todos os dados.
//   Incapacitação 4: perde 6 de Movimentação.
//   Incapacitação 5: quando passa mais de X horas na Incapacitação 4, o personagem desmaia (o mestre define X).
// Cada tipo de efeito segue o estágio mais alto que o atinge (dados: 0,1,1,2,2; movimento: 0,0,2,2,6),
// como na ficha de referência da mesa (-6 no estágio 4 substitui o -2, não soma com ele).

export const DIE_LADDER = [4, 6, 8, 10, 12];
const DIE_STEPS = [0, 1, 1, 2, 2];
const MOVE_PENALTY = [0, 0, 2, 2, 6];

// 0: acima da metade; 1: na metade ou menos; 2: abaixo de 25%.
export const resourceLevel = (current, max) => {
  if (!(max > 0)) return 0;
  if (current < max * 0.25) return 2;
  return current <= max / 2 ? 1 : 0;
};

const current = (state, max, key) => Math.min(max[key] ?? 0, Math.max(0, Number.isFinite(state?.[key]) ? state[key] : (max[key] ?? 0)));

// state: { life, stamina, faint: { hours, fainted } } (como salvo na mesa); max: { life, stamina }.
export function incapacitation(state, max) {
  const life = resourceLevel(current(state, max, 'life'), max.life);
  const stamina = resourceLevel(current(state, max, 'stamina'), max.stamina);
  const total = life + stamina;
  const hours = Number.isFinite(state?.faint?.hours) && state.faint.hours > 0 ? state.faint.hours : null;
  const fainted = total >= 4 && Boolean(state?.faint?.fainted);
  return {
    levels: { life, stamina },
    total,
    stage: fainted ? 5 : total,
    fainted,
    faintHours: hours,
    dieSteps: DIE_STEPS[total],
    movePenalty: MOVE_PENALTY[total],
  };
}

// Dado depois de perder `steps` estágios. Atributos nunca ficam abaixo de d4;
// perícias abaixo de d4 viram d4 com −2 por estágio a mais (die 0 = sem treino, que já é d4−2).
export function steppedDie(die, steps, kind = 'attribute') {
  const index = die ? DIE_LADDER.indexOf(die) + 1 : 0;
  if (die && index === 0) return { die, bonus: 0 };
  const next = index - steps;
  if (next >= 1) return { die: DIE_LADDER[next - 1], bonus: 0 };
  if (kind === 'attribute') return { die: 4, bonus: 0 };
  return { die: 4, bonus: -2 * (1 - next) };
}

export const effectiveMovement = (base, penalty) => Math.max(1, base - penalty);

const LEVEL_WORD = ['normal', 'na metade', 'abaixo de 25%'];
export const stageLabel = inc => (inc.fainted ? 'Incapacitação 5 · Desmaiado' : inc.total ? `Incapacitação ${inc.total}` : 'Sem incapacitação');

export function effectLines(inc) {
  const lines = [];
  if (inc.dieSteps) lines.push(`−${inc.dieSteps} estágio${inc.dieSteps > 1 ? 's' : ''} em todos os dados (atributos nunca abaixo de d4)`);
  if (inc.movePenalty) lines.push(`−${inc.movePenalty} de Movimentação (mínimo 1)`);
  if (inc.fainted) lines.push('Desmaiado: não age até ser reanimado');
  return lines;
}

export const causeLine = inc => `Vida ${LEVEL_WORD[inc.levels.life]} · Stamina ${LEVEL_WORD[inc.levels.stamina]}`;
