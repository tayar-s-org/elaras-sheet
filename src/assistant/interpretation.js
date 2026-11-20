// Interpretação da pergunta: corrige digitação, traduz o vocabulário do jogador para o do livro e descobre a intenção
// (dano, custo, requisitos…) e o tipo de item de que se fala. Não consulta o livro além do vocabulário de nomes.
import { fold, words, stem, editDistance, STOP } from './text.js';

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
export const ASK_WORDS = new Set(['dano', 'custo', 'custa', 'preco', 'valor', 'distancia', 'alcance', 'duracao', 'dura', 'estagio', 'requisito', 'peso', 'pesa', 'atributo', 'efeito', 'regra', 'magia', 'poder', 'vantagem', 'complicacao', 'pericia', 'arma', 'armadura', 'bonus', 'item', 'quanto', 'faz', 'acontece'].map(w => stem(w)));
export const OVERRIDE_SKIP = new Set([...ASK_WORDS, stem('ponto')]);

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
export const detectIntent = folded => (INTENTS.find(([, re]) => re.test(folded)) || [null])[0];

const TYPE_HINTS = [
  ['power', /\b(poder|poderes|magia|magias|feitico|feiticos|spell|conjurar|conjuro|truque)\b/],
  ['edge', /\b(vantagem|vantagens|edge)\b/],
  ['hindrance', /\b(complicacao|complicacoes|desvantagem|defeito)\b/],
  ['skill', /\b(pericia|pericias|skill)\b/],
  ['gear', /\b(arma|armas|armadura|armaduras|escudo|equipamento|item|itens|comprar|preco|custa|peso|pesa|municao)\b/],
  ['creature', /\b(criatura|criaturas|monstro|monstros|bicho|bestiario|animal|animais)\b/],
  ['race', /\b(raca|racas)\b/],
];

// O nome do item pode conter a palavra da intenção ("Campo de Dano"): lê a intenção só do resto da pergunta.
export function intentBesideNames(folded, groups) {
  const names = groups.flatMap(g => [g[0].name, ...g[0].name.split('/')]).map(n => fold(n).replace(/\(.*?\)/g, ' ').trim()).filter(Boolean);
  return detectIntent(names.reduce((rest, n) => rest.split(n).join(' '), folded));
}

export function createInterpreter(kb) {
  const known = kb.counts;

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

  return { analyse };
}
