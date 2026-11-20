// Recuperação: decide quais itens e quais trechos do livro respondem à pergunta já interpretada. Não monta texto de resposta.
import { search } from './knowledge.js';
import { fold } from './text.js';
import { OVERRIDE_SKIP } from './interpretation.js';

const PASSAGES_FOR_ANSWER = 8;
const SUGGESTION_LIMIT = 4;

// Quando o mesmo nome existe em tipos diferentes (ex.: "Lança" é arma corpo a corpo e de arremesso), usa a pista da pergunta.
function pickType(entities, hint, intent) {
  const types = [...new Set(entities.map(e => e.type))];
  if (types.length === 1) return entities;
  const byIntent = { damage: ['power', 'gear', 'creature'], cost_pp: ['power'], stage: ['power', 'edge'], duration: ['power'], range: ['power', 'gear'], price: ['gear'], weight: ['gear'], requirements: ['edge'], attribute: ['skill'], toughness: ['creature'], parry: ['creature'], pace: ['creature'], attributes: ['creature'], skills: ['creature'], size: ['creature'] }[intent] || [];
  const order = [hint, ...byIntent, 'power', 'edge', 'hindrance', 'skill', 'creature', 'race', 'gear'].filter(Boolean);
  const winner = order.find(t => types.includes(t));
  return entities.filter(e => e.type === winner);
}

// Maiores nomes primeiro, sem repetir as mesmas palavras.
function pickNamedCandidates(candidates) {
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
  return picked;
}

// Agrupa por nome (várias linhas de equipamento com o mesmo nome, ou poder e perícia com o mesmo nome).
function groupByName(picked) {
  const groups = new Map();
  for (const c of picked) {
    const key = `${c.size}:${[...c.tokens].sort().join('-')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c.e);
  }
  return [...groups.values()];
}

export function createRetriever(kb) {
  const nameIndex = kb.entities.flatMap(e => e.forms.map(f => ({ e, tokens: f })));

  // Quais itens do livro a pergunta cita pelo nome?
  function findEntities(tok, hint, intent) {
    const have = new Set(tok);
    const candidates = [];
    for (const { e, tokens: t } of nameIndex) {
      if (!t.length || !t.every(x => have.has(x))) continue;
      candidates.push({ e, tokens: t, size: t.length, chars: t.join('').length });
    }
    let out = groupByName(pickNamedCandidates(candidates)).map(es => pickType(es, hint, intent)).filter(g => g[0].key !== 'pontos de poder' || hint === 'edge');
    if (out.length > 1 && hint) { const only = out.filter(g => g[0].type === hint); if (only.length) out = only; }
    // "custo em Pontos de Poder" cita a vantagem "Pontos de Poder" sem querer
    if (out.length > 1 && intent === 'cost_pp') out = out.filter(g => g[0].key !== 'pontos de poder');
    return out;
  }

  const searchPassages = (a, limit) => search(kb, a.expanded, { limit, phrase: a.phrase, boostTitle: a.syn });

  // Um trecho do livro cujo título é exatamente o assunto da pergunta ("Cura Natural") vale mais que um item que só divide uma palavra ("Cura").
  function titleOverride(a, group) {
    const covered = new Set(group[0].forms.flat());
    const uncovered = a.tokens.filter(t => !covered.has(t) && !OVERRIDE_SKIP.has(t));
    if (!uncovered.length) return false;
    const top = searchPassages(a, 1)[0];
    if (!top || !top.chunk.titleTokens.length) return false;
    const ts = new Set(top.chunk.titleTokens);
    return [...ts].every(t => a.expanded.includes(t)) && uncovered.some(t => ts.has(t));
  }

  // Melhores trechos para a pergunta, e se o primeiro é bom o bastante para responder com certeza: só quando o título
  // inteiro está na pergunta, ou quando as palavras da pergunta batem bem com o trecho.
  function findPassages(a) {
    if (!a.expanded.length) return null;
    const results = searchPassages(a, PASSAGES_FOR_ANSWER);
    if (!results.length) return null;
    const top = results[0];
    const coverage = top.hits / a.expanded.length;
    const titleFull = top.chunk.titleTokens.length > 0 && top.titleHit === top.chunk.titleTokens.length;
    const confident = (titleFull && top.score > 3) || (coverage >= 0.6 && top.score > 4) || (coverage >= 0.5 && top.hits >= 2 && top.score > 4) || top.score > 14;
    return { results, confident };
  }

  // "e a duração?": os itens com o mesmo nome e tipo do último assunto.
  function sameNameAs(entityId) {
    const prev = kb.entities.find(e => e.id === entityId);
    return prev ? kb.entities.filter(e => e.name === prev.name && e.type === prev.type) : null;
  }

  // Títulos de trechos que podem ajudar quando nada respondeu direto.
  function suggestTitles(a, weakResults) {
    const seenTitles = new Set();
    return (weakResults || searchPassages(a, PASSAGES_FOR_ANSWER)).filter(r => !seenTitles.has(fold(r.chunk.title)) && seenTitles.add(fold(r.chunk.title))).slice(0, SUGGESTION_LIMIT);
  }

  return { findEntities, titleOverride, findPassages, sameNameAs, suggestTitles };
}
