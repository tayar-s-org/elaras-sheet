// Apresentação: transforma o que foi recuperado do livro em blocos de resposta (texto, fatos, citação, lista) com a página de origem.
import { fold, tokens, sentences, leadSentences } from './text.js';
import { printedPage, titleCase } from './knowledge.js';
import { bold, src, text, facts, quote, list, chip, stripBullet, DICE, lead, fullText } from './blocks.js';
import { ASK_WORDS } from './interpretation.js';

const STAGES = ['Novato', 'Experiente', 'Veterano', 'Heroico', 'Lendário'];

// ───────────── respostas por tipo ─────────────
function powerAnswer(p, intent) {
  const source = [src(p.page, p.name)];
  const row = (label, value) => `${bold(p.name)}: ${label} ${bold(value)}.`;
  const diceSentences = sentences(`${p.body.join(' ')} ${p.extras.map(stripBullet).join(' ')}`).filter(s => /\d+d\d+/i.test(s));
  switch (intent) {
    case 'stage': return { blocks: [text(`${bold(p.name)} é um poder de estágio ${bold(p.stage)}.`)], source };
    case 'cost_pp': case 'price': {
      const plain = /^\d+$/.test(p.cost);
      return { blocks: [text(plain ? `${bold(p.name)} custa ${bold(`${p.cost} ${Number(p.cost) === 1 ? 'Ponto' : 'Pontos'} de Poder`)}.` : `O custo de ${bold(p.name)} em Pontos de Poder é ${bold(p.cost)}.`)], source };
    }
    case 'range': return { blocks: [text(`A distância de ${bold(p.name)} é ${bold(p.range)}.`)], source };
    case 'duration': return { blocks: [text(`A duração de ${bold(p.name)} é ${bold(p.duration)}.`)], source };
    case 'damage': {
      if (!diceSentences.length) return { blocks: [text(`O livro não indica dano para ${bold(p.name)}.`), quote(leadSentences(p.body[0] || '', 260), { label: `${p.name}, pág. ${printedPage(p.page)}` })], source };
      const first = (diceSentences[0].match(DICE) || [])[0];
      return { blocks: [text(`O dano de ${bold(p.name)} é ${bold(first.replace(/\s+/g, ''))}.`), quote(diceSentences.slice(0, 2).join(' '), { label: `${p.name}, pág. ${printedPage(p.page)}` })], source };
    }
    default: {
      const body = lead(p.body, 430);
      return { blocks: [text(`${bold(p.name)} é um poder de estágio ${bold(p.stage)}.`), facts([['Estágio', p.stage], ['Pontos de Poder', p.cost], ['Distância', p.range], ['Duração', p.duration]]), quote(body, { label: `${p.name}, pág. ${printedPage(p.page)}`, full: fullText([...p.body, ...p.extras]) })], source };
    }
  }
}

const STAGE_RE = /^(novato|experiente|veterano|heroico|lendario)/;
function edgeAnswer(e, intent) {
  const source = [src(e.page, e.name)];
  const kind = e.type === 'edge' ? 'vantagem' : 'complicação';
  const rank = e.requirements ? e.requirements.split(',').map(s => s.trim()).find(s => STAGE_RE.test(fold(s))) : '';
  if (intent === 'requirements' || (intent === 'stage' && e.type === 'edge')) {
    if (e.type === 'hindrance') return { blocks: [text(`${bold(e.name)} é uma complicação, não tem requisitos. ${severity(e)}`.trim())], source };
    return { blocks: [text(`Requisitos de ${bold(e.name)}: ${bold(e.requirements || 'nenhum requisito listado')}.`)], source };
  }
  const head = e.type === 'edge'
    ? `${bold(e.name)} é uma vantagem${e.category ? ` de ${fold(e.category) === 'lendarias' ? 'estágio lendário' : e.category.toLowerCase()}` : ''}${e.requirements ? `, com requisitos: ${e.requirements}` : ''}.`
    : `${bold(e.name)} é uma ${kind}. ${severity(e)}`.trim();
  return { blocks: [text(head), quote(lead(e.paras, 520), { label: `${e.name}, pág. ${printedPage(e.page)}`, full: fullText(e.paras) })], source };
}
const severity = e => (e.severities?.length ? `Pode ser ${e.severities.map(s => s.toLowerCase()).join(' ou ')}.` : '');

function skillAnswer(s, intent) {
  const source = [src(s.page, s.name)];
  if (intent === 'attribute') return { blocks: [text(`${bold(s.name)} é ligada ao atributo ${bold(s.attribute)}.`)], source };
  return { blocks: [text(`${bold(s.name)} é uma perícia ligada a ${bold(s.attribute)}.`), quote(lead(s.paras, 520), { label: `${s.name}, pág. ${printedPage(s.page)}`, full: fullText(s.paras.slice(0, 6)) })], source };
}

function raceAnswer(r) {
  return { blocks: [quote(lead(r.paras, 620), { label: `${r.name}, pág. ${printedPage(r.page)}`, full: fullText(r.paras) })], source: [src(r.page, r.name)] };
}

function creatureAnswer(c, intent) {
  const source = [src(c.page, c.name)];
  const one = (label, value) => ({ blocks: [text(`${label} de ${bold(c.name)}: ${bold(value)}.`)], source });
  if (intent === 'toughness' && c.toughness) return one('A Resistência', c.toughness);
  if (intent === 'parry' && c.parry) return one('O Aparar', c.parry);
  if (intent === 'pace' && c.pace) return one('A Movimentação', c.pace);
  if (intent === 'attributes' && c.attributes) return one('Os atributos', c.attributes);
  if (intent === 'skills' && c.skills) return one('As perícias', c.skills);
  if (intent === 'size') {
    const size = c.abilities.map(stripBullet).find(a => /^Tamanho/.test(a));
    if (size) return { blocks: [text(`${bold(c.name)} tem ${bold(size.split(':')[0].toLowerCase())}.`), quote(size, { label: `${c.name}, pág. ${printedPage(c.page)}` })], source };
  }
  if (intent === 'damage') {
    const hit = c.abilities.map(stripBullet).filter(a => /For[+]d\d+|\d+d\d+/.test(a));
    if (hit.length) return { blocks: [text(`Ataques de ${bold(c.name)}:`), quote(hit.slice(0, 4).join('\n'), { label: `${c.name}, pág. ${printedPage(c.page)}` })], source };
  }
  return { blocks: [facts([['Atributos', c.attributes], ['Perícias', c.skills], ['Aparar', c.parry], ['Movimentação', c.pace], ['Resistência', c.toughness], ['Equipamento', c.gear]]),
    quote(lead([c.paras.find(p => !p.startsWith('•')) || ''].filter(Boolean), 360) || '', { label: `${c.name}, pág. ${printedPage(c.page)}`, full: fullText(c.paras) })].filter(b => b.type !== 'quote' || b.text), source };
}

const KIND = { melee: 'corpo a corpo', ranged: 'à distância', armor: 'proteção' };
function gearAnswer(group, intent) {
  const source = [...new Map(group.map(g => [g.page, src(g.page, g.name)])).values()];
  const name = group[0].name;
  const label = g => (group.length > 1 && g.kind in KIND ? ` (${KIND[g.kind]})` : '');
  const rows = (pick, fmt) => group.filter(pick).map(g => `${fmt(g)}${label(g)}`);
  const out = [];
  const say = (prefix, items) => { if (items.length) out.push(text(`${prefix} ${items.join('; ')}.`)); };
  switch (intent) {
    case 'damage': say(`O dano de ${bold(name)} é`, rows(g => g.damage, g => bold(g.damage))); break;
    case 'price': say(`${bold(name)} custa`, rows(g => g.cost, g => bold(g.cost))); break;
    case 'weight': say(`${bold(name)} pesa`, rows(g => g.weight, g => bold(g.weight))); break;
    case 'range': say(`O alcance de ${bold(name)} é`, rows(g => g.range, g => `${bold(g.range)} (curto/médio/longo)`)); break;
    case 'armor': say(`${bold(name)} dá`, rows(g => g.armor && g.armor !== '–', g => `bônus de Armadura ${bold(g.armor)}`)); break;
    case 'shots': say(`${bold(name)}:`, rows(g => g.rof, g => `Cadência de Tiro ${bold(g.rof)}, ${g.shots === '–' ? 'sem limite de tiros listado' : `${bold(g.shots)} tiros`}`)); break;
    default: break;
  }
  if (out.length) return { blocks: out, source };
  // resposta completa: um cartão por linha da tabela
  const blocks = [];
  for (const g of group) {
    if (g.kind === 'raw') { blocks.push(text(`${bold(g.name)} — linha da tabela do livro:`), quote(g.raw, { label: `pág. ${printedPage(g.page)}` })); continue; }
    const armor = g.armor && g.armor !== '–' ? g.armor : '';
    const shots = g.shots && g.shots !== '–' ? g.shots : '';
    blocks.push(facts([['Item', `${g.name}${label(g)}`], ['Dano', g.damage], ['Bônus de Armadura', armor], ['Alcance', g.range], ['Cadência de Tiro', g.rof], ['Tiros', shots], ['Peso', g.weight], ['Custo', g.cost], ['Observações', (g.notes || '').replace(/^[–-]$/, '').trim()]]));
  }
  return { blocks, source };
}

export function entityAnswer(group, intent) {
  // vários itens com o mesmo apelido (ex.: "tubarão", "cavalo"): responde um por um
  if (group.length > 1 && group[0].type !== 'gear') {
    const parts = group.slice(0, 3).map(e => entityAnswer([e], intent));
    return { blocks: parts.flatMap((p, i) => (i ? [text('—')] : []).concat(p.blocks)), source: [...new Map(parts.flatMap(p => p.source).map(s => [s.page, s])).values()], entity: parts[0].entity };
  }
  const e = group[0];
  let res;
  switch (e.type) {
    case 'power': res = powerAnswer(e, intent); break;
    case 'edge': case 'hindrance': res = edgeAnswer(e, intent); break;
    case 'skill': res = skillAnswer(e, intent); break;
    case 'race': res = raceAnswer(e); break;
    case 'creature': res = creatureAnswer(e, intent); break;
    default: res = gearAnswer(group, intent);
  }
  return { ...res, entity: e };
}

// Sugestões do próximo passo da "árvore" depois de uma resposta sobre um item.
export function followUps(e, intent) {
  const n = e.name;
  const not = i => i !== intent;
  const c = [];
  if (e.type === 'power') {
    if (not('damage')) c.push(chip('Dano', `Qual o dano de ${n}?`));
    if (not('cost_pp')) c.push(chip('Custo', `Quanto custa ${n} em Pontos de Poder?`));
    if (not('range')) c.push(chip('Distância', `Qual a distância de ${n}?`));
    if (not('duration')) c.push(chip('Duração', `Qual a duração de ${n}?`));
    if (intent && intent !== 'effect') c.unshift(chip('Como funciona', `Como funciona ${n}?`));
    c.push(chip(`Poderes ${e.stage}`, `Quais poderes são do estágio ${e.stage}?`));
  } else if (e.type === 'edge') {
    if (not('requirements')) c.push(chip('Requisitos', `Quais os requisitos de ${n}?`));
    if (intent && intent !== 'effect') c.unshift(chip('O que faz', `O que faz ${n}?`));
    if (e.category) c.push(chip(`Vantagens de ${e.category.toLowerCase()}`, `Quais vantagens de ${e.category.toLowerCase()} existem?`));
  } else if (e.type === 'hindrance') {
    c.push(chip('Complicações menores', 'Quais complicações menores existem?'), chip('Complicações maiores', 'Quais complicações maiores existem?'), chip('Todas as complicações', 'Quais complicações existem?'));
  } else if (e.type === 'skill') {
    if (intent && intent !== 'effect') c.unshift(chip('Como funciona', `Como funciona a perícia ${n}?`));
    if (not('attribute')) c.push(chip('Atributo', `Qual atributo de ${n}?`));
    c.push(chip(`Perícias de ${e.attribute}`, `Quais perícias usam ${e.attribute}?`), chip('Todas as perícias', 'Quais perícias existem?'));
  } else if (e.type === 'creature') {
    if (not('toughness')) c.push(chip('Resistência', `Qual a Resistência de ${n}?`));
    if (not('attributes')) c.push(chip('Atributos', `Quais os atributos de ${n}?`));
    if (not('damage')) c.push(chip('Ataques', `Qual o dano de ${n}?`));
  } else if (e.type === 'gear') {
    if (not('damage') && e.damage) c.push(chip('Dano', `Qual o dano de ${n}?`));
    if (not('price')) c.push(chip('Preço', `Quanto custa ${n}?`));
    if (not('weight')) c.push(chip('Peso', `Quanto pesa ${n}?`));
    if (e.kind === 'armor' && not('armor')) c.push(chip('Armadura', `Quanto de armadura dá ${n}?`));
  }
  return c.slice(0, 5);
}

// ───────────── listas ─────────────
export function listAnswer(kb, a) {
  const f = a.folded;
  const stage = STAGES.find(s => f.includes(fold(s)));
  const asksList = /\b(quais|liste|listar|lista|todos|todas|existem|existe)\b/.test(f) || (stage && /\b(poderes|magias|feiticos)\b/.test(f));
  if (!asksList) return null;
  if (a.hint === 'gear' && /\b(armas?|armaduras?|escudos?)\b/.test(f)) {
    const wantsArmor = /\b(armaduras?|escudos?)\b/.test(f);
    const wantsMelee = /corpo a corpo|brancas?/.test(f), wantsRanged = /dist[aâ]ncia|fogo|pistolas?|rifles?/.test(f);
    const kinds = wantsArmor ? ['armor'] : wantsMelee ? ['melee'] : wantsRanged ? ['ranged'] : ['melee', 'ranged'];
    const items = kb.byType('gear').filter(g => kinds.includes(g.kind));
    const names = [...new Map(items.map(g => [g.name, g])).values()];
    const noun = wantsArmor ? 'Armaduras e escudos' : wantsMelee ? 'Armas corpo a corpo' : wantsRanged ? 'Armas à distância' : 'Armas';
    return { blocks: [text(`${noun} das tabelas de equipamento (${names.length}):`), list(names.map(g => chip(g.name, wantsArmor ? `Quanto de armadura dá ${g.name}?` : `Qual o dano de ${g.name}?`)))], source: [src(70, 'Equipamento')], chips: wantsArmor ? [] : [chip('Armas corpo a corpo', 'Quais armas corpo a corpo existem?'), chip('Armas à distância', 'Quais armas à distância existem?'), chip('Armaduras', 'Quais armaduras existem?')] };
  }
  if (a.hint === 'power' || /\b(poderes|magias|feiticos)\b/.test(f)) {
    const pw = kb.byType('power').filter(p => !stage || fold(p.stage) === fold(stage));
    return { blocks: [text(`${stage ? `Poderes do estágio ${bold(stage)}` : 'Poderes do livro'} (${pw.length}):`), list(pw.map(p => chip(p.name, `Como funciona ${p.name}?`)))], source: [src(153, 'Poderes')], chips: stage ? [] : STAGES.map(s => chip(s, `Quais poderes são do estágio ${s}?`)) };
  }
  if (a.hint === 'hindrance') {
    const minor = /\bmenor/.test(f), major = /\bmaior/.test(f);
    const hs = kb.byType('hindrance').filter(h => (!minor && !major) || h.severities.some(s => (minor && fold(s) === 'menor') || (major && fold(s) === 'maior')));
    return { blocks: [text(`Complicações${minor ? ' menores' : major ? ' maiores' : ''} do livro (${hs.length}):`), list(hs.map(h => chip(h.name, `O que faz a complicação ${h.name}?`)))], source: [src(33, 'Complicações')] };
  }
  if (a.hint === 'edge' || /\bvantagens\b/.test(f)) {
    const cats = [...new Set(kb.byType('edge').map(e => e.category))];
    const cat = cats.find(c => c && f.includes(fold(c).replace(/s$/, '').replace(/ais$/, 'al'))) || cats.find(c => c && f.includes(fold(c)));
    const es = kb.byType('edge').filter(e => !cat || e.category === cat);
    return { blocks: [text(`${cat ? `Vantagens de ${bold(cat.toLowerCase())}` : 'Vantagens do livro'} (${es.length}):`), list(es.map(e => chip(e.name, `O que faz a vantagem ${e.name}?`)))], source: [src(39, 'Vantagens')], chips: cat ? [] : cats.filter(Boolean).map(c => chip(c, `Quais vantagens de ${c.toLowerCase()} existem?`)) };
  }
  if (a.hint === 'skill' || /\bpericias\b/.test(f)) {
    const attr = ['Agilidade', 'Astúcia', 'Espírito', 'Força', 'Vigor'].find(x => f.includes(fold(x)));
    const ss = kb.byType('skill').filter(s => !attr || s.attribute === attr);
    return { blocks: [text(`${attr ? `Perícias ligadas a ${bold(attr)}` : 'Perícias do livro'} (${ss.length}):`), list(ss.map(s => chip(s.name, `Como funciona a perícia ${s.name}?`)))], source: [src(27, 'Perícias')] };
  }
  if (a.hint === 'race') {
    const rs = kb.byType('race').filter(r => !/criando/i.test(r.name));
    return { blocks: [text(`Raças de exemplo do livro (${rs.length}):`), list(rs.map(r => chip(r.name, `Fale sobre a raça ${r.name}`)))], source: [src(22, 'Raças')] };
  }
  if (a.hint === 'creature') {
    const cs = kb.byType('creature');
    return { blocks: [text(`Criaturas do bestiário (${cs.length}):`), list(cs.map(c => chip(c.name, `Quais os atributos de ${c.name}?`)))], source: [src(190, 'Bestiário')] };
  }
  return null;
}

// ───────────── várias respostas de uma vez ─────────────
const MAX_ANSWERED_GROUPS = 3;
export function entitiesReply(groups, intent) {
  const answers = groups.slice(0, MAX_ANSWERED_GROUPS).map(g => entityAnswer(g, intent));
  const first = answers[0].entity;
  return { kind: 'entity', blocks: answers.flatMap((r, i) => (i ? [text('—')] : []).concat(r.blocks)), source: [...new Map(answers.flatMap(r => r.source).map(s => [`${s.page}`, s])).values()], entity: first, intent, chips: followUps(first, intent) };
}

// ───────────── trechos do livro ─────────────
// Pergunta só sobre o assunto ("o que é X?") mostra o começo do trecho; pergunta com detalhes ("quantos pontos de perícia começo?")
// começa pelo parágrafo que mais combina com as palavras extras.
function startingParagraph(paras, extra) {
  if (!extra.length) return 0;
  let start = 0;
  let best = 0;
  paras.forEach((p, i) => { const ts = new Set(tokens(p)); const s = extra.filter(t => ts.has(t)).length; if (s > best) { best = s; start = i; } });
  return start;
}

const RELATED_PASSAGES = 3;
const sectionChip = r => chip(titleCase(r.chunk.title), `O que o livro diz sobre ${titleCase(r.chunk.title)}?`);

export function passageAnswer(a, results) {
  const top = results[0];
  const c = top.chunk;
  const titleSet = new Set(c.titleTokens);
  const extra = a.expanded.filter(t => !titleSet.has(t) && !ASK_WORDS.has(t));
  const body = lead(c.paras.slice(startingParagraph(c.paras, extra)), 560);
  const label = c.term && c.parent ? `${titleCase(c.title)} — ${titleCase(c.parent)}` : titleCase(c.title);
  const intro = c.term ? `Sobre ${bold(titleCase(c.title))} o livro diz:` : `Segundo o livro, em ${bold(titleCase(c.title))}:`;
  const seen = new Set([fold(c.title)]);
  const related = results.slice(1).filter(r => r.score > top.score * 0.35 && !seen.has(fold(r.chunk.title)) && seen.add(fold(r.chunk.title))).slice(0, RELATED_PASSAGES);
  return { blocks: [text(intro), quote(body, { label: `${label}, pág. ${printedPage(c.page)}`, full: fullText(c.paras) })], source: [src(c.page, label)], chunk: c, chips: related.map(sectionChip) };
}

export const clarifyItemReply = () => ({ kind: 'clarify', blocks: [text('Sobre qual item? Diga o nome de um poder, arma, vantagem, perícia ou criatura — por exemplo, “qual a duração de Armadura?”.')], source: [] });

export const noAnswerReply = suggestions => ({ kind: 'none', blocks: [text(suggestions.length ? 'Não achei uma resposta direta para isso no livro. Estes trechos podem ajudar:' : 'Não achei isso no livro. Tente usar o nome de um poder, perícia, vantagem, arma ou regra — ou escolha um assunto abaixo.')], source: [], chips: suggestions.map(sectionChip) });
