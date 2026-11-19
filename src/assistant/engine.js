// Motor de respostas do assistente. Não usa API nem IA generativa: entende a pergunta com regras (intenção + nome do item) e
// responde com dados e trechos tirados do livro, sempre citando a página. Se o livro não cobre, diz que não achou.
import { fold, words, tokens, stem, editDistance, leadSentences, sentences, STOP } from './text.js';
import { search, printedPage, titleCase } from './knowledge.js';

// ───────────────────────── vocabulário do jogador → vocabulário do livro ─────────────────────────
const SYNONYMS = {
  magia: ['poder'], feitico: ['poder'], spell: ['poder'], conjuracao: ['pericia', 'arcana'], conjurar: ['usar', 'poder'], lancar: ['usar', 'poder'], cast: ['usar', 'poder'], mana: ['ponto', 'poder'], pp: ['ponto', 'poder'],
  hp: ['ferimento'], vida: ['ferimento'], pv: ['ferimento'], morrer: ['incapacitado', 'ferimento'], morte: ['incapacitado', 'ferimento'], morre: ['incapacitado', 'ferimento'],
  nivel: ['progresso', 'estagio'], level: ['progresso', 'estagio'], lvl: ['progresso', 'estagio'], xp: ['progresso'], experiencia: ['progresso'], evoluir: ['progresso'], evolucao: ['progresso'], subir: ['progresso'],
  classe: ['arquetipo'], iniciativa: ['carta', 'acao'], sorte: ['bene'], benny: ['bene'], bennies: ['bene'],
  critico: ['as', 'ampliacao'], explodir: ['as'], explode: ['as'], defesa: ['aparar'], esquiva: ['aparar'], tiro: ['atirar'], disparo: ['atirar'],
  criar: ['criacao'], montar: ['criacao'], rolar: ['rolagem'], comeco: ['inicia', 'comecar'], comecar: ['inicia'], comeca: ['inicia'], inicio: ['inicia'], aumentar: ['progresso'], melhorar: ['progresso'], ganhar: ['progresso'], teste: ['rolagem', 'caracteristica'], dificuldade: ['dificuldade'], bonus: ['modificador'], penalidade: ['modificador'], rank: ['estagio'], raca: ['raca'],
  inimigo: ['extra'], monstro: ['criatura', 'bestiario'], bicho: ['criatura'], npc: ['extra'], boss: ['carta', 'selvagem'], vilao: ['carta', 'selvagem'],
};
// Palavras do jogador que são "o mesmo assunto" de um título do livro: se o trecho tem esse título, ganha um reforço
// ("xp" → Progresso). As outras só ampliam a busca.
const TITLE_SYNONYMS = new Set(['xp', 'experiencia', 'nivel', 'level', 'lvl', 'evoluir', 'evolucao', 'subir', 'classe', 'iniciativa', 'sorte', 'benny', 'bennies', 'aumentar', 'melhorar']);
const SKILL_ALIASES = { intimidar: 'intimidacao', persuadir: 'persuasao', natacao: 'nadar', percepcao: 'perceber', investigar: 'investigacao', sobreviver: 'sobrevivencia', furtivo: 'furtividade', esconder: 'furtividade', mentir: 'persuasao', lock: 'arrombar', lockpick: 'arrombar' };

// Palavras que só dizem "o que" se quer saber (dano, custo, duração…): não contam como assunto da pergunta.
const ASK_WORDS = new Set(['dano', 'custo', 'custa', 'preco', 'valor', 'distancia', 'alcance', 'duracao', 'dura', 'estagio', 'requisito', 'peso', 'pesa', 'atributo', 'efeito', 'regra', 'magia', 'poder', 'vantagem', 'complicacao', 'pericia', 'arma', 'armadura', 'bonus', 'item', 'quanto', 'faz', 'acontece'].map(w => stem(w)));
const OVERRIDE_SKIP = new Set([...ASK_WORDS, stem('ponto')]);

// ───────────────────────── intenções ─────────────────────────
const INTENTS = [
  ['damage', /\bdano\b|machuca|dado de dano|quanto de dano|bate quanto/],
  ['cost_pp', /\bpp\b|\bmana\b|(custo|custa|custam|gasta|gasto).*pontos? de poder|em pontos? de poder|pontos? de poder.*(custa|custo|gasta)/],
  ['price', /pre[cç]o|custa\b|custam|quanto custa|\bvalor\b|\bcusto\b|comprar|dinheiro|\bpagar|\bbarato|\bcaro\b/],
  ['range', /dist[aâ]ncia|alcance|\brange\b|ate onde|\blonge\b|alcanca/],
  ['duration', /dura[cç][aã]o|quanto tempo|\bdura\b|\bdure\b|duram/],
  ['stage', /est[aá]gio|\brank\b|\bnivel\b|em que (est|nivel)|quando (posso|consigo|pego|aprend)/],
  ['requirements', /requisito|preciso (ter|para|de)|o que (preciso|precisa|exige)|pre.?requisito|exige|para (pegar|escolher|ter)/],
  ['weight', /\bpeso\b|\bpesa\b|quilos?\b|\bkg\b|pesado/],
  ['attribute', /atributo|caracteristica (ligada|usada|associada)|qual (a )?caracteristica|ligad[ao] a|associad[ao]/],
  ['toughness', /resistencia|\bresiste\b|aguenta/],
  ['parry', /\baparar\b|\bdefesa\b/],
  ['pace', /moviment|\bmove\b|\bvelocidade\b|anda quanto|quantos metros anda/],
  ['skills', /pericias? d[oa]|que pericias/],
  ['attributes', /atributos d[oa]|quais atributos/],
  ['armor', /bonus de armadura|protecao|quanto de armadura|\bpa\b|penetra/],
  ['shots', /\btiros\b|municao|carregador|\bcdt\b|cadencia/],
  ['size', /\btamanho (d[oa]|dos|das)\b|qual (e )?o tamanho/],
  ['effect', /o que (e|eh|faz|sao|significa)\b|para que serve|como funciona|como (usar|uso|se usa)|\befeito|explica|significa|descri|\bregra|o que acontece/],
];
const detectIntent = folded => (INTENTS.find(([, re]) => re.test(folded)) || [null])[0];

const TYPE_HINTS = [
  ['power', /\b(poder|poderes|magia|magias|feitico|feiticos|spell|conjurar|conjuro|truque)\b/],
  ['edge', /\b(vantagem|vantagens|edge)\b/],
  ['hindrance', /\b(complicacao|complicacoes|desvantagem|defeito)\b/],
  ['skill', /\b(pericia|pericias|skill)\b/],
  ['gear', /\b(arma|armas|armadura|armaduras|escudo|equipamento|item|itens|comprar|preco|custa|peso|pesa|municao)\b/],
  ['creature', /\b(criatura|criaturas|monstro|monstros|bicho|bestiario|animal|animais)\b/],
  ['race', /\b(raca|racas)\b/],
];

const STAGES = ['Novato', 'Experiente', 'Veterano', 'Heroico', 'Lendário'];

// ───────────────────────── utilidades de resposta ─────────────────────────
const bold = text => `**${text}**`;
const src = (page, label) => ({ page, printed: printedPage(page), label });
const text = value => ({ type: 'text', text: value });
const facts = rows => ({ type: 'facts', rows: rows.filter(r => r[1]) });
const quote = (body, { label = '', full = '' } = {}) => ({ type: 'quote', text: body, label, full: full && full !== body ? full : '' });
const list = (items, title = '') => ({ type: 'list', title, items });
const chip = (label, question) => ({ label, question });
const stripBullet = p => p.replace(/^•\s*/, '');
const DICE = /\d+d\d+(?:\s*[+-]\s*\d+)?/gi;

function lead(paras, limit = 520) {
  const parts = [];
  let size = 0;
  for (const p of paras.map(stripBullet)) {
    if (size && size + p.length > limit) break;
    parts.push(p);
    size += p.length;
    if (size >= limit) break;
  }
  const joined = parts.join('\n\n');
  return joined.length > limit * 1.5 ? leadSentences(joined, limit) : joined;
}
const fullText = paras => paras.map(stripBullet).join('\n\n');

// ───────────────────────── motor ─────────────────────────
export function createAssistant(kb) {
  const known = kb.counts;
  const nameIndex = kb.entities.flatMap(e => e.forms.map(f => ({ e, tokens: f })));

  // Corrige erros de digitação trocando palavras que não existem no livro pela parecida do vocabulário de nomes e títulos.
  function correct(rawWords) {
    return rawWords.map(w => {
      if (w.length < 5 || known.has(w) || kb.vocabWords.has(w)) return w;
      const max = w.length >= 9 ? 2 : 1;
      let best = null;
      for (const cand of kb.vocabWords) {
        if (Math.abs(cand.length - w.length) > max) continue;
        const d = editDistance(w, cand, max);
        if (d <= max && (!best || d < best.d)) best = { cand, d };
      }
      return best ? best.cand : w;
    });
  }

  function analyse(question) {
    // "defesa" é o "Aparar" do livro (mas "Defesa Total" é uma regra à parte)
    const folded = fold(question).replace(/\bdefesa\b(?! total)/g, 'aparar');
    const rawWords = words(folded);
    const fixed = correct(rawWords);
    const aliased = fixed.map(w => SKILL_ALIASES[w] || w);
    const base = aliased.filter(w => !STOP.has(w)).map(stem);
    const extra = aliased.flatMap(w => SYNONYMS[w] || []).map(stem);
    const concepts = aliased.filter(w => TITLE_SYNONYMS.has(w)).flatMap(w => SYNONYMS[w]).map(stem);
    return { folded, rawWords, phrase: ` ${fixed.join(' ')} `, tokens: [...new Set(base)], expanded: [...new Set([...base, ...extra])], syn: [...new Set(concepts.filter(t => !base.includes(t)))], intent: detectIntent(folded), hint: (TYPE_HINTS.find(([, re]) => re.test(folded)) || [null])[0] };
  }

  // Quais itens do livro a pergunta cita pelo nome? Pega os maiores nomes primeiro e não repete as mesmas palavras.
  function findEntities(tok, hint, intent) {
    const have = new Set(tok);
    const candidates = [];
    for (const { e, tokens: t } of nameIndex) {
      if (!t.length || !t.every(x => have.has(x))) continue;
      candidates.push({ e, tokens: t, size: t.length, chars: t.join('').length });
    }
    candidates.sort((a, b) => b.size - a.size || b.chars - a.chars);
    const picked = [];
    const used = new Set();
    for (const c of candidates) {
      const sameName = picked.some(p => p.size === c.size && p.tokens.every(x => c.tokens.includes(x))); // mesmo nome em outro item (arma e arma de arremesso, família de criaturas)
      if (c.tokens.every(x => used.has(x)) && picked.length && !sameName) continue;
      if (picked.some(p => p.e.id === c.e.id)) continue;
      const overlapsBigger = picked.some(p => p.size > c.size && c.tokens.every(x => p.tokens.includes(x)));
      if (overlapsBigger) continue;
      picked.push(c);
      c.tokens.forEach(x => used.add(x));
    }
    // agrupa por nome (várias linhas de equipamento com o mesmo nome, ou poder e perícia com o mesmo nome)
    const groups = new Map();
    for (const c of picked) {
      const key = `${c.size}:${[...c.tokens].sort().join('-')}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c.e);
    }
    let out = [...groups.values()].map(es => pickType(es, hint, intent)).filter(g => g[0].key !== 'pontos de poder' || hint === 'edge');
    if (out.length > 1 && hint) { const only = out.filter(g => g[0].type === hint); if (only.length) out = only; }
    // "custo em Pontos de Poder" cita a vantagem "Pontos de Poder" sem querer
    if (out.length > 1 && intent === 'cost_pp') out = out.filter(g => g[0].key !== 'pontos de poder');
    return out;
  }

  // Quando o mesmo nome existe em tipos diferentes (ex.: "Lança" é arma corpo a corpo e de arremesso), usa a pista da pergunta.
  function pickType(entities, hint, intent) {
    const types = [...new Set(entities.map(e => e.type))];
    if (types.length === 1) return entities;
    const byIntent = { damage: ['power', 'gear', 'creature'], cost_pp: ['power'], stage: ['power', 'edge'], duration: ['power'], range: ['power', 'gear'], price: ['gear'], weight: ['gear'], requirements: ['edge'], attribute: ['skill'], toughness: ['creature'], parry: ['creature'], pace: ['creature'], attributes: ['creature'], skills: ['creature'], size: ['creature'] }[intent] || [];
    const order = [hint, ...byIntent, 'power', 'edge', 'hindrance', 'skill', 'creature', 'race', 'gear'].filter(Boolean);
    const winner = order.find(t => types.includes(t));
    return entities.filter(e => e.type === winner);
  }

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

  function entityAnswer(group, intent) {
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
  function followUps(e, intent) {
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
  function listAnswer(a) {
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

  // Um trecho do livro cujo título é exatamente o assunto da pergunta ("Cura Natural") vale mais que um item que só divide uma palavra ("Cura").
  function titleOverride(a, group) {
    const covered = new Set(group[0].forms.flat());
    const uncovered = a.tokens.filter(t => !covered.has(t) && !OVERRIDE_SKIP.has(t));
    if (!uncovered.length) return false;
    const top = search(kb, a.expanded, { limit: 1, phrase: a.phrase, boostTitle: a.syn })[0];
    if (!top || !top.chunk.titleTokens.length) return false;
    const ts = new Set(top.chunk.titleTokens);
    return [...ts].every(t => a.expanded.includes(t)) && uncovered.some(t => ts.has(t));
  }

  // ───────────── trechos do livro ─────────────
  function passageAnswer(a, ctx) {
    const qTokens = a.expanded;
    if (!qTokens.length) return null;
    const results = search(kb, qTokens, { limit: 8, phrase: a.phrase, boostTitle: a.syn });
    if (!results.length) return null;
    const top = results[0];
    const coverage = top.hits / qTokens.length;
    // Só responde com certeza quando o título inteiro está na pergunta, ou quando as palavras da pergunta batem bem com o trecho.
    const titleFull = top.chunk.titleTokens.length > 0 && top.titleHit === top.chunk.titleTokens.length;
    const confident = (titleFull && top.score > 3) || (coverage >= 0.6 && top.score > 4) || (coverage >= 0.5 && top.hits >= 2 && top.score > 4) || top.score > 14;
    if (!confident) return { weak: results };
    const c = top.chunk;
    const paras = c.paras;
    // Pergunta só sobre o assunto ("o que é X?") mostra o começo do trecho; pergunta com detalhes ("quantos pontos de perícia começo?")
    // começa pelo parágrafo que mais combina com as palavras extras.
    const titleSet = new Set(c.titleTokens);
    const extra = qTokens.filter(t => !titleSet.has(t) && !ASK_WORDS.has(t));
    let start = 0;
    if (extra.length) {
      let best = 0;
      paras.forEach((p, i) => { const ts = new Set(tokens(p)); const s = extra.filter(t => ts.has(t)).length; if (s > best) { best = s; start = i; } });
    }
    const slice = paras.slice(start);
    const body = lead(slice, 560);
    const label = c.term && c.parent ? `${titleCase(c.title)} — ${titleCase(c.parent)}` : titleCase(c.title);
    const intro = c.term ? `Sobre ${bold(titleCase(c.title))} o livro diz:` : `Segundo o livro, em ${bold(titleCase(c.title))}:`;
    const seen = new Set([fold(c.title)]);
    const related = results.slice(1).filter(r => r.score > top.score * 0.35 && !seen.has(fold(r.chunk.title)) && seen.add(fold(r.chunk.title))).slice(0, 3);
    return { blocks: [text(intro), quote(body, { label: `${label}, pág. ${printedPage(c.page)}`, full: fullText(c.paras) })], source: [src(c.page, label)], chunk: c, chips: related.map(r => chip(titleCase(r.chunk.title), `O que o livro diz sobre ${titleCase(r.chunk.title)}?`)) };
  }

  const GREET = /^(oi+|ola+|opa|e ai|eai|hey|salve|bom dia|boa tarde|boa noite|hello|hi)\b/;
  const THANKS = /^(obrigad[oa]|valeu|vlw|thanks|show|legal|top|beleza)\b/;
  const HELP = /^(ajuda|help|o que voce (sabe|faz)|quem e voce|quem (voce )?e|como (te |voce )?(uso|usar|funciona) (o |a )?(voce|bot|assistente|arquivista|chat))\b/;
  const NEEDS_BOOK_TEXT = new Set(['cost_pp', 'damage', 'range', 'duration']);
  const ITEM_INTENTS = new Set(['damage', 'cost_pp', 'price', 'range', 'duration', 'stage', 'requirements', 'weight', 'toughness', 'parry', 'pace', 'armor', 'shots']);

  // Pergunta principal. `ctx.last` é o último item de que falamos (para "e a duração?").
  function ask(question, ctx = {}) {
    const raw = String(question || '').trim();
    if (!raw) return null;
    const a = analyse(raw);
    if (GREET.test(a.folded) && a.rawWords.length <= 4) return { kind: 'greeting', blocks: [text('Olá! Pergunte sobre **poderes, perícias, vantagens, combate, equipamentos** ou **criaturas**. Eu só respondo com o que está escrito no livro, e sempre digo a página.')], source: [] };
    if (THANKS.test(a.folded) && a.rawWords.length <= 3) return { kind: 'thanks', blocks: [text('Por nada! Se precisar de outra regra, é só perguntar.')], source: [] };
    if (HELP.test(a.folded) && a.tokens.length <= 3) return { kind: 'help', blocks: [text('Eu sou o arquivista do livro. Posso dizer, por exemplo, **o dano da Espada Longa**, **o custo e a duração de um poder**, **os requisitos de uma vantagem**, **como funciona o combate**, **as estatísticas de uma criatura**. Tudo vem do livro, com a página de onde tirei.')], source: [] };

    const listed = listAnswer(a);
    if (listed) return { kind: 'list', ...listed };

    let groups = findEntities(a.tokens, a.hint, a.intent);
    if (groups.length && titleOverride(a, groups[0])) groups = [];
    // O nome do item pode conter a palavra da intenção ("Campo de Dano"): lê a intenção só do resto da pergunta.
    if (groups.length) {
      const names = groups.flatMap(g => [g[0].name, ...g[0].name.split('/')]).map(n => fold(n).replace(/\(.*?\)/g, ' ').trim()).filter(Boolean);
      const rest = names.reduce((f, n) => f.split(n).join(' '), a.folded);
      a.intent = detectIntent(rest);
    }
    // "e a duração?": sem item novo na pergunta, mas com um assunto anterior
    if (!groups.length && ctx.last && a.intent && a.tokens.every(t => OVERRIDE_SKIP.has(t))) {
      const prev = kb.entities.find(e => e.id === ctx.last);
      if (prev) groups = [kb.entities.filter(e => e.name === prev.name && e.type === prev.type)];
    }
    // Vantagem/complicação/perícia não têm custo, dano ou alcance próprios: a resposta está no texto do livro ("Pontos de Poder Iniciais: 10").
    if (groups.length === 1 && ['edge', 'hindrance', 'skill'].includes(groups[0][0].type) && NEEDS_BOOK_TEXT.has(a.intent)) {
      const viaText = passageAnswer(a, ctx);
      if (viaText && !viaText.weak) return { kind: 'passage', ...viaText };
    }
    if (!groups.length && ITEM_INTENTS.has(a.intent) && a.tokens.every(t => OVERRIDE_SKIP.has(t))) {
      // "O que são Estágios?" também cai aqui, mas é uma regra com título próprio no livro; só pergunta "sobre qual item?" se não houver.
      const named = passageAnswer(a, ctx);
      if (named && !named.weak && named.chunk.titleTokens.every(t => a.expanded.includes(t))) return { kind: 'passage', ...named };
      return { kind: 'clarify', blocks: [text('Sobre qual item? Diga o nome de um poder, arma, vantagem, perícia ou criatura — por exemplo, “qual a duração de Armadura?”.')], source: [] };
    }
    if (groups.length) {
      const answers = groups.slice(0, 3).map(g => entityAnswer(g, a.intent));
      const blocks = answers.flatMap((r, i) => (i ? [text('—')] : []).concat(r.blocks));
      const first = answers[0].entity;
      return { kind: 'entity', blocks, source: [...new Map(answers.flatMap(r => r.source).map(s => [`${s.page}`, s])).values()], entity: first, intent: a.intent, chips: followUps(first, a.intent) };
    }
    const passage = passageAnswer(a, ctx);
    if (passage && !passage.weak) return { kind: 'passage', ...passage };
    const seenTitles = new Set();
    const suggestions = (passage?.weak || search(kb, a.expanded, { limit: 8, phrase: a.phrase, boostTitle: a.syn })).filter(r => !seenTitles.has(fold(r.chunk.title)) && seenTitles.add(fold(r.chunk.title))).slice(0, 4);
    return { kind: 'none', blocks: [text(suggestions.length ? 'Não achei uma resposta direta para isso no livro. Estes trechos podem ajudar:' : 'Não achei isso no livro. Tente usar o nome de um poder, perícia, vantagem, arma ou regra — ou escolha um assunto abaixo.')], source: [], chips: suggestions.map(r => chip(titleCase(r.chunk.title), `O que o livro diz sobre ${titleCase(r.chunk.title)}?`)) };
  }

  return { ask, analyse, findEntities: (q) => { const a = analyse(q); return findEntities(a.tokens, a.hint, a.intent); } };
}

