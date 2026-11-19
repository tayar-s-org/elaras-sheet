// Base de conhecimento do assistente: tudo é derivado do texto do próprio livro (public/assets/book.json), sem nenhum
// conteúdo escrito à mão. O livro é cortado em trechos (títulos + parágrafos) e as listas estruturadas do livro
// (poderes, vantagens, complicações, perícias, equipamentos, criaturas) viram "entidades" que respondem perguntas diretas.
import { fold, tokens, words, stem, STOP, wordCounts, mendParagraphs } from './text.js';

// A numeração do PDF tem 2 páginas a mais que a do livro impresso (o índice do livro diz "Introdução ... 11" na página 13 do arquivo).
export const PRINT_OFFSET = 2;
export const printedPage = page => Math.max(1, page - PRINT_OFFSET);

const FRONT_MATTER = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 218]);
const SUMMARY_PAGES = new Set([56, 57, 58, 59, 60, 61, 62, 63, 110, 111]); // sumários em tabela (criação e opções de ataque)
const TABLE_PAGES = new Set([70, 71, 72, 73, 74, 75, 76, 77, 79, 80, 81, 82, 83, 84, 85]);
const POWER_PAGES = [153, 168];
const SKILL_PAGES = [27, 32];
const CREATURE_PAGES = [190, 202];
const ADVENTURE_FROM = 205;

const TABLE_WORDS = new Set(['tipo', 'dano', 'peso', 'custo', 'dist', 'cdt', 'tiros', 'obs', 'observacoes', 'min', 'item', 'bonus', 'mod', 'situacao', 'descricao', 'efeito', 'requisitos', 'vantagem', 'falha', 'sucesso', 'ampliacao', 'pa', 'projetil', 'distancia', 'res', 'carta', 'contratempo', 'habilidade', 'pericia', 'reacao', 'ataque', 'estagio']);
const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'para', 'com', 'em', 'no', 'na', 'por', 'ou']);
const TERM_SKIP = new Set(['falha', 'sucesso', 'ampliacao', 'atributos', 'pericias', 'equipamento', 'aparar', 'estagio', 'pontos de poder', 'distancia', 'duracao', 'manifestacoes', 'resultado', 'exemplo', 'nota']);

const isUpperHeading = text => {
  if (text.length < 3 || text.length > 70 || text.startsWith('•') || /[.!?]$/.test(text)) return false;
  if (text.replace(/[^A-Za-zÀ-ÿ]/g, '').length < 3 || text !== text.toLocaleUpperCase('pt-BR')) return false;
  const ws = words(text);
  return ws.length <= 8 && ws.filter(w => TABLE_WORDS.has(w)).length < 2;
};
const isSubHeading = (text, next) => {
  if (!next || next.length < 50 || text.length > 36 || /[\d•:.,;!?()*]/.test(text)) return false;
  if (!/^[A-ZÀ-Ý]/.test(text) || text === text.toLocaleUpperCase('pt-BR')) return false;
  const ws = text.split(/\s+/);
  return ws.length <= 4 && !SMALL.has(fold(ws[ws.length - 1]));
};

const paragraphsOf = (blocks, counts) => mendParagraphs(blocks, counts);
// Restos de tabela do PDF ("Leve Média (-1) (-2)", "d4 d6 d8"): pouca letra, muito número/símbolo ou linha curta sem frase.
const isNoise = p => {
  if (p.startsWith('•')) return false;
  const letters = (p.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  if (letters < p.replace(/\s/g, '').length * 0.6) return true;
  if (p.length > 12 && p === p.toLocaleUpperCase('pt-BR')) return true;
  return p.length < 28 && !/[.!?:]$/.test(p);
};
const clip = (text, size) => (text.length > size ? `${text.slice(0, size)}…` : text);
const titleCase = text => text.toLocaleLowerCase('pt-BR').replace(/çòes/g, 'ções') /* erro de acento no PDF: "AMPLIAÇÒES" */.replace(/(^|[\s/(-])([a-zà-ÿ])/g, (m, a, b) => a + b.toLocaleUpperCase('pt-BR')).replace(/\b(De|Da|Do|Das|Dos|E|Com|Para|Em|No|Na|Ou)\b/g, s => s.toLocaleLowerCase('pt-BR'));

// ───────────────────────── trechos do livro ─────────────────────────
function buildChunks(pages, counts) {
  const stream = [];
  for (const { page, blocks } of pages) {
    if (FRONT_MATTER.has(page) || SUMMARY_PAGES.has(page)) continue;
    blocks.forEach((text, i) => {
      const t = text.trim();
      if (!t) return;
      // Páginas de tabela: só prosa comprida (notas e regras); linhas de tabela viram entidades de equipamento.
      if (TABLE_PAGES.has(page) && (t.length < 80 || (t.match(/\d/g) || []).length > t.length * 0.12)) {
        if (isUpperHeading(t)) stream.push({ page, text: t, next: blocks[i + 1] });
        return;
      }
      stream.push({ page, text: t, next: blocks[i + 1] });
    });
  }
  const chunks = [];
  let chapter = '';
  let section = '';
  let current = null;
  const close = () => { if (current && current.blocks.length) chunks.push(current); current = null; };
  const open = (title, level, page) => { close(); current = { title, level, page, endPage: page, chapter, section, blocks: [] }; };
  for (const { page, text, next } of stream) {
    if (/^CAP[ÍI]TULO \d/.test(text)) { chapter = text; section = ''; open(text, 1, page); continue; }
    if (isUpperHeading(text)) { section = text; open(text, 1, page); continue; }
    if (isSubHeading(text, next) && current) { open(text, 2, page); continue; }
    if (!current) open(section || chapter || 'Livro', 1, page);
    current.blocks.push(text);
    current.endPage = page;
  }
  close();
  for (const chunk of chunks) {
    chunk.paras = paragraphsOf(chunk.blocks, counts).filter(p => !isNoise(p));
    chunk.text = chunk.paras.join('\n\n');
    chunk.adventure = chunk.page >= ADVENTURE_FROM;
    chunk.titleTokens = tokens(chunk.title.replace(/^CAP[ÍI]TULO \d+:?\s*/i, ''));
    chunk.titleWords = words(chunk.title.replace(/^CAP[ÍI]TULO \d+:?\s*/i, '')).join(' ');
  }
  const real = chunks.filter(c => c.paras.length);
  // Definições viram trechos próprios: "• Termo: explicação" (ex.: "Cobertura Parcial") e "Termo é ..." (ex.: "Aparar é igual a 2 mais...").
  const terms = [];
  const headingKeys = new Set(real.map(c => `${c.page}:${fold(c.title)}`));
  const DEFINES = /^([A-ZÀ-Ý][\p{L}-]+(?: (?:de|do|da) [A-ZÀ-Ý][\p{L}-]+| [A-ZÀ-Ý][\p{L}-]+)?)\s+(?:é|são|representa|reflete|mede|significa)\s+(.{25,})$/su;
  for (const chunk of real) {
    if (chunk.page >= POWER_PAGES[0] && chunk.page <= POWER_PAGES[1]) continue;
    if (chunk.page >= CREATURE_PAGES[0] && chunk.page <= CREATURE_PAGES[1]) continue;
    for (const para of chunk.paras) {
      const bullet = para.match(/^•\s*([^:•]{3,42}):\s*(.{20,})$/s);
      const defines = !bullet && chunk.page < 145 ? para.match(DEFINES) : null;
      const m = bullet || defines;
      if (!m) continue;
      const term = m[1].trim();
      if (bullet && TERM_SKIP.has(fold(term))) continue;
      if (term.split(/\s+/).length > 5 || /\d/.test(term) || headingKeys.has(`${chunk.page}:${fold(term)}`)) continue;
      const body = bullet ? m[2].trim() : para;
      terms.push({ title: term, level: 3, page: chunk.page, endPage: chunk.endPage, chapter: chunk.chapter, section: chunk.section, parent: chunk.title, paras: [body], text: body, adventure: chunk.adventure, term: true, titleTokens: tokens(term), titleWords: words(term).join(' ') });
    }
  }
  return [...real, ...terms].map((c, id) => ({ ...c, id }));
}

// ───────────────────────── poderes (págs. 153–168) ─────────────────────────
const POWER_FIELDS = [['Estágio', 'stage'], ['Pontos de Poder', 'cost'], ['Distância', 'range'], ['Duração', 'duration']];
function buildPowers(pages, counts) {
  const stream = [];
  for (const { page, blocks } of pages) if (page >= POWER_PAGES[0] && page <= POWER_PAGES[1]) for (const text of blocks) stream.push({ page, text });
  const out = [];
  let power = null;
  for (let i = 0; i < stream.length; i++) {
    const { page, text } = stream[i];
    if (isUpperHeading(text) && stream[i + 1]?.text.startsWith('• Estágio:')) {
      power = { name: titleCase(text), page, endPage: page, blocks: [], fields: {}, extras: [] };
      out.push(power);
      continue;
    }
    if (!power) continue;
    const field = POWER_FIELDS.find(([label]) => text.startsWith(`• ${label}:`));
    if (field && !power.fields[field[1]]) { power.fields[field[1]] = text.split(':').slice(1).join(':').trim(); continue; }
    if (text.startsWith('• Manifestações:')) { power.fields.manifest = text.split(':').slice(1).join(':').trim(); continue; }
    power.blocks.push(text);
    power.endPage = page;
  }
  return out.filter(p => p.fields.stage && p.fields.cost).map(p => {
    const paras = paragraphsOf(p.blocks, counts);
    const body = paras.filter(x => !x.startsWith('•'));
    const extras = paras.filter(x => x.startsWith('•'));
    return { type: 'power', name: p.name, page: p.page, endPage: p.endPage, ...p.fields, paras, body, extras, text: paras.join('\n\n') };
  });
}

// ───────────────────────── vantagens e complicações (catalog.json) ─────────────────────────
function edgeCategories(pages) {
  // Percorre as páginas 38–54 na ordem do livro: cada vantagem pertence ao último "VANTAGENS ..." que apareceu antes dela.
  const byName = new Map();
  let category = '';
  for (const { page, blocks } of pages) {
    if (page < 38 || page > 54) continue;
    for (const text of blocks) {
      const m = text.match(/^VANTAGENS(?: DE)?\s+(.+)$/);
      if (m && text === text.toLocaleUpperCase('pt-BR')) { category = titleCase(m[1]); continue; }
      if (category && /^[A-ZÀ-Ý0-9 !&/'’-]{2,50}$/.test(text) && !byName.has(fold(text))) byName.set(fold(text), category);
    }
  }
  return byName;
}
function buildEdges(catalog, counts, pages) {
  const categories = edgeCategories(pages);
  return catalog.map(e => {
    const paras = paragraphsOf(String(e.description || '').split('\n\n'), counts);
    const category = e.kind === 'hindrances' ? '' : (categories.get(fold(e.name).replace(/\s+/g, ' ')) || (e.category === 'Antecedentes' ? 'Antecedentes' : e.category));
    return { type: e.kind === 'hindrances' ? 'hindrance' : 'edge', name: titleCase(e.name), page: e.page, category, requirements: e.requirements || '', severities: e.severities || [], paras, text: paras.join('\n\n') };
  });
}

// ───────────────────────── perícias (págs. 27–32) ─────────────────────────
const ATTRS = { AGILIDADE: 'Agilidade', ASTÚCIA: 'Astúcia', ESPÍRITO: 'Espírito', FORÇA: 'Força', VIGOR: 'Vigor' };
function buildSkills(pages, counts) {
  const out = [];
  let skill = null;
  for (const { page, blocks } of pages) {
    if (page < SKILL_PAGES[0] || page > SKILL_PAGES[1]) continue;
    for (const text of blocks) {
      const m = text.match(/^([A-ZÀ-Ý][A-ZÀ-Ý ]+?)\s*\((AGILIDADE|ASTÚCIA|ESPÍRITO|FORÇA|VIGOR)\)\s*$/);
      if (m) { skill = { type: 'skill', name: titleCase(m[1]), attribute: ATTRS[m[2]], page, blocks: [] }; out.push(skill); continue; }
      if (/^COMPLICAÇÕES/.test(text)) skill = null;
      if (skill && !isUpperHeading(text)) skill.blocks.push(text);
    }
  }
  return out.map(s => {
    const paras = paragraphsOf(s.blocks, counts).filter(x => x.length > 30 || x.startsWith('•'));
    return { type: 'skill', name: s.name, attribute: s.attribute, page: s.page, paras, text: paras.join('\n\n') };
  });
}

// ───────────────────────── raças (págs. 22–26) ─────────────────────────
function buildRaces(chunks) {
  return chunks.filter(c => c.page >= 23 && c.page <= 26 && c.level === 1 && !c.term && !/^(RAÇAS|PERÍCIAS|HABILIDADES)/.test(c.title) && c.paras.length)
    .map(c => ({ type: 'race', name: titleCase(c.title), page: c.page, paras: c.paras, text: c.text }));
}

// ───────────────────────── criaturas (págs. 190–202) ─────────────────────────
function buildCreatures(chunks) {
  const out = [];
  for (const c of chunks) {
    if (c.term || c.page < CREATURE_PAGES[0] || c.page > CREATURE_PAGES[1] || c.level !== 1) continue;
    const bullets = c.paras.filter(p => p.startsWith('•'));
    const attrs = bullets.filter(p => p.startsWith('• Atributos:'));
    if (attrs.length !== 1) continue;
    const field = label => bullets.find(p => p.startsWith(`• ${label}:`))?.replace(/^•[^:]+:\s*/, '');
    const stats = bullets.find(p => /^• Aparar:/.test(p)) || '';
    const stat = label => stats.match(new RegExp(`${label}:\\s*([^;]+)`))?.[1]?.trim();
    out.push({ type: 'creature', name: titleCase(c.title), page: c.page, paras: c.paras, text: c.text,
      attributes: field('Atributos'), skills: field('Perícias'), parry: stat('Aparar'), pace: stat('Movimentação'), toughness: stat('Resistência'), gear: field('Equipamento'),
      abilities: bullets.filter(p => !/^• (Atributos|Perícias|Aparar|Equipamento):/.test(p)) });
  }
  return out;
}

// ───────────────────────── equipamentos (tabelas das págs. 70–79) ─────────────────────────
const MELEE_ROW = /^(.*?)\s+(For\+d\d+(?:[+-]\d+)?|\d+d\d+(?:[+-]\d+)?)\s+([\d.,]+)\s*kg\s+\$\s*([\d.,]+(?:\s*mil)?)\s*(.*)$/i;
const RANGED_ROW = /^(.*?)\s+(\d+\/\d+\/\d+)\s+(\S+)\s+([\d-]+)\s+([\d/]+|[–-])\s+\$\s*([\d.,]+\S*)\s+([\d.,]+)\s+(d\d+|[–-])\s*(.*)$/i;
const ARMOR_ROW = /^(.*?)\s+(?:\*+\s+)?(\+\d+(?:\/\+\d+)?|[–-])\s+([\d.,]+)\s*kg\s+(\$\s*[\d.,]+|\*+)\s*(.*)$/i;
const GEAR_ROW = /^(.*?)\s+\$\s*([\d.,/]+\+?)\s*(.*)$/;
const DIST_ROW = /^(.*?)\s+(\d+\/\d+\/\d+)\s+(.*)$/;

const stripStars = s => s.replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
function buildGear(pages) {
  const items = [];
  for (const { page, blocks } of pages) {
    if (page < 70 || page > 79) continue;
    let section = '';
    let table = '';
    let header = '';
    let prefix = '';
    for (const raw of blocks) {
      const text = raw.replace(/\s*⏎\s*/g, ' ').replace(/\n/g, ' ').trim();
      if (!text) continue;
      if (isUpperHeading(text) && !/\bTIPO\b|\bITEM\b|\d/.test(text)) { section = text.replace(/\s+/g, ' ').replace(/^(.*?) \1$/, '$1'); prefix = ''; continue; }
      if (/^(TIPO|ITEM)\b/.test(text)) {
        header = text;
        table = /DIST\.? DANO/.test(text) ? 'ranged' : /BÔNUS/.test(text) ? 'armor' : /DANO PESO/.test(text) ? 'melee' : /^ITEM/.test(text) ? 'gear' : /DISTÂNCIA PROJÉTIL/.test(text) ? 'heavy' : '';
        prefix = '';
        continue;
      }
      if (!table || text.startsWith('*')) { prefix = ''; continue; }
      const candidate = prefix && !/^\W*[A-ZÀ-Ý][^$]*\d.*\$/.test(prefix) ? `${prefix} ${text}` : text;
      let m = null;
      let item = null;
      if (table === 'melee' && (m = candidate.match(MELEE_ROW))) item = { kind: 'melee', name: m[1], damage: m[2], weight: `${m[3]} kg`, cost: `$ ${m[4]}`, notes: m[5] };
      else if (table === 'ranged' && (m = candidate.match(RANGED_ROW))) item = { kind: 'ranged', name: m[1], range: m[2], damage: m[3], rof: m[4], shots: m[5], cost: `$ ${m[6]}`, weight: `${m[7]} kg`, minStr: m[8], notes: m[9] };
      else if (table === 'armor' && (m = candidate.match(ARMOR_ROW))) item = { kind: 'armor', name: m[1], armor: m[2], weight: `${m[3]} kg`, cost: m[4].startsWith('$') ? m[4].replace('$', '$ ').replace(/\s+/g, ' ') : '', notes: m[5] };
      else if (table === 'gear' && (m = candidate.match(GEAR_ROW))) {
        const rest = m[3].trim();
        const w = rest.match(/^([\d.,/]+)(?:\s+(.*))?$/);
        item = { kind: 'gear', name: m[1], cost: `$ ${m[2]}`, weight: w ? `${w[1]} kg` : '', notes: w ? (w[2] || '').replace(/^[-–]$/, '') : rest };
      } else if (table === 'ranged' && (m = candidate.match(DIST_ROW))) item = { kind: 'raw', name: m[1], raw: candidate };
      else if (table === 'heavy' && (m = candidate.match(DIST_ROW))) item = { kind: 'heavy', name: m[1], range: m[2], raw: m[3] };
      if (item) {
        item.name = stripStars(item.name).replace(/^(?:[A-ZÀ-Ý&]{2,}(?:\s+[A-ZÀ-Ý&]{2,})*\s+)+(?=[A-ZÀ-Ý][a-zà-ÿ])/, '').replace(/^PA\s+/, '');
        const open = (item.name.match(/\(/g) || []).length, shut = (item.name.match(/\)/g) || []).length;
        const clean = /^[A-ZÀ-Ý0-9(]/.test(item.name) && open === shut && !/\$/.test(`${item.name} ${item.notes || ''}`) && item.name.length >= 2 && item.name.length <= 60;
        // A página 78 tem duas colunas de itens intercaladas: linhas com texto de outro item na observação são descartadas.
        const mixed = page === 78 && item.kind === 'gear' && /^[A-ZÀ-Ý]/.test(item.notes || '');
        if (clean && !mixed) items.push({ type: 'gear', page, section, header, ...item, ...(item.kind === 'heavy' ? { kind: 'raw', raw: `${item.range} ${item.raw}` } : {}) });
        prefix = '';
      } else {
        prefix = /\$|\d+\/\d+/.test(text) || text.length > 45 ? '' : text;
      }
    }
  }
  return items;
}

// ───────────────────────── índice de busca (BM25) ─────────────────────────
function buildIndex(chunks) {
  const docs = chunks.map(c => {
    const titleTokens = c.titleTokens;
    const parentTokens = tokens(c.parent || c.section || '');
    const bodyTokens = tokens(c.text);
    const tf = new Map();
    const add = (t, w) => tf.set(t, (tf.get(t) || 0) + w);
    titleTokens.forEach(t => add(t, 5));
    parentTokens.forEach(t => add(t, 1.2));
    bodyTokens.forEach(t => add(t, 1));
    return { tf, len: titleTokens.length * 5 + parentTokens.length + bodyTokens.length };
  });
  const df = new Map();
  docs.forEach(d => { for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1); });
  const avg = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, avg, n: docs.length };
}

// `phrase`: a pergunta inteira como " palavra palavra " (com as palavrinhas), para premiar títulos que aparecem escritos igual na pergunta.
export function search(kb, queryTokens, { limit = 5, boostTitle = [], phrase = '' } = {}) {
  const { docs, df, avg, n } = kb.index;
  const k1 = 1.4, b = 0.7;
  const scored = [];
  docs.forEach((d, i) => {
    let score = 0;
    let hits = 0;
    for (const t of queryTokens) {
      const f = d.tf.get(t);
      if (!f) continue;
      hits++;
      const idf = Math.log(1 + (n - df.get(t) + 0.5) / (df.get(t) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.len / avg))));
    }
    if (!score) return;
    const chunk = kb.chunks[i];
    const titleSet = new Set(chunk.titleTokens);
    const titleHit = queryTokens.filter(t => titleSet.has(t)).length;
    const coverage = hits / queryTokens.length;
    // poderes, vantagens, perícias e criaturas têm respostas próprias (entidades); o texto bruto deles só entra como último recurso
    if (chunk.isEntity || (chunk.page >= CREATURE_PAGES[0] && chunk.page <= CREATURE_PAGES[1])) score *= 0.55;
    score *= 0.6 + coverage;
    // O título inteiro está na pergunta: quase sempre é o assunto que se quer ("Cura Natural", "Ampliações").
    if (titleSet.size && titleHit === titleSet.size) {
      score += 3 + 1.5 * titleSet.size;
      if (titleSet.size === new Set(queryTokens).size) score += 4 + Math.min(2, chunk.text.length / 4000); // a pergunta é só o título
    }
    if (phrase && chunk.titleWords && phrase.includes(` ${chunk.titleWords} `)) score += 2.5;
    if (boostTitle.length) score += 5 * boostTitle.filter(t => titleSet.has(t)).length; // sinônimo curado que bate com o título ("xp" → Progresso)
    if (chunk.adventure) score *= 0.45;
    if (chunk.text.length < 90) score *= 0.55; // trecho curto demais ("Use os resultados acima.") quase nunca responde
    if (chunk.page >= 80 && chunk.page <= 85) score *= 0.5; // regras de veículos só entram quando a pergunta fala deles
    if (chunk.page >= 171 && chunk.page <= 184) score *= 0.8; // conselhos para o Mestre
    if (chunk.page >= 87 && chunk.page <= 142) score *= 1.12; // capítulo de regras: é onde estão as respostas da maioria das dúvidas
    if (chunk.page <= 16) score *= 0.85; // introdução
    if (chunk.term) score *= 0.85;
    scored.push({ chunk, score, hits, titleHit });
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ───────────────────────── montagem ─────────────────────────
export function buildKnowledge(pages, catalog = []) {
  const counts = wordCounts(pages);
  const chunks = buildChunks(pages, counts);
  const powers = buildPowers(pages, counts);
  const edges = buildEdges(catalog, counts, pages);
  const skills = buildSkills(pages, counts);
  const races = buildRaces(chunks);
  const creatures = buildCreatures(chunks);
  const gear = buildGear(pages);
  const creatureNames = new Set(creatures.map(c => fold(c.name)));
  const entities = [...powers, ...edges, ...skills, ...races, ...creatures, ...gear].map((e, id) => {
    const forms = nameForms(e.name);
    // "tubarão", "cavalo", "vampiro": o primeiro nome vale para todas as criaturas da família (se não houver uma com esse nome exato)
    const first = e.type === 'creature' ? e.name.split(/\s+/)[0] : '';
    if (first && first !== e.name && first.length >= 4 && !creatureNames.has(fold(first))) forms.push(first);
    return { ...e, id, forms: forms.map(f => tokens(f)).filter(t => t.length), key: fold(e.name) };
  });
  const entityKeys = new Set(entities.filter(e => ['edge', 'hindrance', 'power', 'skill'].includes(e.type)).map(e => e.key));
  chunks.forEach(c => { c.isEntity = c.level === 1 && !c.term && entityKeys.has(fold(c.title.replace(/\s*\(.*\)\s*$/, ''))); });
  // Palavras dos nomes e títulos do livro: servem para corrigir erros de digitação da pergunta.
  const vocab = new Set();
  const vocabWords = new Set();
  const addWords = text => words(text).forEach(w => { if (w.length >= 5 && !STOP.has(w)) { vocabWords.add(w); vocab.add(stem(w)); } });
  entities.forEach(e => addWords(e.name));
  chunks.forEach(c => addWords(c.title));
  return { pages, chunks, entities, vocab, vocabWords, index: buildIndex(chunks), counts, byType: type => entities.filter(e => e.type === type) };
}

// "Detectar/Ocultar Arcano" → ["detectar/ocultar arcano", "detectar arcano", "ocultar arcano"]; "Escudo Pequeno: Broquel" etc.
function nameForms(name) {
  const clean = String(name).replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  const expand = key => key.split(' ').reduce((acc, word) => acc.flatMap(prefix => word.split('/').map(part => (prefix ? `${prefix} ${part}` : part))), ['']);
  const forms = new Set([clean, ...expand(clean)]);
  const paren = String(name).match(/\((.*?)\)/);
  if (paren && !/^[.\d]/.test(paren[1])) forms.add(paren[1]);
  return [...forms].filter(f => f.length >= 2);
}

export { clip, titleCase, isUpperHeading };
