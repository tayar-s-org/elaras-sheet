// Vantagens e complicações do livro que mexem numericamente em rolagens de atributo ou perícia.
// As da ficha são só nome e texto; estas tabelas são o que o código sabe somar ou subtrair.
// - sem `when`: vale sempre e entra sozinha na conta;
// - com `when`: depende da situação, vira uma caixa que o jogador marca na hora de rolar.
// `targets`: [{ skill }, { attribute }, { linked: 'Astúcia' }] (o atributo e as perícias ligadas a ele) ou 'any' (tudo).
// `except`: alvos que ficam de fora de um 'any'.
// `upgrade`: [nome da vantagem melhorada, novo valor] (a melhorada substitui o valor da básica, não soma).
// `supersededBy`: se a ficha tem esta vantagem, a entrada some (Atraente some com Muito Atraente; Frenesi com o Aprimorado).
// `value` pode ser { Menor, Maior } nas complicações que mudam com a gravidade.
// `charisma`: o Carisma entra em Persuadir e Manha (regra do livro); só muda o texto da linha.
// Ficaram de fora, de propósito: o que só afeta aliados (Comando, Inspirar), dano, Aparar e Resistência, cartas de ação
// (Rápido, Focado), penalidades que a vantagem tira (Ambidestro, Mãos Firmes), Fadiga de dependências (Hábito Maior), dados
// de Força e Vigor do Idoso (já estão nos dados da ficha) e Profissional/Especialista (aparecem como d12+N no dado).

const PERSUADE = [{ skill: 'Persuadir' }, { skill: 'Manha' }];

export const EDGE_ROLL_EFFECTS = [
  // bônus
  { edge: 'Prontidão', targets: [{ skill: 'Perceber' }], value: 2 },
  { edge: 'Curandeiro', targets: [{ skill: 'Curar' }], value: 2 },
  { edge: 'Ás', targets: [{ skill: 'Dirigir' }, { skill: 'Navegar' }, { skill: 'Pilotar' }], value: 2 },
  { edge: 'Ladrão', targets: [{ skill: 'Arrombar' }, { skill: 'Escalar' }], value: 2 },
  { edge: 'Ladrão', targets: [{ skill: 'Furtividade' }], value: 2, when: 'em área urbana' },
  { edge: 'Senhor Conserta Tudo', targets: [{ skill: 'Consertar' }], value: 2 },
  { edge: 'Obstinado', targets: [{ skill: 'Intimidar' }, { skill: 'Provocar' }], value: 2 },
  { edge: 'Obstinado', targets: [{ attribute: 'Espírito' }, { attribute: 'Astúcia' }], value: 2, when: 'resistindo a Teste de Vontade' },
  { edge: 'Investigador', targets: [{ skill: 'Investigar' }, { skill: 'Manha' }], value: 2 },
  { edge: 'Investigador', targets: [{ skill: 'Perceber' }], value: 2, when: 'procurando evidências' },
  { edge: 'Mateiro', targets: [{ skill: 'Rastrear' }, { skill: 'Sobrevivência' }, { skill: 'Furtividade' }], value: 2, when: 'na natureza' },
  { edge: 'Arma Predileta', targets: [{ skill: 'Arremessar' }, { skill: 'Atirar' }, { skill: 'Lutar' }], value: 1, when: 'com a arma predileta', upgrade: ['Arma Predileta Aprimorada', 2] },
  { edge: 'Florentino', targets: [{ skill: 'Lutar' }], value: 1, when: 'contra oponente com uma arma só e sem escudo' },
  { edge: 'Furioso', targets: [{ skill: 'Lutar' }, { attribute: 'Força' }], value: 2, when: 'em fúria' },
  { edge: 'Corajoso', targets: [{ attribute: 'Espírito' }], value: 2, when: 'teste de Medo' },
  { edge: 'Cura Rápida', targets: [{ attribute: 'Vigor' }], value: 2, when: 'cura natural' },
  { edge: 'Esquiva', targets: [{ attribute: 'Agilidade' }], value: 1, when: 'escapando de ataque de área', upgrade: ['Esquiva Aprimorada', 2] },
  { edge: 'Saque Rápido', targets: [{ attribute: 'Agilidade' }], value: 2, when: 'sacando uma arma' },
  { edge: 'Reflexos De Combate', targets: [{ attribute: 'Espírito' }], value: 2, when: 'recuperando de Abalado' },
  { edge: 'Acrobata', targets: [{ attribute: 'Agilidade' }], value: 2, when: 'manobra acrobática' },
  { edge: 'Atirador', targets: [{ skill: 'Atirar' }, { skill: 'Arremessar' }], value: 2, when: 'sem se mover (vale como Mirar)' },
  { edge: 'Impulso', targets: 'any', value: 2, when: 'gastando um Bene' },
  { edge: 'Resistência Arcana', targets: 'any', value: 2, when: 'resistindo a poder arcano', upgrade: ['Resistência Arcana Aprimorada', 4] },
  // Carisma
  { edge: 'Atraente', targets: PERSUADE, value: 2, charisma: true, supersededBy: 'Muito Atraente' },
  { edge: 'Muito Atraente', targets: PERSUADE, value: 4, charisma: true },
  { edge: 'Carismático', targets: PERSUADE, value: 2, charisma: true },
  { edge: 'Nobre', targets: PERSUADE, value: 2, charisma: true },
  // penalidades das próprias vantagens
  { edge: 'Frenesi', targets: [{ skill: 'Lutar' }], value: -2, when: 'ataque extra (Frenesi)', supersededBy: 'Frenesi Aprimorado' },
  { edge: 'Varredura', targets: [{ skill: 'Lutar' }], value: -2, when: 'atacando todos os adjacentes (Varredura)', supersededBy: 'Varredura Aprimorada' },
  { edge: 'Contra-Ataque', targets: [{ skill: 'Lutar' }], value: -2, when: 'ataque livre de Contra-Ataque' },
  { edge: 'Noção Do Perigo', targets: [{ skill: 'Perceber' }], value: -2, when: 'rolagem de Noção do Perigo' },
  { edge: 'Linguista', targets: [{ attribute: 'Astúcia' }], value: -2, when: 'entendendo idioma desconhecido' },
  { edge: 'Coragem Líquida', targets: [{ linked: 'Astúcia' }, { linked: 'Agilidade' }], value: -2, when: 'bebendo para se embriagar' },
];

export const HINDRANCE_ROLL_EFFECTS = [
  { hindrance: 'Desajeitado', targets: [{ skill: 'Consertar' }], value: -2 },
  { hindrance: 'Sem Noção', targets: [{ skill: 'Conhecimento' }], value: -2 },
  { hindrance: 'Um Braço Só', targets: [{ skill: 'Escalar' }], value: -4 },
  { hindrance: 'Um Braço Só', targets: 'any', except: [{ skill: 'Escalar' }], value: -4, when: 'tarefa que exige as duas mãos' },
  { hindrance: 'Um Olho Só', targets: [{ skill: 'Atirar' }, { skill: 'Arremessar' }], value: -2 },
  { hindrance: 'Um Olho Só', targets: 'any', except: [{ skill: 'Atirar' }, { skill: 'Arremessar' }], value: -2, when: 'exige percepção de profundidade' },
  { hindrance: 'Uma Perna Só', targets: [{ skill: 'Escalar' }, { skill: 'Lutar' }, { skill: 'Nadar' }], value: -2 },
  { hindrance: 'Uma Perna Só', targets: 'any', except: [{ skill: 'Escalar' }, { skill: 'Lutar' }, { skill: 'Nadar' }], value: -2, when: 'exige mobilidade' },
  { hindrance: 'Duro De Ouvido', severity: 'Menor', targets: [{ skill: 'Perceber' }], value: -2, when: 'para ouvir' },
  { hindrance: 'Cego', targets: 'any', value: -6, when: 'tarefa física que depende da visão' },
  { hindrance: 'Cego', targets: [...PERSUADE, { skill: 'Intimidar' }, { skill: 'Provocar' }], value: -2, when: 'tarefa social' },
  { hindrance: 'Covarde', targets: [{ attribute: 'Espírito' }], value: -2, when: 'teste de Medo' },
  { hindrance: 'São Tomé', targets: [{ attribute: 'Espírito' }], value: -2, when: 'Medo diante do sobrenatural' },
  { hindrance: 'Fobia', targets: 'any', value: { Menor: -2, Maior: -4 }, when: 'na presença da fobia' },
  { hindrance: 'Olhos Ruins', targets: [{ skill: 'Atirar' }, { skill: 'Arremessar' }, { skill: 'Perceber' }], value: -2, when: 'sem óculos, alvo a 5 quadros ou mais' },
  { hindrance: 'Anêmico', targets: [{ attribute: 'Vigor' }], value: -2, when: 'teste de Fadiga' },
  // Carisma
  { hindrance: 'Desagradável', targets: PERSUADE, value: -2, charisma: true },
  { hindrance: 'Feio', targets: PERSUADE, value: -2, charisma: true },
  { hindrance: 'Hábito', severity: 'Menor', targets: PERSUADE, value: -1, charisma: true },
  { hindrance: 'Forasteiro', targets: PERSUADE, value: -2, charisma: true, when: 'fora do seu povo' },
  { hindrance: 'Sanguinário', targets: PERSUADE, value: -4, charisma: true, when: 'se os hábitos cruéis forem conhecidos' },
  { hindrance: 'Um Olho Só', targets: PERSUADE, value: -1, charisma: true, when: 'sem tapa-olho' },
];

const norm = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const same = (t, kind, name) => (t.skill ? kind === 'skill' && t.skill === name : t.attribute ? kind === 'attribute' && t.attribute === name : false);

// attrOf(nome da perícia) → atributo ligado a ela (perícias do livro e personalizadas).
function hits(fx, kind, name, attrOf) {
  const t = fx.targets;
  const linked = x => x.linked && (kind === 'attribute' ? name === x.linked : attrOf?.(name) === x.linked);
  const hit = t === 'any' || t.some(x => same(x, kind, name) || linked(x));
  return hit && !(fx.except || []).some(x => same(x, kind, name));
}

function collect(table, ownerKey, owns, tag, kind, name, attrOf) {
  const always = [];
  const optional = [];
  table.forEach((fx, index) => {
    const owned = fx[ownerKey];
    const severities = owns(owned);
    if (!severities || !hits(fx, kind, name, attrOf)) return;
    if (fx.severity && !severities.has(fx.severity)) return;
    if (fx.supersededBy && owns(fx.supersededBy)) return;
    let value = fx.value;
    let suffix = '';
    if (typeof value === 'object') value = severities.has('Maior') ? value.Maior : value.Menor;
    if (fx.upgrade && owns(fx.upgrade[0])) { value = fx.upgrade[1]; suffix = ' Aprimorada'; }
    const base = `${tag} ${owned}${suffix}`;
    const label = fx.charisma ? `Carisma (${base})` : base;
    if (fx.when) optional.push({ id: `${tag}:${index}`, label: `${label} (${fx.when})`, value, source: tag === 'Vantagem' ? 'edge' : 'hindrance' });
    else always.push({ label, value, source: tag === 'Vantagem' ? 'edge' : 'hindrance' });
  });
  return { always, optional };
}

// Bônus das vantagens da ficha para um atributo (kind 'attribute') ou perícia (kind 'skill').
// A mesma vantagem repetida na ficha conta uma vez só. Devolve { always, optional } no formato de sheetRoll.
export function edgeParts(advantages, kind, name, attrOf) {
  const owned = new Set((advantages || []).map(a => norm(a.name)));
  const owns = n => (owned.has(norm(n)) ? new Set(['Menor']) : null);
  return collect(EDGE_ROLL_EFFECTS, 'edge', owns, 'Vantagem', kind, name, attrOf);
}

// Penalidades (e o Carisma) das complicações da ficha. Complicação repetida conta uma vez; a gravidade vale a maior.
export function hindranceParts(hindrances, kind, name, attrOf) {
  const owned = new Map();
  for (const h of hindrances || []) {
    const key = norm(h.name);
    if (!owned.has(key)) owned.set(key, new Set());
    owned.get(key).add(h.severity === 'Maior' ? 'Maior' : 'Menor');
  }
  return collect(HINDRANCE_ROLL_EFFECTS, 'hindrance', n => owned.get(norm(n)) || null, 'Complicação', kind, name, attrOf);
}
