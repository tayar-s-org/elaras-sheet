// Catálogo do mercado: equipamento do capítulo 2 do livro (páginas 70 a 79 do PDF).
// Itens "Militar" (sem preço) e veículos ficam de fora: não existem à venda no livro.

const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const CATEGORIES = [
  { id: 'armas-brancas', label: 'Armas brancas' },
  { id: 'armas-distancia', label: 'Armas de distância' },
  { id: 'armaduras', label: 'Armaduras e escudos' },
  { id: 'municao', label: 'Munição' },
  { id: 'aventura', label: 'Equipamento de aventura' },
  { id: 'roupas', label: 'Roupas' },
  { id: 'alimentacao', label: 'Alimentação' },
  { id: 'animais', label: 'Animais e arreios' },
  { id: 'vigilancia', label: 'Vigilância' },
  { id: 'computadores', label: 'Computadores' },
];

// Espaços de equipar: um item por espaço (equipar outro no mesmo espaço troca o anterior).
export const SLOTS = {
  melee: 'Arma corpo a corpo',
  ranged: 'Arma de distância',
  shield: 'Escudo',
  torso: 'Torso',
  head: 'Cabeça',
  arms: 'Braços',
  legs: 'Pernas',
  clothes: 'Roupa',
  boots: 'Calçado',
};

const items = [];
const add = item => items.push({ ...item, id: slug(`${item.category}-${item.group}-${item.name}`) });

// ---------- Armas brancas ----------
// [nome, dano, kg, custo, observações, bônus de Aparar]
const melee = (group, rows) => rows.forEach(([name, damage, weight, cost, notes = '', parry = 0]) =>
  add({ category: 'armas-brancas', group, name, damage, weight, cost, notes, page: 70, slot: 'melee', effects: parry ? { parry } : {} }));
melee('Medieval', [
  ['Adaga', 'For+d4', 0.5, 25],
  ['Espada Curta', 'For+d6', 2, 200, 'Inclui sabres de cavalaria'],
  ['Espada Larga', 'For+d10', 6, 400, 'Aparar −1, 2 mãos', -1],
  ['Espada Longa', 'For+d8', 4, 300, 'Inclui cimitarras'],
  ['Katana', 'For+d6+2', 3, 1000, 'PA 2'],
  ['Mangual', 'For+d6', 4, 200, 'Ignora a Defesa de escudos e bônus de Cobertura'],
  ['Rapieira', 'For+d4', 1.5, 150, 'Aparar +1', 1],
  ['Machado', 'For+d6', 1, 200],
  ['Machado de Batalha', 'For+d8', 5, 300],
  ['Machado Grande', 'For+d10', 7.5, 500, 'PA 1, Aparar −1, 2 mãos', -1],
  ['Maça', 'For+d8', 10, 400, 'PA 2 contra armaduras rígidas, Aparar −1, 2 mãos', -1],
  ['Martelo de Guerra', 'For+d6', 4, 250, 'PA 1 contra armaduras rígidas (cota de placas)'],
  ['Alabarda', 'For+d8', 7.5, 250, 'Alcance 1, 2 mãos'],
  ['Bastão', 'For+d4', 4, 10, 'Aparar +1, Alcance 1, 2 mãos', 1],
  ['Lança', 'For+d6', 2.5, 100, 'Aparar +1, Alcance 1, 2 mãos', 1],
  ['Lança de Cavalaria', 'For+d8', 5, 300, 'PA 2 quando investindo, Alcance 2, usada apenas em combate montado'],
  ['Pique', 'For+d8', 12.5, 400, 'Alcance 2, requer 2 mãos'],
]);
melee('Moderna', [
  ['Baioneta', 'For+d4', 0.5, 25, 'Fixada a um rifle aumenta o dano para For+d6, Aparar +1, Alcance 1, 2 mãos'],
  ['Bastão de Disparo', '3d6', 1, 5, 'Cartucho de espingarda usado em corpo a corpo; recarregar com novo cartucho (1 ação)'],
  ['Canivete', 'For+d4', 0.2, 10, '−2 para ser percebido se escondido'],
  ['Cassetete/Porrete', 'For+d4', 0.5, 10, 'Portado pela maioria dos oficiais da lei'],
  ['Faca de Sobrevivência', 'For+d4', 1, 50, 'Contém suprimentos: +1 em rolagens de Sobrevivência'],
  ['Motosserra', '2d6+4', 10, 200, 'Um 1 natural no dado de Lutar atinge o usuário'],
  ['Soqueiras', 'For+d4', 0.5, 20, 'Usuário é considerado Atacante Desarmado'],
]);
melee('Futurista', [
  ['Espada Laser', 'For+d6+8', 2.5, 1000, 'PA 12'],
  ['Espada Molecular', 'For+d8+2', 4, 500, 'PA 4'],
]);

// ---------- Armas de distância ----------
// [nome, distância, dano, CdT, tiros, kg, custo, Força mín., observações]
const ranged = (group, rows) => rows.forEach(([name, range, damage, rof, shots, weight, cost, minStr, notes = '']) =>
  add({ category: 'armas-distancia', group, name, range, damage, rof, shots, weight, cost, minStr, notes, page: 72, slot: 'ranged', effects: {} }));
ranged('Medieval', [
  ['Arco', '12/24/48', '2d6', '1', '–', 1.5, 250, 'd6'],
  ['Arco Longo Inglês', '15/30/60', '2d6', '1', '–', 2.5, 500, 'd8'],
  ['Besta', '15/30/60', '2d6', '1', '–', 5, 500, 'd6', 'PA 2, 1 ação para recarregar'],
  ['Faca/Adaga (arremesso)', '3/6/12', 'For+d4', '1', '–', 0.5, 25, '–'],
  ['Funda', '4/8/16', 'For+d4', '1', '–', 0.5, 10, '–'],
  ['Lança (arremesso)', '3/6/12', 'For+d6', '1', '–', 2.5, 100, 'd6'],
  ['Machado de Arremesso', '3/6/12', 'For+d6', '1', '–', 1, 75, '–'],
]);
ranged('Pólvora negra', [
  ['Brown Bess (.75)', '10/20/40', '2d8', '1', '–', 1.5, 300, 'd6', '2 ações para recarregar'],
  ['Pistola Flintlock (.60)', '5/10/20', '2d6+1', '1', '–', 2.5, 150, '–', '2 ações para recarregar'],
  ['Rifle do Kentucky (.45)', '15/30/60', '2d8', '1', '–', 5, 300, 'd6', 'PA 2, 3 ações para recarregar'],
  ['Springfield (.52)', '15/30/60', '2d8', '1', '–', 0.5, 250, 'd6', '2 ações para recarregar'],
  ['Bacamarte (8G)', '10/20/40', '1-3d6', '1', '–', 0.5, 300, 'd6', '1d6 à distância Longa, 2d6 à Média, 3d6 à Curta; 2 ações para recarregar'],
]);
ranged('Pistolas modernas', [
  ['Derringer (.44)', '5/10/20', '2d6+1', '1', '2', 1, 150, '–', 'PA 1'],
  ['Colt Dragoon (.44)', '12/24/48', '2d6+1', '1', '6', 2, 200, '–', 'Revólver'],
  ['Colt 1911 (.45)', '12/24/48', '2d6+1', '1', '7', 2, 200, '–', 'PA 1, Semi-Auto'],
  ['S&W (.44)', '12/24/48', '2d6+1', '1', '6', 2.5, 250, '–', 'PA 1, Auto'],
  ['Desert Eagle (.50)', '15/30/60', '2d8', '1', '7', 4, 300, '–', 'PA 2, Semi-Auto'],
  ['Glock (9mm)', '12/24/48', '2d6', '1', '17', 1.5, 200, '–', 'PA 1, Semi-Auto'],
  ['Peacemaker (.45)', '12/24/48', '2d6+1', '1', '6', 1.5, 200, '–', 'PA 1, Revólver'],
  ['Ruger (.22)', '10/20/40', '2d6+1', '1', '9', 1, 100, '–', 'Semi-Auto'],
  ['S&W (.357)', '12/24/48', '2d6+1', '1', '6', 2, 250, '–', 'PA 1, Revólver'],
]);
ranged('Submetralhadoras', [
  ['H&K MP5 (9mm)', '12/24/48', '2d6', '3', '30', 5, 300, '–', 'PA 1, Auto'],
  ['MP40 (9mm)', '12/24/48', '2d6', '3', '32', 5.5, 300, '–', 'PA 1, Auto'],
  ['Tommy Gun (.45)', '12/24/48', '2d6+1', '3', '50', 6.5, 350, '–', 'PA 1, Auto'],
  ['Uzi (9mm)', '12/24/48', '2d6', '3', '32', 4.5, 300, '–', 'PA 1, Auto'],
]);
ranged('Espingardas', [
  ['Cano-Duplo (12g)', '12/24/48', '1-3d6', '1-2', '2', 5.5, 150, '–', 'Veja as notas de espingardas'],
  ['Escopeta (12g)', '12/24/48', '1-3d6', '1', '6', 4, 350, '–', 'Veja as notas de espingardas'],
  ['Cano-Duplo Serrada (12g)', '5/10/20', '1-3d6', '1-2', '2', 3, 150, '–', 'Veja as notas de espingardas'],
  ['Streetsweeper (12g)', '12/24/48', '1-3d6', '1', '10', 5, 450, '–', 'Veja as notas de espingardas'],
]);
ranged('Rifles', [
  ['Barrett (.50)', '50/100/200', '2d10', '1', '11', 17.5, 750, 'd8', 'PA 4, Tiro Rápido, AP'],
  ['M1 (.30)', '24/48/96', '2d8', '1', '8', 5, 300, 'd6', 'PA 2, Semi-Auto'],
  ['Kar98 (7.92)', '24/48/96', '2d8', '1', '5', 4.5, 300, 'd6', 'PA 2'],
  ['Sharps Big 50 (.50)', '30/60/120', '2d10', '1', '1', 5.5, 400, 'd8', 'PA 4, Tiro Rápido'],
  ['Carabina Spencer (.52)', '20/40/80', '2d8', '1', '7', 4, 250, '–', 'PA 2'],
  ['Winchester ’76 (.45 a .47)', '24/48/96', '2d8', '1', '15', 5, 300, 'd6', 'PA 2'],
]);
ranged('Rifles de assalto', [
  ['AK47 (7.62)', '24/48/96', '2d8+1', '3', '30', 5, 450, 'd6', 'PA 2, Auto'],
  ['H&K G3 (.308)', '24/48/96', '2d8', '3', '20', 5, 400, 'd6', 'PA 2, Auto'],
  ['M-16 (5.56)', '24/48/96', '2d8', '3', '20/30', 4, 400, '–', 'PA 2, Auto, R3B'],
  ['Steyer AUG (5.56)', '24/48/96', '2d8', '3', '30', 4, 400, '–', 'PA 2, Auto, R3B'],
]);
ranged('Metralhadoras', [
  ['Gatling (.45)', '24/48/96', '2d8', '3', '100', 20, 500, '–', 'PA 2, Pode não se mover'],
  ['M2 Browning (.50)', '50/100/200', '2d10', '3', '200', 42, 1000, '–', 'PA 4, AP, Auto, Pode não se mover'],
  ['M1919 (.30)', '24/48/96', '2d8', '3', '250', 16, 750, '–', 'PA 2, Pode não se mover'],
  ['M60 (7.62)', '30/60/120', '2d8+1', '3', '250', 16.5, 1000, 'd8', 'PA 2, Tiro Rápido'],
  ['Metralhadora 7.7 (Japonesa)', '30/60/120', '2d8', '3', '250', 15, 1000, '–', 'PA 2, Auto, Tiro Rápido'],
  ['MG34 (7.92)', '30/60/120', '2d8+1', '3', '200', 13, 500, 'd8', 'PA 2, Tiro Rápido'],
  ['MG42 (7.92)', '30/60/120', '2d8+1', '4', '200', 13, 500, 'd8', 'PA 2, Tiro Rápido'],
  ['SAW (5.56)', '30/60/120', '2d8', '4', '200', 10, 750, 'd8', 'PA 2, Tiro Rápido'],
  ['Metralhadora Besa (7.92)', '40/80/160', '2d8', '3', '50', 27, 1000, '–', 'PA 2, Auto, Pode não se mover'],
  ['Metralhadora DT (7.62)', '30/60/120', '2d8+1', '3', '60', 13, 1000, '–', 'PA 2, Auto, Pode não se mover'],
  ['Metralhadora de 14.5mm', '50/100/200', '3d6', '3', '100', 15, 5000, '–', 'PA 2, Auto, Pode não se mover'],
]);
ranged('Futuristas', [
  ['Metralhadora Laser', '50/100/200', '1-3d6', '5', '–', 7.5, 500, 'd8', 'Auto'],
  ['Pistola laser', '15/30/60', '1-3d6', '1', '–', 2, 200, '–', 'Semi-Auto'],
  ['Rifle laser', '30/60/120', '1-3d6', '3', '–', 4, 300, 'd6', 'Auto, R3B'],
]);

// ---------- Armaduras e escudos ----------
// [nome, bônus de armadura, kg, custo, espaço, observações]
const armor = (group, rows) => rows.forEach(([name, bonus, weight, cost, slot, notes = '']) =>
  add({ category: 'armaduras', group, name, armor: bonus, weight, cost, notes, page: 71, slot, effects: slot ? { armor: bonus } : {} }));
armor('Medieval', [
  ['Couro', 1, 7.5, 50, 'torso', 'Cobre o torso, braços e pernas'],
  ['Cota de Malha (Camisão)', 2, 12.5, 300, 'torso', 'Cobre o torso, braços e pernas'],
  ['Corselete de Placas', 3, 12.5, 400, 'torso', 'Cobre o torso'],
  ['Placas Braçais (manopla)', 3, 5, 200, 'arms', 'Cobre os braços'],
  ['Perneiras de Placas (grevas)', 3, 7.5, 300, 'legs', 'Cobre as pernas'],
  ['Meio Elmo', 3, 2, 75, 'head', '50% contra disparos na cabeça'],
]);
armor('Moderna', [
  ['Jaqueta', 2, 6, 80, 'torso', 'Cobre o torso. +4 contra projéteis'],
  ['Colete de Kevlar', 2, 4, 250, 'torso', 'Só o torso, nega PA 4. +4 contra projéteis'],
  ['Colete de Kevlar com Placas', 4, 6, 2500, 'torso', 'Como o kevlar, mas placas de cerâmica dão +8 contra projéteis'],
  ['Capacete de Motociclismo', 3, 3, 75, 'head', '50% de chance contra disparos na cabeça'],
  ['Capacete de Aço (elmo)', 4, 3, 80, 'head', '50% de chance contra disparos na cabeça'],
]);
armor('Futurista', [
  ['Colete Reflexivo', 0, 2.5, 200, null, '+10 de armadura, mas só contra lasers (não soma na Resistência)'],
]);
// Escudos: protegem contra ataques pela frente e pela esquerda (personagem destro).
[
  ['Broquel (escudo pequeno)', 1, 4, 25, 'Aparar +1'],
  ['Escudo Médio', 1, 6, 50, 'Aparar +1, Armadura +2 contra disparos à distância pelo lado protegido'],
  ['Escudo Grande (Pipa/Torre)', 2, 10, 200, 'Aparar +2, Armadura +2 contra disparos à distância pelo lado protegido'],
].forEach(([name, parry, weight, cost, notes]) =>
  add({ category: 'armaduras', group: 'Escudos', name, weight, cost, notes, page: 71, slot: 'shield', effects: { parry } }));

// ---------- Munição ----------
// Vendida em pacotes: o preço e o peso seguem a proporção da tabela do livro.
[
  ['Flechas (10)', 5, 1, 'Recuperáveis com 4-6 em 1d6'],
  ['Flechas Matadoras de Homens (10)', 10, 1, 'Dano +1, normalmente só em cenários Orientais'],
  ['Flechas de Teflon (10)', 50, 1, 'PA 2, apenas na era moderna'],
  ['Virotes (10)', 20, 1, 'PA 2 (munição padrão da besta); recuperáveis com 4-6 em 1d6'],
  ['Balas Pequenas (50)', 10, 1.5, 'Inclui armas de calibre .22 a .32'],
  ['Balas Médias (50)', 25, 2.5, 'Inclui de 9mm a .45'],
  ['Balas Grandes (50)', 50, 4, 'Inclui .50 e a maior parte das munições de rifle'],
  ['Bateria Laser', 25, 0.5, 'Carga completa para pistola, rifle ou metralhadora'],
  ['Projéteis com pólvora (10)', 3, 0.5, 'Para armas de pólvora negra'],
  ['Pedras de Funda (20)', 1, 1, 'Também podem ser achadas de graça com Perceber e 1d10 minutos'],
].forEach(([name, cost, weight, notes]) =>
  add({ category: 'municao', group: 'Munição', name, cost, weight, notes, page: 79 }));

// ---------- Itens mundanos ----------
const mundane = (category, group, page, rows) => rows.forEach(([name, cost, weight, notes = '', slot = null]) =>
  add({ category, group, name, cost, weight: weight || 0, notes, page, ...(slot ? { slot, effects: {} } : {}) }));
mundane('aventura', 'Equipamento de aventura', 78, [
  ['Algemas', 15, 1],
  ['Aljava (comporta 20 flechas/virotes)', 25, 1],
  ['Apito', 2, 0],
  ['Cama Dobrável (saco de dormir de inverno)', 25, 2],
  ['Câmera (descartável)', 10, 0.5],
  ['Câmera (comum)', 75, 1],
  ['Câmera (digital)', 300, 0.5],
  ['Cantil (odre)', 5, 0.5],
  ['Cobertor', 10, 2],
  ['Corda (10″)', 10, 7.5],
  ['Frasco (cerâmico)', 5, 0.5],
  ['Gancho', 100, 1],
  ['Gazuas', 200, 0.5],
  ['Guarda-Chuva', 5, 1],
  ['Isqueiro', 2, 0],
  ['Óleo (para lamparina, 473ml)', 2, 0.5],
  ['Lamparina (luz num raio de 4″)', 25, 1.5],
  ['Lanterna (feixe de 10″)', 20, 1.5],
  ['Martelo', 10, 0.5],
  ['Mochila', 50, 1],
  ['Kit de Ferramentas', 200, 2.5],
  ['Pá', 5, 2.5],
  ['Pé-de-Cabra', 10, 1],
  ['Pederneira e Aço', 3, 0.5],
  ['Pedra de Amolar', 5, 0.5],
  ['Sabão', 1, 0.1],
  ['Vela (luz num raio de 2″)', 1, 0.5],
]);
mundane('animais', 'Animais e arreios', 78, [
  ['Cavalo', 300, 0, 'O preço depende do cenário; em campanhas de fantasia é cerca de $300'],
  ['Cavalo de Guerra', 750, 0],
  ['Sela', 10, 5],
  ['Sela trabalhada', 50, 5],
  ['Barda para Cavalo de Guerra (+3)', 1250, 15, 'Armadura do cavalo'],
]);
mundane('vigilancia', 'Vigilância', 78, [
  ['Detector de Transmissões', 525, 0.5],
  ['Grampo Telefônico (Besouro)', 250, 0],
  ['Interceptador de Celular', 650, 2.5],
  ['Microfone Parabólico (bom até 200 metros)', 750, 2],
  ['Óculos de Visão Noturna Passivos', 1000, 1.5, 'Sem penalidade por Penumbra e Escuridão'],
  ['Óculos de Visão Noturna Ativos', 2500, 2, 'Sem penalidade por qualquer nível de escuridão'],
  ['Telefone de Telefonista', 150, 1, 'Rolagem de Consertar para conectar em uma linha telefônica'],
  ['Telefone Celular', 100, 0],
]);
mundane('computadores', 'Computadores', 78, [
  ['Desktop', 800, 10],
  ['GPS', 250, 0.5],
  ['Laptop', 1200, 2.5],
  ['Portátil', 250, 0.5],
]);
mundane('alimentacao', 'Alimentação', 79, [
  ['Boa Refeição (restaurante)', 15, 0, 'Preço a partir de $15'],
  ['Rações de Viagem (5 refeições; dura 1 semana)', 10, 2.5],
  ['Refeição Fast Food', 5, 0.5],
  ['RPC (refeição pronta para comer)', 10, 0.5],
]);
mundane('roupas', 'Roupas', 79, [
  ['Botas de Caminhada', 100, 0, '', 'boots'],
  ['Botas de Inverno', 100, 0.5, '', 'boots'],
  ['Roupas Camufladas', 20, 0, '', 'clothes'],
  ['Equipamento de Inverno (capa/jaqueta)', 200, 1.5, '', 'clothes'],
  ['Roupas Formais', 200, 0, '', 'clothes'],
  ['Roupas Normais', 20, 0, '', 'clothes'],
]);

export const MARKET_ITEMS = items;
export const itemById = new Map(items.map(item => [item.id, item]));
export const equippable = item => Boolean(item.slot);

// Líquidos: o recipiente guarda só o volume (litros) de cada unidade (`fills`); o peso do líquido é calculado na hora
// (litros × densidade) e nunca entra no peso-base do item. Por ora só existe água, mas outro líquido cabe em LIQUIDS.
export const LIQUIDS = { agua: { name: 'Água', density: 1 } }; // densidade em kg por litro
export const FILL_STEP = 0.05;
export const LIQUID_CONTAINERS = { 'aventura-equipamento-de-aventura-cantil-odre': { capacity: 1, liquid: 'agua' } }; // litros por unidade
for (const [id, liquid] of Object.entries(LIQUID_CONTAINERS)) {
  const found = itemById.get(id);
  if (found) found.liquid = liquid;
}
export const liquidOf = item => item?.liquid || null;
// Volume válido: de 0 até a capacidade, em passos de 0,05 L.
export const roundFill = (value, capacity = 1) => {
  const steps = Math.round((Number(value) || 0) / FILL_STEP);
  return Math.min(capacity, Math.max(0, Math.round(steps * FILL_STEP * 100) / 100));
};

// Níveis das unidades de um recipiente: sempre um por unidade (completa com vazio ou corta o que sobra).
export function unitFills(entry, item = resolveItem(entry)) {
  const liquid = liquidOf(item);
  if (!liquid) return [];
  const qty = Math.max(0, Math.trunc(Number(entry?.qty)) || 0);
  const raw = Array.isArray(entry?.fills) ? entry.fills : [];
  return Array.from({ length: qty }, (_, i) => roundFill(raw[i], liquid.capacity));
}

// Peso da entrada da mochila: peso-base × unidades + líquido guardado (nunca altera o peso-base).
export function entryWeight(entry, item = resolveItem(entry)) {
  if (!item) return 0;
  const base = (item.weight || 0) * entry.qty;
  const liquid = liquidOf(item);
  if (!liquid) return base;
  const kg = unitFills(entry, item).reduce((sum, litres) => sum + litres, 0) * (LIQUIDS[liquid.liquid]?.density || 0);
  return Math.round((base + kg) * 1000) / 1000;
}

// Item de uma entrada da mochila: do catálogo do livro ou customizado (aprovado pelo mestre e guardado na ficha).
export function resolveItem(entry) {
  if (!entry) return null;
  if (entry.custom) {
    const c = entry.custom;
    return { id: entry.id, name: c.name, weight: c.weight, cost: 0, notes: c.description, damage: c.effects.find(e => e.kind === 'damage')?.target || '', customEffects: c.effects, isCustom: true, slot: 'custom', category: 'custom', group: 'Itens customizados' };
  }
  return itemById.get(entry.id) || null;
}

// Soma os efeitos dos itens equipados (a mochila inteira conta para o peso).
// Armadura soma por espaço (torso, cabeça, braços, pernas); Aparar soma arma e escudo.
// Itens customizados somam em armadura/Aparar/Movimento/Mana e dão bônus de rolagem a atributos e perícias.
export function inventoryEffects(inventory = [], strengthDie = 4) {
  let armor = 0, parry = 0, movement = 0, mana = 0, weight = 0;
  const rollBonus = { attribute: {}, skill: {} };
  for (const entry of inventory) {
    const item = resolveItem(entry);
    if (!item) continue;
    weight += entryWeight(entry, item);
    if (!entry.equipped) continue;
    if (item.effects) {
      armor += item.effects.armor || 0;
      parry += item.effects.parry || 0;
    }
    for (const e of item.customEffects || []) {
      if (e.kind === 'damage') continue; // dano da arma é só informativo
      if (e.kind === 'derived') {
        if (e.target === 'armor') armor += e.bonus;
        else if (e.target === 'parry') parry += e.bonus;
        else if (e.target === 'movement') movement += e.bonus;
        else if (e.target === 'mana') mana += e.bonus;
      } else {
        rollBonus[e.kind][e.target] = (rollBonus[e.kind][e.target] || 0) + e.bonus;
      }
    }
  }
  const capacity = 2.5 * strengthDie;
  const overload = weight > capacity ? Math.ceil((weight - capacity) / capacity) : 0;
  return { armor, parry, movement, mana, rollBonus, weight, capacity, overload };
}
