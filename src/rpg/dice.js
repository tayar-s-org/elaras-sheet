// Dados da ficha. O dado-base e o bônus são propriedades SEPARADAS:
//   d12+2 = rola-se 1d12 e soma-se 2 ao resultado. Nunca vira "D24" nem muda de lados.
// Na ficha o dado-base continua um número (4, 6, 8, 10, 12; 0 = sem treino) em `skills`/`attributes`, e o bônus
// (só existe com dado-base 12) fica em `bonuses.skills[nome]` / `bonuses.attributes[nome]`.

export const DIE_LADDER = [4, 6, 8, 10, 12];
export const MAX_BONUS = 50;

export const KINDS = { skill: 'skills', attribute: 'attributes' };

export function readDie(c, kind, name) {
  const group = KINDS[kind];
  if (!group) throw new RangeError(`Tipo de traço inválido: ${kind}`);
  const die = Number(c?.[group]?.[name]) || 0;
  const bonus = die === 12 ? Math.max(0, Math.trunc(Number(c?.bonuses?.[group]?.[name]) || 0)) : 0;
  return { die, bonus };
}

// "d12+2", "d8", "sem treino" (perícia sem dado = d4−2 nas regras da mesa).
export function describeDie({ die, bonus = 0 }) {
  if (!die) return 'sem treino';
  return `d${die}${bonus > 0 ? `+${bonus}` : ''}`;
}

// Próximo passo de evolução: d4→d6→d8→d10→d12→d12+1→d12+2… (sem treino vai para d4). O dado-base nunca passa de 12.
export function stepUp({ die, bonus = 0 }) {
  if (!die) return { die: 4, bonus: 0 };
  if (die < 12) return { die: DIE_LADDER[DIE_LADDER.indexOf(die) + 1], bonus: 0 };
  return { die: 12, bonus: Math.min(MAX_BONUS, bonus + 1) };
}

// Rola o dado-base e soma o bônus. `rng(sides)` devolve um inteiro de 1 a sides. Sem treino rola d4 e tira 2.
export function rollDie({ die, bonus = 0 }, rng) {
  const sides = die || 4;
  const face = rng(sides);
  return { face, total: face + (die ? bonus : -2), sides };
}

// Aleatório criptográfico (navegador e Node 22+).
export const cryptoRng = sides => {
  const max = Math.floor(0x100000000 / sides) * sides;
  const buf = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(buf); } while (buf[0] >= max);
  return (buf[0] % sides) + 1;
};
