// Utilitários de texto do assistente: normalização (sem acento, minúsculas), radicais leves do português e
// emenda de parágrafos que o PDF quebrou no meio de uma palavra. Tudo roda no navegador, sem API.

export const fold = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Palavras sem valor de busca (artigos, preposições e o "jeito de perguntar").
const STOP_WORDS = `a o as os um uma uns umas de do da dos das em no na nos nas por pra para com sob sobre ao aos a e ou mas que
qual quais quem quando onde como quanto quanta quantos quantas porque pq se ser sao foi eh e esta estar estao tem ter tenho
eu me meu minha meus minhas seu sua seus suas voce vc voces ele ela eles elas isso isto esse essa esses essas aquilo
aquele aquela fala falar diga dizer explique explica explicar conte contar saber sei quero queria gostaria preciso
poderia pode podem posso podemos pode fazer faz fazem faco funciona funcionam funcionamento existe existem
diferenca entre ha mais menos muito muita tipo tipos coisa coisas algo alguma algum alguns algumas me mim
la aqui ai ja tambem so apenas ainda entao pois assim sempre nunca quase
livro regra regras sistema jogo rpg savage worlds`.split(/\s+/);
export const STOP = new Set(STOP_WORDS.map(fold));

// Radical leve: tira plurais e terminações comuns para que "ferimentos" case com "ferimento", "poderes" com "poder".
export function stem(word) {
  let w = word;
  if (w.length <= 3) return w;
  if (w.length > 6) w = w.replace(/ando$/, 'ar').replace(/endo$/, 'er').replace(/indo$/, 'ir'); // usando → usar
  if (/coes$/.test(w)) w = w.replace(/coes$/, 'cao');
  else if (/(aes|oes)$/.test(w)) w = w.replace(/(aes|oes)$/, 'ao');
  else if (/ais$/.test(w)) w = w.replace(/ais$/, 'al');
  else if (/eis$/.test(w)) w = w.replace(/eis$/, 'el');
  else if (/(res|zes)$/.test(w)) w = w.slice(0, -2);
  else if (/ns$/.test(w)) w = w.replace(/ns$/, 'm');
  else if (w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  // terminação de verbo/substantivo: recupero / recupera / recuperar → "recuper"
  const m = w.match(/^(.{4,}?)(ar|er|ir|ou|am|em|o|a|e)$/);
  return m ? m[1] : w;
}

// Separa em palavras (letras e números) já normalizadas. "d6+2" vira "d6" e "2".
export const words = text => fold(text).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
export const tokens = (text, { keepStop = false } = {}) => words(text).filter(w => keepStop || !STOP.has(w)).map(stem);

// Distância de edição limitada (para corrigir erros de digitação: "armdura" → "armadura").
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

// O PDF quebra linhas e colunas no meio de palavras ("amplia" / "ção"). Junta os pedaços usando o vocabulário do próprio livro:
// se a união é uma palavra que existe no livro, cola sem espaço; senão, com espaço.
export function wordCounts(pages) {
  const counts = new Map();
  for (const page of pages) for (const block of page.blocks) for (const w of words(block)) counts.set(w, (counts.get(w) || 0) + 1);
  return counts;
}
const ENDS_SENTENCE = /[.!?:;”")\]]\s*$/;
const lastWord = text => (words(text).pop() || '');
const firstWord = text => (words(text)[0] || '');

export function mendParagraphs(paragraphs, counts) {
  const out = [];
  // Um bloco do PDF pode trazer vários marcadores colados ("• A: ... • B: ..."): cada um vira seu parágrafo.
  const split = paragraphs.flatMap(raw => String(raw).split(/\s+(?=•\s*[A-ZÀ-Ý])/));
  for (const raw of split) {
    const text = String(raw).trim();
    if (!text) continue;
    const prev = out[out.length - 1];
    const startsLower = /^[a-zà-ÿ]/.test(text);
    if (prev && startsLower && !ENDS_SENTENCE.test(prev) && !prev.startsWith('•') === !text.startsWith('•')) {
      const a = lastWord(prev), b = firstWord(text);
      const glued = a + b;
      const gluedFreq = counts?.get(glued) || 0;
      const aFreq = counts?.get(a) || 0;
      const bFreq = counts?.get(b) || 0;
      // Cola quando a palavra unida existe e uma das metades sozinha é rara (ou a união é bem mais comum).
      const sticky = gluedFreq >= 2 && (aFreq <= 2 || bFreq <= 2 || gluedFreq > Math.max(aFreq, bFreq) * 2) && b.length <= 6;
      out[out.length - 1] = sticky ? prev + text : `${prev} ${text}`;
      continue;
    }
    out.push(text);
  }
  return out;
}

// Primeira(s) frase(s) do texto, até um limite de caracteres (corta sempre no fim de uma frase quando possível).
export function leadSentences(text, limit = 260) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [clean];
  let out = '';
  for (const s of sentences) {
    if (out && (out + s).length > limit) break;
    out += (out ? ' ' : '') + s.trim();
    if (out.length >= limit) break;
  }
  return out.length > limit * 1.6 ? `${out.slice(0, limit).replace(/\s+\S*$/, '')}…` : out;
}

// Frases de um texto (para achar a que contém dano, custo etc.).
export const sentences = text => (String(text).replace(/\s+/g, ' ').trim().match(/[^.!?]+(?:[.!?]+|$)/g) || []).map(s => s.trim()).filter(Boolean);
