import { applyEvolution } from '../../rpg/progression.js';
import { describeDie, readDie } from '../../rpg/dice.js';
import { SKILLS } from '../../rules.js';
import { addCustomSkill } from '../../skills/custom.js';

const FIXED_SKILLS = SKILLS.map(([name]) => name);
const plural = (list, one, many) => (list.length > 1 ? many : one);

// Regra de cada benefício que o servidor entrega: como ele entra na ficha e o aviso que o jogador recebe.
// `name` é o nome da ficha (pode estar vazio); `after` é a ficha já com os benefícios aplicados.
export const BENEFIT_RULES = {
  // Evolução confirmada em "Ver Meus Treinamentos" (o servidor já debitou a XP).
  evolutions: {
    apply: (character, evolutions) => evolutions.reduce((c, e) => applyEvolution(c, e.kind, e.name), character),
    notice: (name, evolutions, after) => {
      const summary = evolutions.map(e => `${e.name} (${describeDie(readDie(after, e.kind, e.name))})`).join(', ');
      return `🎓 ${name || 'Sua ficha'} evoluiu: ${summary}.`;
    },
  },
  // Melhoria de feitiço conquistada no Estudo Mágico (a descrição vai para a ficha e para o token).
  spellUpgrades: {
    apply: (character, upgrades) => ({
      ...character,
      powers: character.powers.map(power => {
        const mine = upgrades.filter(u => u.spell_id === power.id);
        const earned = mine.map(u => ({ n: u.n, description: u.description, at: u.at }));
        return mine.length ? { ...power, upgrades: [...(power.upgrades || []), ...earned] } : power;
      }),
    }),
    notice: (name, upgrades) => `✨ ${name || 'Sua ficha'} aprimorou ${upgrades.length > 1 ? `${upgrades.length} feitiços` : 'um feitiço'}: veja em Magia.`,
  },
  // Perícia personalizada que o mestre aprovou.
  customSkills: {
    apply: (character, skills) => skills.reduce((acc, row) => addCustomSkill(acc, row, FIXED_SKILLS), character),
    notice: (name, skills) => {
      const names = skills.map(r => `${r.name} (${r.attribute ? `${r.attribute}, ` : ''}d${r.die})`).join(', ');
      return `🎓 O mestre aprovou ${plural(skills, 'a perícia', 'as perícias')} ${names}. Já ${plural(skills, 'está', 'estão')} na ficha de ${name || 'sua ficha'}.`;
    },
  },
};
