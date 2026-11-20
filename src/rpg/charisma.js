// Carisma da ficha: a soma do que a raça, as vantagens e as complicações dão ao personagem.
// Mesmas regras que a rolagem usa em Persuadir e Manha (edgeBonuses.js e sheetRoll.js), reunidas em um número.
// Lógica pura, conferida em charisma.test.js.
import { racialEffects } from '../templates.js';
import { charismaEntries } from './edgeBonuses.js';

// Parte da raça: Sáurio sofre −2 sempre; Androide, Meio-elfo e Meio-orc só diante de outras raças;
// Rakashano sofre −4 (duas vezes) só em situações específicas.
function racialCharisma(c) {
  const id = c.raceId;
  const racial = racialEffects(c);
  const race = id || c.race || 'Raça';
  const always = [];
  const conditional = [];
  if (id === 'Sáurio') always.push({ kind: 'Raça', name: race, value: racial.charisma });
  else if (racial.charisma) conditional.push({ kind: 'Raça', name: race, value: racial.charisma, when: 'diante de outras raças' });
  if (id === 'Rakashano') {
    conditional.push({ kind: 'Raça', name: 'Rakashano, Sanguinário', value: -4, when: 'diante dos mais civilizados' });
    conditional.push({ kind: 'Raça', name: 'Rakashano, Inimigo Racial', value: -4, when: 'diante da raça inimiga' });
  }
  return { always, conditional };
}

// { total, always, conditional }: `total` soma só o que vale sempre; `conditional` lista o que depende da situação.
export function charismaBreakdown(c) {
  const race = racialCharisma(c);
  const entries = charismaEntries(c.advantages, c.hindrances);
  const always = [...race.always, ...entries.filter(e => !e.when)];
  const conditional = [...race.conditional, ...entries.filter(e => e.when)];
  return { total: always.reduce((sum, e) => sum + e.value, 0), always, conditional };
}

export const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

// Texto curto para dica: "Raça Sáurio −2 · Vantagem Atraente +2".
export const charismaTitle = ({ always, conditional }) => {
  const line = e => `${e.kind} ${e.name} ${signed(e.value)}${e.when ? ` (${e.when})` : ""}`;
  const parts = [...always.map(line), ...conditional.map(line)];
  return parts.length ? parts.join(" · ") : "Nada altera o Carisma";
};
