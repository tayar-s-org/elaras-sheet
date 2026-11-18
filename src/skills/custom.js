// Perícia personalizada: pedida pelo jogador, aprovada pelo mestre e guardada na própria ficha
// (c.customSkills = [{ id, name }] e o dado em c.skills[nome], como qualquer perícia).

export const MAX_CUSTOM_SKILLS = 20;
export const MAX_SKILL_NAME = 40;
export const SKILL_ID = /^cs-[0-9a-f-]{36}$/;
export const skillEntryId = rowId => `cs-${rowId}`;

export const cleanSkillName = name => String(name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_SKILL_NAME);
// Comparação sem acento e sem diferença de maiúsculas ("Furtividade" = "furtividade").
export const skillKey = name => cleanSkillName(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Custo em pontos de um dado de perícia: 1 ponto por degrau a partir do d4 (d4 = 1 … d12 = 5), igual às demais perícias.
export const skillPoints = die => (die ? (die - 2) / 2 : 0);

// fixedNames: nomes das perícias do livro (vêm de rules.js, para não haver import circular).
export function sanitizeCustomSkills(raw, fixedNames) {
  const taken = new Set(fixedNames.map(skillKey));
  const out = [];
  for (const e of Array.isArray(raw) ? raw.slice(0, MAX_CUSTOM_SKILLS * 2) : []) {
    const name = cleanSkillName(e?.name);
    const key = skillKey(name);
    if (!SKILL_ID.test(String(e?.id || '')) || !name || taken.has(key)) continue;
    taken.add(key);
    out.push({ id: e.id, name });
    if (out.length >= MAX_CUSTOM_SKILLS) break;
  }
  return out;
}

// O nome já existe (perícia do livro ou personalizada) na ficha?
export const skillNameTaken = (name, c, fixedNames) => {
  const key = skillKey(name);
  return fixedNames.some(n => skillKey(n) === key) || (c.customSkills || []).some(s => skillKey(s.name) === key);
};

// Nome livre: se já existir, acrescenta " (2)", " (3)"…
export function uniqueSkillName(name, c, fixedNames) {
  const base = cleanSkillName(name);
  if (!skillNameTaken(base, c, fixedNames)) return base;
  for (let i = 2; ; i += 1) {
    const suffix = ` (${i})`;
    const candidate = base.slice(0, MAX_SKILL_NAME - suffix.length) + suffix;
    if (!skillNameTaken(candidate, c, fixedNames)) return candidate;
  }
}

// Ficha com a perícia aprovada (id da linha do pedido) já no dado pedido. Repetir o mesmo id não duplica.
export function addCustomSkill(c, row, fixedNames) {
  const id = skillEntryId(row.id);
  if ((c.customSkills || []).some(s => s.id === id)) return c;
  if ((c.customSkills || []).length >= MAX_CUSTOM_SKILLS) return c;
  const name = uniqueSkillName(row.name, c, fixedNames);
  if (!name) return c;
  return { ...c, customSkills: [...(c.customSkills || []), { id, name }], skills: { ...c.skills, [name]: [4, 6, 8, 10, 12].includes(row.die) ? row.die : 4 } };
}

// Tira a perícia personalizada da ficha (e o dado dela).
export function removeCustomSkill(c, id) {
  const skill = (c.customSkills || []).find(s => s.id === id);
  if (!skill) return c;
  const { [skill.name]: _removed, ...skills } = c.skills;
  return { ...c, customSkills: c.customSkills.filter(s => s.id !== id), skills };
}
