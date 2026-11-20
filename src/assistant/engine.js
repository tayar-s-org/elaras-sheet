// Motor de respostas do assistente. Não usa API nem IA generativa: entende a pergunta com regras (intenção + nome do item) e
// responde com dados e trechos tirados do livro, sempre citando a página. Se o livro não cobre, diz que não achou.
// Este arquivo só orquestra: interpretation.js entende a pergunta, retrieval.js acha o conteúdo, presentation.js monta a resposta.
import { createInterpreter, intentBesideNames, OVERRIDE_SKIP } from './interpretation.js';
import { createRetriever } from './retrieval.js';
import { entitiesReply, listAnswer, passageAnswer, clarifyItemReply, noAnswerReply } from './presentation.js';
import { text } from './blocks.js';

const GREET = /^(oi+|ola+|opa|e ai|eai|hey|salve|bom dia|boa tarde|boa noite|hello|hi)\b/;
const THANKS = /^(obrigad[oa]|valeu|vlw|thanks|show|legal|top|beleza)\b/;
const HELP = /^(ajuda|help|o que voce (sabe|faz)|quem e voce|quem (voce )?e|como (te |voce )?(uso|usar|funciona) (o |a )?(voce|bot|assistente|arquivista|chat))\b/;
const NEEDS_BOOK_TEXT = new Set(['cost_pp', 'damage', 'range', 'duration']);
const ITEM_INTENTS = new Set(['damage', 'cost_pp', 'price', 'range', 'duration', 'stage', 'requirements', 'weight', 'toughness', 'parry', 'pace', 'armor', 'shots']);
const TYPES_ANSWERED_FROM_TEXT = new Set(['edge', 'hindrance', 'skill']);

const onlyAsksAboutItem = a => a.tokens.every(t => OVERRIDE_SKIP.has(t));

const smallTalk = (kind, message) => ({ kind, blocks: [text(message)], source: [] });

function smallTalkReply(a) {
  if (GREET.test(a.folded) && a.rawWords.length <= 4) return smallTalk('greeting', 'Olá! Pergunte sobre **poderes, perícias, vantagens, combate, equipamentos** ou **criaturas**. Eu só respondo com o que está escrito no livro, e sempre digo a página.');
  if (THANKS.test(a.folded) && a.rawWords.length <= 3) return smallTalk('thanks', 'Por nada! Se precisar de outra regra, é só perguntar.');
  if (HELP.test(a.folded) && a.tokens.length <= 3) return smallTalk('help', 'Eu sou o arquivista do livro. Posso dizer, por exemplo, **o dano da Espada Longa**, **o custo e a duração de um poder**, **os requisitos de uma vantagem**, **como funciona o combate**, **as estatísticas de uma criatura**. Tudo vem do livro, com a página de onde tirei.');
  return null;
}

export function createAssistant(kb) {
  const { analyse } = createInterpreter(kb);
  const retriever = createRetriever(kb);

  function passageReply(a) {
    const found = retriever.findPassages(a);
    if (!found) return null;
    return found.confident ? passageAnswer(a, found.results) : { weak: found.results };
  }

  // Itens que a pergunta cita pelo nome e a intenção lida do resto da pergunta. `ctx.last` é o último item de que falamos.
  function resolveEntities(a, ctx) {
    let groups = retriever.findEntities(a.tokens, a.hint, a.intent);
    if (groups.length && retriever.titleOverride(a, groups[0])) groups = [];
    if (groups.length) return { groups, intent: intentBesideNames(a.folded, groups) };
    // "e a duração?": sem item novo na pergunta, mas com um assunto anterior
    const previous = ctx.last && a.intent && onlyAsksAboutItem(a) ? retriever.sameNameAs(ctx.last) : null;
    return { groups: previous ? [previous] : [], intent: a.intent };
  }

    // Pergunta principal.
  function ask(question, ctx = {}) {
    const raw = String(question || '').trim();
    if (!raw) return null;
    const a = analyse(raw);
    const chatter = smallTalkReply(a);
    if (chatter) return chatter;
    const listed = listAnswer(kb, a);
    if (listed) return { kind: 'list', ...listed };

    const { groups, intent } = resolveEntities(a, ctx);
    // Vantagem/complicação/perícia não têm custo, dano ou alcance próprios: a resposta está no texto do livro ("Pontos de Poder Iniciais: 10").
    if (groups.length === 1 && TYPES_ANSWERED_FROM_TEXT.has(groups[0][0].type) && NEEDS_BOOK_TEXT.has(intent)) {
      const viaText = passageReply(a);
      if (viaText && !viaText.weak) return { kind: 'passage', ...viaText };
    }
    if (!groups.length && ITEM_INTENTS.has(intent) && onlyAsksAboutItem(a)) {
      // "O que são Estágios?" também cai aqui, mas é uma regra com título próprio no livro; só pergunta "sobre qual item?" se não houver.
      const named = passageReply(a);
      if (named && !named.weak && named.chunk.titleTokens.every(t => a.expanded.includes(t))) return { kind: 'passage', ...named };
      return clarifyItemReply();
    }
    if (groups.length) return entitiesReply(groups, intent);
    const passage = passageReply(a);
    if (passage && !passage.weak) return { kind: 'passage', ...passage };
    return noAnswerReply(retriever.suggestTitles(a, passage?.weak));
  }

  return { ask, analyse, findEntities: q => { const a = analyse(q); return retriever.findEntities(a.tokens, a.hint, a.intent); } };
}
