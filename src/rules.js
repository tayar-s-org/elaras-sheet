import { racialEffects } from "./templates.js";
import { START_MONEY, normalizeMoney } from "./money.js";
import { inventoryEffects, itemById } from "./market/items.js";
import { sanitizeCustom, isCustomId } from "./market/custom.js";
import { bookFacts } from "./data/matchBookPower.js";
import { sanitizeCustomSkills } from "./skills/custom.js";
export const ATTRIBUTES = [
  "Agilidade",
  "Astúcia",
  "Espírito",
  "Força",
  "Vigor",
];
export const DICE = [4, 6, 8, 10, 12];
export const SKILLS = [
  ["Arremessar", "Agilidade"],
  ["Arrombar", "Agilidade"],
  ["Atirar", "Agilidade"],
  ["Cavalgar", "Agilidade"],
  ["Conhecimento", "Astúcia"],
  ["Consertar", "Astúcia"],
  ["Curar", "Astúcia"],
  ["Dirigir", "Agilidade"],
  ["Escalar", "Força"],
  ["Furtividade", "Agilidade"],
  ["Intimidar", "Espírito"],
  ["Investigar", "Astúcia"],
  ["Jogar", "Astúcia"],
  ["Lutar", "Agilidade"],
  ["Manha", "Astúcia"],
  ["Nadar", "Agilidade"],
  ["Navegar", "Agilidade"],
  ["Perceber", "Astúcia"],
  ["Persuadir", "Espírito"],
  ["Pilotar", "Agilidade"],
  ["Provocar", "Astúcia"],
  ["Rastrear", "Astúcia"],
  ["Sobrevivência", "Astúcia"],
  ["Conjurar", "Espírito"],
  ["Meditar", "Espírito"],
  ["Fé", "Espírito"],
  ["Ciência Estranha", "Astúcia"],
  ["Conhecimento (Ciência)", "Astúcia"],
  ["Conhecimento (Outro)", "Astúcia"],
  ["Conhecimento (Batalha)", "Astúcia"],
  ["Conhecimento (Arcano)", "Astúcia"],
];

export const MASTER_RULES = [
  [
    "Criação e pontos",
    "Humanos começam com d4 nos cinco atributos. O orçamento inicial é 30 pontos. Nível = piso(XP / 5); cada nível concede 2 pontos adicionais. Outras raças podem receber mais ou menos pontos. Cada estágio de atributo custa 2 pontos, até d12. Cada estágio de perícia custa 1 ponto. Perícias adquiridas depois do início da campanha começam em d4−2 e exigem 2 pontos para chegar a d4.",
  ],
  [
    "Vantagens e desvantagens",
    "Uma desvantagem menor concede 3 pontos e uma maior concede 5. O custo de uma vantagem começa em 1 e aumenta em 1 para cada vantagem já existente. Os pré-requisitos continuam valendo. A planilha não estabelece limite de desvantagens nem explica como vantagens raciais afetam esse custo.",
  ],
  [
    "Atributos e derivados",
    "Agilidade governa mobilidade e fuga de armadilhas. Astúcia influencia aprendizado e limite de conhecimentos ativos. Espírito governa perícias arcanas e mana. Força governa impacto corpo a corpo e carga. Vigor determina vida e stamina. Movimentação = piso(soma dos atributos / 12) + 1. Aparar = Lutar / 2 + 2. Resistência = Vigor / 2 + 2.",
  ],
  [
    "Ataques",
    "Atirar e Arremessar têm sucesso quando o resultado supera a Movimentação do alvo. Atirar causa Agilidade + dano do equipamento. Arremessar causa Força + dano do equipamento. Lutar determina Aparar e a capacidade de acertar no corpo a corpo. A relação entre dano, Resistência, vida e ferimentos precisa ser definida pelo mestre.",
  ],
  [
    "Perícias de exploração",
    "Sem Nadar, o personagem se afoga ao ser submergido, conforme o texto da mesa. Sem Perceber, não identifica armadilhas e afins. Furtividade camufla no ambiente. Cavalgar, Dirigir, Navegar e Pilotar controlam o meio de transporte. A planilha exige perícia suficiente para levar passageiros sem a perícia e deixa essa quantidade em aberto.",
  ],
  [
    "Vida e stamina",
    "Cada reserva máxima é igual a Vigor. Incapacitação 1: vida ou stamina na metade, perde um estágio de todos os dados. Incapacitação 2: abaixo de 25%, perde 2 de Movimentação. Incapacitação 3: já estar no estágio 2 e sofrer nova incapacitação, perde dois estágios de todos os dados. Incapacitação 4: as duas reservas gerando estágio 2, perde 6 de Movimentação. Incapacitação 5: após “x horas” no estágio 4, desmaia. Atributos e perícias têm mínimo d4 (a perícia sem treino continua d4−2) e Movimentação mínima 1. As incapacitações somam: cada reserva vale 1 na metade e 2 abaixo de 25%, e a soma de Vida e Stamina é o estágio (1 em cada = Incapacitação 2). Cada tipo de efeito segue o estágio mais alto que o atinge: dados −1 nos estágios 1 e 2 e −2 nos estágios 3 e 4; Movimentação −2 nos estágios 2 e 3 e −6 no estágio 4 (não soma com o −2). O dado selvagem não muda. O mestre define as horas (X) do estágio 5.",
  ],
  [
    "Mana e exaustão",
    "Mana máxima = 10 + 2 × Espírito, mais 10 para cada vantagem Pontos de Poder. Outros bônus específicos podem ser registrados em Mana adicional. Na metade, o tempo de conjuração dobra e magias instantâneas passam a levar um turno. Abaixo de 25%, o efeito dos feitiços cai pela metade. Ao atingir 10%, o personagem testa Espírito a cada turno para evitar desmaiar.",
  ],
  [
    "Treinamento físico",
    "Complexidade 1: custa 1 de fadiga por hora nas primeiras 4 horas, 2 por hora da 5ª à 8ª e 4 por hora da 9ª à 12ª. Os totais são 4, 12 e 28. Reinicia após descanso completo. Alimentado, recupera 12 de fadiga após 8 horas de sono. Descanso simples recupera 2 por hora, até 4 horas por dia.",
  ],
  [
    "Treinamento mágico",
    "Estudar feitiço de complexidade 1 custa 1 de mana por hora. Praticá-lo custa 1 ponto por hora, com limite diário de metade de Conjurar. Em densidade 1, meditar recupera 1 de mana por 4 horas, reduzindo o intervalo pelo resultado / 4, até 1 hora por ponto. Entradas em meditação por dia = Espírito / 6, mínimo 1. Arredondamento a combinar.",
  ],
  [
    "Aprimorar mana",
    "Depois do aprendizado apropriado, é possível aumentar a reserva máxima. Para cada ponto adicional, meditar pelo tempo que recuperaria 50 de mana, começando com a reserva cheia. O treinamento pode ser continuado em até 7 dias.",
  ],
];

export function newCharacter() {
  return {
    schemaVersion: 1,
    name: "",
    player: "",
    age: "",
    xp: 0,
    money: START_MONEY,
    dice: {weaponName:'', weaponDie:0, weaponCount:1, damageBonus:0},
    concept: "",
    race: "Humano",
    raceId: "",
    raceChoice: "Agilidade",
    raceSkill: "Conhecimento",
    village: "Seylara",
    attributes: Object.fromEntries(ATTRIBUTES.map((name) => [name, 4])),
    skills: {},
    advantages: [],
    hindrances: [],
    powers: [],
    // d12+N: o bônus fica separado do dado-base (só existe com dado d12). evolved = passos de dado ganhos por XP de treino,
    // que não contam como pontos gastos na criação.
    bonuses: { skills: {}, attributes: {} },
    evolved: { skills: {}, attributes: {} },
    equipment: "",
    history: "",
    notes: "",
    tokenImage: "",
    inventory: [],
    customSkills: [],
    armor: 0,
    movementBonus: 0,
    parryBonus: 0,
    manaBonus: 0,
    rules: {
      budget: 30,
      racialAgility: false,
      extraPoints: 0,
      spentElsewhere: 0,
      ownedAdvantages: 0,
      advantageDiscount: 0,
    },
  };
}

export function elaraCharacter() {
  const c = newCharacter();
  return {
    ...c,
    name: "Elara Windrunner",
    concept: "Barda elfa · arco e canções arcanas",
    race: "Elfa",
    raceId: "Elfo",
    attributes: { Agilidade: 8, Astúcia: 6, Espírito: 8, Força: 4, Vigor: 6 },
    skills: {
      Atirar: 8,
      Conjurar: 6,
      Persuadir: 6,
      Perceber: 6,
      Furtividade: 4,
      Lutar: 4,
      Nadar: 4,
    },
    equipment:
      "Alaúde\nArco e flechas (modelo e disponibilidade a combinar)\nAdaga\nCapa de viagem\nCaderno de canções",
    history:
      "Elara cresceu tocando alaúde para os viajantes de Seylara. Uma viajante cantou a melodia de sua mãe com um verso desconhecido, que descrevia uma trilha na floresta. Agora Elara procura o lugar onde essa canção termina.",
    notes:
      "Proposta para revisar com o mestre. Confirmar os traços élficos, o orçamento e o acesso inicial à conjuração.",
    rules: { ...c.rules, racialAgility: true },
  };
}

export const MANA_PER_POWER_POINTS = 10;
const edgeKey = name => String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Custo de cada vantagem na ordem da ficha (a 1a custa 1, a 2a custa 2...). Copias repetidas de uma vantagem
// sao permitidas e custam o mesmo que qualquer outra na sua posicao, sem acrescimo.
export function advantageCosts(c, freeEdges = 0) {
  const seen = new Set();
  return c.advantages.map((item, i) => {
    const key = edgeKey(item.name);
    const repeat = Boolean(key) && seen.has(key);
    if (key) seen.add(key);
    return { cost: i < freeEdges ? 0 : 1 + c.rules.ownedAdvantages + i - freeEdges, repeat };
  });
}

export function calculate(c) {
  const a = c.attributes;
  const racial = racialEffects(c);
  const level = Math.floor((c.xp || 0) / 5);
  const progressionPoints = level * 2;
  // Passos de dado ganhos com XP de treino não gastam pontos de criação (2 por passo de atributo, 1 por passo de perícia).
  const attributeCost = ATTRIBUTES.reduce(
    (sum, name) =>
      sum +
      Math.max(
        0,
        Math.max(
          0,
          (a[name] - (racial.base[name] || (name === "Agilidade" && c.rules.racialAgility ? 6 : 4))) / 2,
        ) * 2 - (c.evolved?.attributes?.[name] || 0) * 2,
      ),
    0,
  );
  const skillCost = Object.entries(c.skills).reduce(
    (sum, [name, die]) => sum + Math.max(0, (die ? (die - 2) / 2 : 0) - (name === racial.skill ? 2 : 0) - (c.evolved?.skills?.[name] || 0)),
    0,
  );
  const advantageCost =
    advantageCosts(c, racial.freeEdges).reduce((sum, item) => sum + item.cost, 0) - c.rules.advantageDiscount;
  // Itens equipados do mercado somam a Resistência e ao Aparar; peso acima da carga (2,5 × Força, em kg) tira Movimentação.
  const inv = inventoryEffects(c.inventory, a.Força);
  // Cada vantagem "Pontos de Poder" (pode ser repetida) soma +10 de mana maximo.
  const powerPointEdges = c.advantages.filter(item => edgeKey(item.name).startsWith("pontos de poder")).length;
  const extra =
    c.hindrances.reduce((sum, h) => sum + (h.severity === "Maior" ? 5 : 3), 0) +
    c.rules.extraPoints;
  const spent =
    attributeCost +
    skillCost +
    Math.max(0, advantageCost) +
    c.rules.spentElsewhere;
  return {
    racial,
    level,
    progressionPoints,
    charisma: racial.charisma,
    attributeCost,
    skillCost,
    advantageCost: Math.max(0, advantageCost),
    extra,
    spent,
    remaining:
      Number(c.rules.budget === "" ? 30 : c.rules.budget) + progressionPoints + extra - spent,
    movement: Math.max(
      1,
      // soma dos dados dos atributos ÷ 12, arredondado para baixo, mais 1 (cinco d12: 60 ÷ 12 + 1 = 6)
      Math.floor(ATTRIBUTES.reduce((sum, name) => sum + a[name], 0) / 12) + 1 +
        c.movementBonus + racial.movement + inv.movement - inv.overload,
    ),
    parry: 2 + (c.skills.Lutar || 0) / 2 + c.parryBonus + inv.parry,
    toughness: 2 + a.Vigor / 2 + c.armor + inv.armor + racial.toughness,
    inventory: inv,
    life: a.Vigor,
    stamina: a.Vigor,
    powerPointEdges,
    mana:
      10 + a.Espírito * 2 +
      powerPointEdges * MANA_PER_POWER_POINTS +
      c.manaBonus + inv.mana,
  };
}

function string(value, max = 10000) {
  return typeof value === "string" ? value.slice(0, max) : "";
}
function integer(value, min, max, fallback = 0) {
  return Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}
const fromBook = (power, key) => bookFacts(power.name, power.cost)?.[key] || "";
function powerId(index, name) {
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `p${index}-${h.toString(36)}`;
}

export function validateCharacter(raw) {
  if (!raw || raw.schemaVersion !== 1 || !raw.attributes || !raw.rules)
    throw new Error("Formato de ficha incompatível.");
  const c = newCharacter();
  c.xp = integer(raw.xp, 0, 1000000);
  c.money = normalizeMoney(raw.money);
  c.dice = {
    weaponName: string(raw.dice?.weaponName, 100),
    weaponDie: DICE.includes(raw.dice?.weaponDie) ? raw.dice.weaponDie : 0,
    weaponCount: integer(raw.dice?.weaponCount, 1, 2, 1),
    damageBonus: integer(raw.dice?.damageBonus, -100, 100),
  };
  for (const name of [
    "name",
    "player",
    "concept",
    "race",
    "village",
    "equipment",
    "history",
    "notes",
  ])
    c[name] = string(raw[name]);
  // Mochila do mercado: só ids que existem no catálogo, quantidade 1 a 99, e um item equipado por espaço.
  const takenSlots = new Set();
  c.inventory = (Array.isArray(raw.inventory) ? raw.inventory : []).slice(0, 300).flatMap(entry => {
    if (isCustomId(entry?.id)) {
      const custom = sanitizeCustom(entry.custom, { attributes: ATTRIBUTES, skills: SKILLS.map(([name]) => name) });
      return custom ? [{ id: entry.id, custom, qty: integer(entry.qty, 1, 99, 1), equipped: entry.equipped === true }] : [];
    }
    const item = itemById.get(entry?.id);
    if (!item) return [];
    let equipped = entry.equipped === true && Boolean(item.slot) && !takenSlots.has(item.slot);
    if (equipped) takenSlots.add(item.slot);
    return [{ id: item.id, qty: integer(entry.qty, 1, 99, 1), equipped }];
  });
  c.tokenImage = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/.test(raw.tokenImage) ? raw.tokenImage : "";
  c.age = string(raw.age, 30);
  c.raceId = ["Androide","Anão","Atlante","Aviano","Elfo","Humano","Meio-elfo","Meio-orc","Pequenino","Rakashano","Sáurio"].includes(raw.raceId) ? raw.raceId : "";
  c.raceChoice = raw.raceChoice === "Vantagem" ? "Vantagem" : "Agilidade";
  c.raceSkill = SKILLS.some(([name]) => name === raw.raceSkill) ? raw.raceSkill : "Conhecimento";
  for (const name of ATTRIBUTES) {
    if (!DICE.includes(raw.attributes[name]))
      throw new Error("Atributo inválido no arquivo.");
    c.attributes[name] = raw.attributes[name];
  }
  // Perícias personalizadas (aprovadas pelo mestre) guardam o dado em c.skills junto com as do livro.
  c.customSkills = sanitizeCustomSkills(raw.customSkills, SKILLS.map(([name]) => name));
  c.skills = Object.fromEntries(
    [...SKILLS.map(([name]) => name), ...c.customSkills.map(s => s.name)]
      .filter(name => DICE.includes(raw.skills?.[name]))
      .map(name => [name, raw.skills[name]]),
  );
  // Bônus de d12+N e passos de evolução: só valem para traços que existem e (no caso do bônus) com dado d12.
  const counts = (source, group, names, max, only12) => {
    const out = {};
    for (const name of names) {
      const v = integer(source?.[group]?.[name], 0, max);
      if (v > 0 && (!only12 || c[group][name] === 12)) out[name] = v;
    }
    return out;
  };
  const skillNames = Object.keys(c.skills).concat(SKILLS.map(([n]) => n).filter(n => !(n in c.skills)));
  c.bonuses = { skills: counts(raw.bonuses, "skills", skillNames, 50, true), attributes: counts(raw.bonuses, "attributes", ATTRIBUTES, 50, true) };
  c.evolved = { skills: counts(raw.evolved, "skills", skillNames, 20, false), attributes: counts(raw.evolved, "attributes", ATTRIBUTES, 20, false) };
  c.advantages = (Array.isArray(raw.advantages) ? raw.advantages : [])
    .slice(0, 100)
    .map((x) => ({
      name: string(x.name, 200),
      description: string(x.description),
      power: x.power === true,
    }));
  c.hindrances = (Array.isArray(raw.hindrances) ? raw.hindrances : [])
    .slice(0, 100)
    .map((x) => ({
      name: string(x.name, 200),
      description: string(x.description),
      severity: x.severity === "Maior" ? "Maior" : "Menor",
    }));
  c.powers = (Array.isArray(raw.powers) ? raw.powers : [])
    .slice(0, 100)
    .map((x, i) => ({
      // id estável do feitiço (treino e melhorias se ligam a ele). Quem não tem ganha um determinístico (posição + nome),
      // que passa a valer quando a ficha é salva; ids já gravados nunca mudam.
      id: /^[A-Za-z0-9_-]{1,64}$/.test(x.id || "") ? x.id : powerId(i, x.name),
      name: string(x.name, 200),
      description: string(x.description),
      cost: string(x.cost, 100),
      // Dados de regra do feitiço mostrados na ficha.
      // Campos vazios de poderes que vieram do livro são preenchidos com os dados do livro (o que o jogador escreveu prevalece).
      damage: string(x.damage, 100) || fromBook(x, "damage"),
      range: string(x.range, 100) || fromBook(x, "range"),
      duration: string(x.duration, 100) || fromBook(x, "duration"),
      // Melhorias conquistadas no Estudo Mágico: { n, description, at }.
      upgrades: (Array.isArray(x.upgrades) ? x.upgrades : []).slice(0, 20).map((u, i) => ({
        n: integer(u?.n, 1, 20, i + 1), description: string(u?.description, 2000), at: string(u?.at, 40),
      })),
    }));
  for (const key of ["armor", "movementBonus", "parryBonus", "manaBonus"])
    c[key] = integer(raw[key], -100, 1000);
  c.rules = {
    budget: raw.rules.budget === "" ? 30 : integer(raw.rules.budget, 0, 10000, 30),
    racialAgility: raw.rules.racialAgility === true,
    extraPoints: integer(raw.rules.extraPoints, 0, 10000),
    spentElsewhere: integer(raw.rules.spentElsewhere, 0, 10000),
    ownedAdvantages: integer(raw.rules.ownedAdvantages, 0, 100),
    advantageDiscount: integer(raw.rules.advantageDiscount, 0, 10000),
  };
  const racial = racialEffects(c);
  for (const [name, die] of Object.entries(racial.base)) c.attributes[name] = Math.max(die, c.attributes[name]);
  if (racial.skill) c.skills[racial.skill] = Math.max(6, c.skills[racial.skill] || 0);
  return c;
}
