import { ATTRIBUTES } from './rules.js';

export const blankDraft = () => ({ id: '', name: '', attributes: Object.fromEntries(ATTRIBUTES.map(a => [a, 4])), skills: {}, advantages: [] });
export const draftFromSheet = c => ({ id: '', name: c.concept || '', attributes: { ...c.attributes }, skills: { ...c.skills }, advantages: c.advantages.map(a => a.name).filter(Boolean) });

// O que a pessoa montou, sem o id (que só existe depois de salvar) e sem espaços sobrando no nome.
const content = ({ name, attributes, skills, advantages }) => JSON.stringify({ name: name.trim(), attributes, skills, advantages });

// Há edição que se perderia ao fechar: o rascunho difere do ponto de partida (em branco, da ficha ou do modelo salvo).
export const isDraftDirty = (draft, baseline) => content(draft) !== content(baseline);
