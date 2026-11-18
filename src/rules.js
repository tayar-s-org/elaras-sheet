import { racialEffects } from "./templates.js";
import { START_MONEY, normalizeMoney } from "./money.js";
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
    "Agilidade governa mobilidade e fuga de armadilhas. Astúcia influencia aprendizado e limite de conhecimentos ativos. Espírito governa perícias arcanas e mana. Força governa impacto corpo a corpo e carga. Vigor determina vida e stamina. Movimentação = piso(soma dos atributos / 12). Aparar = Lutar / 2 + 2. Resistência = Vigor / 2 + 2.",
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
    "Cada reserva máxima é igual a Vigor. Incapacitação 1: vida ou stamina na metade, perde um estágio de todos os dados. Incapacitação 2: abaixo de 25%, perde 2 de Movimentação. Incapacitação 3: já estar no estágio 2 e sofrer nova incapacitação, perde dois estágios de todos os dados. Incapacitação 4: as duas reservas gerando estágio 2, perde 6 de Movimentação. Incapacitação 5: após “x horas” no estágio 4, desmaia. Atributos têm mínimo d4 e Movimentação mínima 1. As incapacitações somam: cada reserva vale 1 na metade e 2 abaixo de 25%, e a soma de Vida e Stamina é o estágio (1 em cada = Incapacitação 2). Cada tipo de efeito segue o estágio mais alto que o atinge: dados −1 nos estágios 1 e 2 e −2 nos estágios 3 e 4; Movimentação −2 nos estágios 2 e 3 e −6 no estágio 4 (não soma com o −2). O dado selvagem não muda. O mestre define as horas (X) do estágio 5.",
  ],
  [
    "Mana e exaustão",
    "Mana máxima = 10 + 2 × Espírito. Bônus específicos podem ser registrados em Mana adicional. Na metade, o tempo de conjuração dobra e magias instantâneas passam a levar um turno. Abaixo de 25%, o efeito dos feitiços cai pela metade. Ao atingir 10%, o personagem testa Espírito a cada turno para evitar desmaiar.",
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
    equipment: "",
    history: "",
    notes: "",
    tokenImage: "",
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

export function calculate(c) {
  const a = c.attributes;
  const racial = racialEffects(c);
  const level = Math.floor((c.xp || 0) / 5);
  const progressionPoints = level * 2;
  const attributeCost = ATTRIBUTES.reduce(
    (sum, name) =>
      sum +
      Math.max(
        0,
        (a[name] - (racial.base[name] || (name === "Agilidade" && c.rules.racialAgility ? 6 : 4))) / 2,
      ) *
        2,
    0,
  );
  const skillCost = Object.entries(c.skills).reduce(
    (sum, [name, die]) => sum + Math.max(0, (die ? (die - 2) / 2 : 0) - (name === racial.skill ? 2 : 0)),
    0,
  );
  const advantageCost =
    c.advantages.reduce(
      (sum, _, i) => sum + (i < racial.freeEdges ? 0 : 1 + c.rules.ownedAdvantages + i - racial.freeEdges),
      0,
    ) - c.rules.advantageDiscount;
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
      Math.floor(ATTRIBUTES.reduce((sum, name) => sum + a[name], 0) / 12) +
        c.movementBonus + racial.movement,
    ),
    parry: 2 + (c.skills.Lutar || 0) / 2 + c.parryBonus,
    toughness: 2 + a.Vigor / 2 + c.armor + racial.toughness,
    life: a.Vigor,
    stamina: a.Vigor,
    mana:
      10 + a.Espírito * 2 +
      c.manaBonus,
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
  c.tokenImage = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/.test(raw.tokenImage) ? raw.tokenImage : "";
  c.raceId = ["Androide","Anão","Atlante","Aviano","Elfo","Humano","Meio-elfo","Meio-orc","Pequenino","Rakashano","Sáurio"].includes(raw.raceId) ? raw.raceId : "";
  c.raceChoice = raw.raceChoice === "Vantagem" ? "Vantagem" : "Agilidade";
  c.raceSkill = SKILLS.some(([name]) => name === raw.raceSkill) ? raw.raceSkill : "Conhecimento";
  for (const name of ATTRIBUTES) {
    if (!DICE.includes(raw.attributes[name]))
      throw new Error("Atributo inválido no arquivo.");
    c.attributes[name] = raw.attributes[name];
  }
  c.skills = Object.fromEntries(
    SKILLS.filter(([name]) => DICE.includes(raw.skills?.[name])).map(
      ([name]) => [name, raw.skills[name]],
    ),
  );
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
    .map((x) => ({
      name: string(x.name, 200),
      description: string(x.description),
      cost: string(x.cost, 100),
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
