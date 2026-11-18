import races from './races.json' with { type: 'json' };
import archetypes from './archetypes.json' with { type: 'json' };
import catalog from './catalog.json' with { type: 'json' };

export { races, archetypes };
export function racialEffects(c) {
  // "Humano" digitado em Raça atual (sem aplicar do guia) tambem vale: o unico efeito humano e a 1a vantagem gratis.
  const id = c.raceId || (String(c.race || '').trim().toLowerCase() === 'humano' ? 'Humano' : '');
  const base = {};
  if (['Elfo','Rakashano'].includes(id) || (id === 'Meio-elfo' && c.raceChoice !== 'Vantagem')) base.Agilidade = 6;
  if (id === 'Anão') base.Vigor = 6;
  if (id === 'Atlante') base.Astúcia = 6;
  if (id === 'Meio-orc') base.Força = 6;
  if (id === 'Pequenino') base.Espírito = 6;
  const skill = id === 'Atlante' ? 'Nadar' : id === 'Androide' ? c.raceSkill : '';
  return { base, skill, freeEdges: ['Humano','Aviano'].includes(id) || (id === 'Meio-elfo' && c.raceChoice === 'Vantagem') ? 1 : 0,
    toughness: id === 'Atlante' ? 1 : ['Aviano','Pequenino'].includes(id) ? -1 : 0,
    movement: id === 'Anão' ? -1 : 0,
    charisma: ['Meio-elfo','Meio-orc','Androide','Sáurio'].includes(id) ? -2 : 0,
    benes: id === 'Pequenino' ? 1 : 0,
    notice: id === 'Sáurio' ? 2 : 0,
    climb: id === 'Rakashano' ? 2 : 0 };
}

export function applyRace(c, id, choice = 'Agilidade', skill = 'Conhecimento') {
  const old = racialEffects(c);
  const next = {...c, race:id || c.race, raceId:id, raceChoice:choice, raceSkill:skill,
    attributes:{...c.attributes}, skills:{...c.skills}, rules:{...c.rules,racialAgility:false}};
  const effects = racialEffects(next);
  for (const name of Object.keys(next.attributes)) {
    const oldBase = old.base[name] || (name === 'Agilidade' && c.rules.racialAgility ? 6 : 4);
    next.attributes[name] = Math.max(effects.base[name] || 4, Math.min(12, next.attributes[name] - oldBase + (effects.base[name] || 4)));
  }
  if (old.skill && next.skills[old.skill] === 6 && old.skill !== effects.skill) delete next.skills[old.skill];
  if (effects.skill) next.skills[effects.skill] = Math.max(6, next.skills[effects.skill] || 0);
  return next;
}

export function racialSummary(c) {
  const race = races.find(r => r.id === c.raceId);
  if (!race) return '';
  return `${race.id} — página ${race.page} do PDF\n${race.text.join('\n\n')}\nEscolha racial: ${c.raceChoice || 'Agilidade'}${c.raceId === 'Androide' ? `; programação: ${c.raceSkill} d6` : ''}`;
}

export function loadArchetype(blank, template, previous) {
  let c = applyRace({...blank, player:previous.player, village:previous.village, rules:{...blank.rules,budget:previous.rules.budget}},'Humano');
  c.concept = template.id;
  c.attributes = {...template.attributes};
  c.skills = {...template.skills};
  // Spend the book's open skill points on useful exploration skills as a ready-to-play suggestion.
  let remaining = template.extraSkills;
  for (const name of ['Nadar','Sobrevivência','Furtividade','Lutar','Perceber','Persuadir','Rastrear']) {
    if (!remaining) break;
    if (!c.skills[name]) { c.skills[name] = 4; remaining--; }
  }
  while (remaining > 0) {
    const name = Object.keys(c.skills).find(k => c.skills[k] < 8);
    if (!name) break;
    c.skills[name] += 2; remaining--;
  }
  c.advantages = template.advantages.map(name => {
    const edge = catalog.find(e => e.kind === 'advantages' && e.name.toLocaleLowerCase() === name.toLocaleLowerCase()) || (name.startsWith('Antecedente Arcano') ? catalog.find(e=>e.name === 'Antecedente Arcano') : null);
    return {name,description:edge ? `Requisitos: ${edge.requirements}\n\n${edge.description}` : `Vantagem do arquétipo, página ${template.page} do PDF. Consulte o mestre.`,power:false};
  });
  const gear = /Atirador|Pirata|Pistoleiro|Motorista|Piloto/.test(template.id) ? 'Arco e flechas (ou arma à distância do cenário)\nAdaga' : /Guerreiro/.test(template.id) ? 'Espada (ou arma corpo a corpo do cenário)' : 'Adaga';
  c.equipment = `${gear}\nMochila, cantil, rações e roupa de viagem (sugestão; confirmar recursos com o mestre).`;
  c.notes = `Arquétipo do livro: ${template.id}, página ${template.page} do PDF. Humano Novato.\n${template.extraSkills ? `${template.extraSkills} pontos abertos de perícia foram distribuídos como sugestão de exploração.\n` : ''}Recalculado com as fórmulas e os custos da mesa. O orçamento inicial continua sujeito ao mestre. A primeira vantagem usa a gratuidade racial. Equipamento é sugestão, sem bônus automáticos. Complicações são opcionais.\n${/Mago|Sacerdote|Cientista Estranho/.test(template.id) ? 'Escolher poderes e detalhes do antecedente arcano com o mestre antes de jogar.\n' : ''}Personalize nome, história e origem.`;
  return c;
}

// Arquétipo criado pelo jogador: aplica atributos, perícias, vantagens e equipamento sobre a ficha atual (mantém nome, raça e história).
export function loadCustomArchetype(c, tpl) {
  const next = {...c, concept:tpl.name, attributes:{...c.attributes, ...tpl.attributes}, skills:{...tpl.skills}, rules:{...c.rules}};
  const effects = racialEffects(next);
  for (const [name, die] of Object.entries(effects.base)) next.attributes[name] = Math.max(die, next.attributes[name]);
  if (effects.skill) next.skills[effects.skill] = Math.max(6, next.skills[effects.skill] || 0);
  next.advantages = tpl.advantages.map(name => {
    const edge = catalog.find(e => e.kind === 'advantages' && e.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    return {name, description:edge ? `Requisitos: ${edge.requirements}\n\n${edge.description}` : 'Vantagem do arquétipo personalizado. Confirme com o mestre.', power:false};
  });
  if (tpl.equipment) next.equipment = tpl.equipment;
  return next;
}

export const advantageNames = catalog.filter(e => e.kind === 'advantages').map(e => e.name);
