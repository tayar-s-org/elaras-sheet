import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import catalog from '../catalog.json' with { type: 'json' };
import { buildKnowledge, printedPage } from './knowledge.js';
import { createAssistant } from './engine.js';
import { fold, stem, tokens, mendParagraphs, wordCounts } from './text.js';
import { TOPICS, STARTER_QUESTIONS } from './topics.js';

const book = JSON.parse(readFileSync(new URL('../../public/assets/book.json', import.meta.url), 'utf8'));
const kb = buildKnowledge(book.pages, catalog);
const bot = createAssistant(kb);

// Tudo o que uma resposta mostra, em texto simples e sem acento, para conferir o conteúdo.
const flat = r => fold(r.blocks.map(b => b.type === 'text' ? b.text : b.type === 'facts' ? b.rows.map(x => x.join(' ')).join(' ') : b.type === 'quote' ? `${b.text} ${b.full}` : b.type === 'list' ? b.items.map(i => i.label).join(' ') : '').join(' ').replace(/\*\*/g, ''));
const ask = (q, ctx) => bot.ask(q, ctx);
const bookText = fold(book.pages.map(p => p.text).join(' ').replace(/\s+/g, ' '));

test('a base é montada só com o texto do livro e cobre os grupos de regras', () => {
  const count = type => kb.byType(type).length;
  assert.equal(count('power'), 50);
  assert.ok(count('edge') >= 100 && count('hindrance') >= 40, 'vantagens e complicações');
  assert.equal(count('skill'), 23);
  assert.ok(count('creature') >= 30 && count('race') >= 8 && count('gear') >= 120);
  assert.ok(kb.chunks.length > 800);
});

test('a numeração do PDF tem 2 páginas a mais que a do livro impresso', () => {
  assert.equal(printedPage(96), 94); // Abalado: índice do livro diz 94
  assert.equal(printedPage(1), 1);
});

test('radicais e emenda de palavras quebradas pelo PDF', () => {
  assert.equal(stem('ferimentos'), stem('ferimento'));
  assert.equal(stem(fold('ampliações')), stem(fold('ampliação')));
  assert.equal(stem('recupero'), stem('recuperar'));
  assert.notEqual(stem(fold('resistência')), stem(fold('resistente')));
  assert.deepEqual(tokens('Qual o custo da Armadura?'), [stem('custo'), stem('armadura')]);
  const counts = wordCounts(book.pages);
  assert.deepEqual(mendParagraphs(['Numa amplia', 'ção, é mandado para outro plano.'], counts), ['Numa ampliação, é mandado para outro plano.']);
  assert.deepEqual(mendParagraphs(['Fim da frase.', 'outra coisa começa'], counts), ['Fim da frase.', 'outra coisa começa']);
});

test('poderes: custo, distância, duração, estágio e dano vêm da ficha do poder no livro', () => {
  assert.match(flat(ask('Qual o custo da magia Armadura?')), /2 pontos de poder/);
  assert.match(flat(ask('Qual a duração de Invisibilidade?')), /3 \(1\/rodada\)/);
  assert.match(flat(ask('Qual a distância do Raio?')), /12\/24\/48/);
  assert.match(flat(ask('Em que estágio aprendo Teleporte?')), /experiente/);
  assert.match(flat(ask('qual o dano da magia Explosão')), /o dano de explosao e 2d6/);
  assert.match(flat(ask('dano da rajada')), /2d10/);
  const nada = ask('Qual o dano de Armadura?');
  assert.match(flat(nada), /nao indica dano/);
});

test('todo poder responde com os mesmos valores que estão escritos na página dele', () => {
  for (const p of kb.byType('power')) {
    const pageText = fold(book.pages.slice(p.page - 1, p.endPage).map(x => x.text).join(' ').replace(/\s+/g, ' '));
    for (const [q, value] of [[`Qual o custo de ${p.name} em pontos de poder?`, p.cost], [`Qual a distância de ${p.name}?`, p.range], [`Qual a duração de ${p.name}?`, p.duration], [`Em que estágio está ${p.name}?`, p.stage]]) {
      const answer = ask(q);
      assert.equal(answer.kind, 'entity', `${q} deveria achar o poder`);
      assert.equal(answer.entity.name, p.name, q);
      assert.ok(flat(answer).includes(fold(value)), `${q} → ${value}`);
      assert.ok(pageText.includes(fold(value).replace(/\s+/g, ' ')), `${value} não está na página de ${p.name}`);
      assert.ok(answer.source.some(s => s.page === p.page), 'cita a página');
    }
  }
});

test('vantagens, complicações e perícias', () => {
  assert.match(flat(ask('quais os requisitos de Ambidestro')), /novato, agilidade d8\+/);
  assert.match(flat(ask('requisitos da vantagem esquiva aprimorada')), /veterano, esquiva/);
  assert.match(flat(ask('o que faz a vantagem Acrobata')), /\+2 a todas as rolagens/);
  assert.match(flat(ask('o que é a complicação Pacifista')), /menor ou maior/);
  assert.match(flat(ask('qual o atributo de Lutar')), /agilidade/);
  assert.match(flat(ask('qual o atributo de Escalar')), /forca/);
  assert.match(flat(ask('quais vantagens de combate existem')), /esquiva/);
  assert.match(flat(ask('quais perícias usam Astúcia')), /conhecimento/);
  assert.match(flat(ask('quais complicações menores existem')), /boca grande/);
});

test('equipamentos: dano, preço, peso e armadura saem das tabelas do livro', () => {
  assert.match(flat(ask('dano da katana')), /for\+d6\+2/);
  assert.match(flat(ask('quanto custa a katana')), /\$ 1000/);
  assert.match(flat(ask('quanto pesa a espada longa')), /4 kg/);
  assert.match(flat(ask('bônus de armadura do colete de kevlar')), /\+2\/\+4/);
  assert.match(flat(ask('dano da glock')), /2d6/);
  assert.match(flat(ask('quanto de armadura dá a cota de malha')), /\+2/);
  assert.match(flat(ask('preço do arco')), /\$ 250/);
  assert.match(flat(ask('quanto custa uma adaga')), /\$ 25/);
});

test('criaturas do bestiário', () => {
  assert.match(flat(ask('qual a resistência do leão')), /\b8\b/);
  assert.match(flat(ask('aparar do ogro')), /\b6\b/);
  assert.match(flat(ask('atributos do dragão')), /forca d12\+9/);
});

test('apelidos de criaturas, tamanho e listas de equipamento', () => {
  const horses = flat(ask('qual o movimento do cavalo'));
  assert.ok(horses.includes('cavalo de guerra') && horses.includes('cavalo de montaria'), horses);
  assert.match(flat(ask('qual o tamanho do dragão')), /tamanho \+8/);
  const sharks = flat(ask('resistência do tubarão'));
  assert.ok(sharks.includes('tubarao branco') && sharks.includes('tubarao mediano'));
  const weapons = ask('quais armas existem');
  assert.equal(weapons.kind, 'list');
  assert.ok(weapons.blocks[1].items.some(i => i.label === 'Katana') && weapons.blocks[1].items.some(i => i.label.startsWith('Glock')));
  assert.ok(ask('quais armaduras existem').blocks[1].items.some(i => i.label.startsWith('Colete de Kevlar')));
  assert.deepEqual(ask('poderes de estágio veterano').blocks[1].items.map(i => i.label).sort(), ['Banir', 'Cura Maior', 'Fantoche', 'Voar', 'Zumbi']);
});

test('regras gerais: acha o trecho certo e diz a página', () => {
  const cases = [
    ['o que é estar abalado', [96], /abalado/],
    ['como funcionam os benes', [89], /tres/],
    ['quantos benes eu começo', [89], /tres/],
    ['como funciona cobertura', [94], /cobertura/],
    ['como funciona fogo automático', [104], /automatic/],
    ['como agarrar um inimigo', [98], /agarrar/],
    ['como funciona cura natural', [108], /cinco dias/],
    ['o que são ases', [88], /abertos/],
    ['o que são ampliações', [88], /sucesso/],
    ['como funciona o dado selvagem', [88], /d6 extra/],
    ['o que é aparar', [18], /2 mais a metade/],
    ['o que é resistência', [18], /limiar de dano/],
    ['quantos pontos tenho para perícias', [17], /15 pontos/],
    ['quantos pontos tenho para atributos', [17], /5 pontos/],
    ['como subir de nível', [55], /5 pontos/],
    ['qual o dano de queda', [127], /1d6\+1/],
    ['como funciona o combate montado', [101], /montad/],
  ];
  for (const [q, pages, re] of cases) {
    const r = ask(q);
    assert.ok(['passage', 'entity'].includes(r.kind), `${q} → ${r.kind}`);
    assert.ok(r.source.some(s => pages.includes(s.page)), `${q} → páginas ${r.source.map(s => s.page)} (esperado ${pages})`);
    assert.match(flat(r), re, q);
  }
});

test('listas e comparações', () => {
  const powers = ask('quais poderes são do estágio heroico');
  assert.equal(powers.kind, 'list');
  assert.deepEqual(powers.blocks[1].items.map(i => i.label).sort(), ['Adivinhação', 'Drenar Pontos de Poder', 'Intangibilidade']);
  assert.equal(ask('quais raças existem').kind, 'list');
  const both = flat(ask('qual a diferença entre lutar e atirar'));
  assert.ok(both.includes('lutar') && both.includes('atirar'));
});

test('entende erros de digitação, sinônimos e conversa de acompanhamento', () => {
  assert.equal(ask('armdura').entity.name, 'Armadura');
  assert.equal(ask('qual a duracao de invisibilidde').entity.name, 'Invisibilidade');
  assert.ok(ask('quanto custa o feitiço Raio').entity.name === 'Raio');
  const first = ask('Qual o custo de Armadura?');
  const next = ask('e a duração?', { last: first.entity.id });
  assert.equal(next.entity.name, 'Armadura');
  assert.match(flat(next), /3 \(1\/rodada\)/);
  assert.equal(ask('e a duração?').kind, 'clarify');
  // uma pergunta nova sobre outro assunto não pode ser lida como continuação do item anterior
  const other = ask('Como funciona a cobertura?', { last: first.entity.id });
  assert.equal(other.kind, 'passage');
  assert.ok(other.source.some(s => s.page === 94));
  assert.equal(ask('Como funciona?', { last: first.entity.id }).entity.name, 'Armadura');
});

test('o que não está no livro não é inventado', () => {
  assert.equal(ask('receita de bolo de chocolate').kind, 'none');
  assert.equal(ask('qual a capital da França').kind, 'none');
  assert.ok(ask('oi').kind === 'greeting' && ask('valeu').kind === 'thanks');
});

test('toda pergunta pronta da árvore tem resposta do livro', () => {
  const questions = [...TOPICS.flatMap(t => t.questions), ...STARTER_QUESTIONS];
  assert.ok(questions.length >= 40);
  for (const q of questions) {
    const r = ask(q);
    assert.ok(r && ['entity', 'passage', 'list'].includes(r.kind), `${q} → ${r?.kind}`);
    assert.ok(r.source.length > 0, `${q} sem página`);
  }
});

test('as sugestões de próximo passo também funcionam (a árvore não termina em beco sem saída)', () => {
  for (const q of ['Qual o dano do Raio?', 'O que faz a vantagem Esquiva?', 'Qual o atributo de Lutar?', 'Qual a Resistência do Leão?', 'Quanto custa a Katana?', 'O que é a complicação Pacifista?']) {
    const r = ask(q);
    assert.ok(r.chips.length >= 2, q);
    for (const chip of r.chips) {
      const next = ask(chip.question, { last: r.entity?.id });
      assert.ok(next && next.kind !== 'none' && next.kind !== 'clarify', `${q} → "${chip.question}" → ${next?.kind}`);
    }
  }
});

test('responde rápido mesmo com perguntas estranhas', () => {
  const started = Date.now();
  for (const q of ['', '???', 'a', 'dano '.repeat(60), 'ÁÉÍÓÚ çãõ', '<script>alert(1)</script>', 'qual o dano da katana '.repeat(5)]) ask(q);
  assert.ok(Date.now() - started < 1500);
});
