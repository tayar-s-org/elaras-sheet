import { ATTRIBUTES, SKILLS, calculate } from './rules.js';

export const stages = ['Novato', 'Experiente', 'Veterano', 'Heroico', 'Lendário'];
export const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const stageIndex = value => stages.findIndex(stage => normalize(stage) === normalize(value));
export const stageForXP = xp => stages[Math.min(4, Math.floor(Math.max(0, Number(xp) || 0) / 20))];
export const minimumStage = entry => stages.find(stage => normalize(entry.requirements).split(',').map(normalize).includes(normalize(stage)));

const skillAliases = new Map([['investigacao','Investigar'], ['intimidacao','Intimidar'], ['conjuracao','Conjurar']]);
const traits = new Map([...ATTRIBUTES, ...SKILLS.map(([name]) => name)].map(name => [normalize(name), name]));

export function checkAdvantage(entry, character, advantageNames, current = calculate(character)) {
  const missing = [], manual = [];
  const knownEdges = new Set(advantageNames.map(normalize));
  const owned = character.advantages.map(item => normalize(item.name));
  const stage = minimumStage(entry);
  if (stage && stageIndex(stageForXP(character.xp)) < stageIndex(stage)) missing.push(`${stage} (${stageIndex(stage) * 20} XP)`);
  if (!entry.requirements) manual.push('Requisitos não cadastrados');

  const classify = clause => {
    const dice = clause.match(/^(.+?) d(4|6|8|10|12)\+?$/);
    if (dice) {
      const names = dice[1].split(/ e | ou |\//).map(name => traits.get(name) || skillAliases.get(name));
      if (names.some(name => !name)) return null;
      const matches = names.map(name => (character.attributes[name] ?? character.skills[name] ?? 0) >= Number(dice[2]));
      return / ou |\//.test(dice[1]) ? matches.some(Boolean) : matches.every(Boolean);
    }
    const edges = clause.split(' ou ');
    if (edges.every(edge => knownEdges.has(edge))) {
      if (edges.some(edge => owned.includes(edge) || (edge === 'antecedente arcano' && owned.some(name => name.startsWith('antecedente arcano ('))))) return true;
      return character.rules.ownedAdvantages > 0 ? null : false;
    }
    if (/^antecedente arcano \([^)]+\)$/.test(clause) && !clause.includes('menos')) {
      if (owned.includes(clause)) return true;
      return owned.includes('antecedente arcano') || character.rules.ownedAdvantages > 0 ? null : false;
    }
    return null;
  };

  for (const requirement of (entry.requirements || '').split(',').map(value => value.trim()).filter(Boolean)) {
    const clause = normalize(requirement);
    if (stageIndex(clause) >= 0) continue;
    const result = classify(clause);
    if (result === false) missing.push(requirement);
    if (result === null) manual.push(requirement);
  }

  // Custo de adicionar esta vantagem agora (a proxima posicao da lista), comparando o total antes e depois.
  const withEntry = { ...character, advantages: [...character.advantages, { name: entry.name, description: '', power: false }] };
  const cost = calculate(withEntry).advantageCost - current.advantageCost;
  if (cost > 0 && current.remaining < cost) missing.push(`${cost} ${cost === 1 ? 'ponto disponível' : 'pontos disponíveis'} (saldo: ${current.remaining})`);
  return {stage, cost, missing, manual};
}

export function powersFromBook(pages) {
  const fields = ['Estágio', 'Pontos de Poder', 'Distância', 'Duração'];
  return pages.filter(({page}) => page >= 153 && page <= 168).flatMap(({page, blocks}) => blocks.flatMap((text, index) => {
    const name = blocks[index - 1];
    if (!text.startsWith('• Estágio:') || !name || name !== name.toLocaleUpperCase('pt-BR')) return [];
    const values = fields.map((field, offset) => blocks[index + offset]?.startsWith(`• ${field}:`) ? blocks[index + offset].split(':').slice(1).join(':').trim() : '');
    if (!values.every(Boolean)) return [];
    const [stage, cost, range, duration] = values;
    const start = index + (blocks[index + 4]?.startsWith('• Manifestações:') ? 5 : 4);
    const summary = blocks[start]?.match(/^.*?[.!?](?=\s|$)/)?.[0] || blocks[start] || '';
    const title = name.charAt(0) + name.slice(1).toLocaleLowerCase('pt-BR');
    return [{name:title, page, stage, cost, range, duration, summary}];
  }));
}
