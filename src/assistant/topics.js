// A "árvore" do assistente: assuntos (nível 1) → perguntas prontas (nível 2). Cada pergunta é respondida pelo motor com
// o texto do livro; depois de cada resposta o motor sugere o próximo passo (nível 3). O teste confere que toda pergunta
// pronta tem resposta no livro.
export const TOPICS = [
  { id: 'criacao', label: 'Criação', icon: '🧙', questions: [
    'Como criar um personagem?',
    'Quantos pontos tenho para atributos?',
    'Quantos pontos tenho para perícias?',
    'O que são arquétipos?',
    'Quais raças existem?',
    'O que é Aparar?',
    'O que é Resistência?',
  ] },
  { id: 'pericias', label: 'Perícias', icon: '🎯', questions: [
    'Quais perícias existem?',
    'Como funciona a perícia Lutar?',
    'Como funciona a perícia Furtividade?',
    'Qual o atributo de Atirar?',
    'Quais perícias usam Astúcia?',
  ] },
  { id: 'vantagens', label: 'Vantagens', icon: '⭐', questions: [
    'Quais vantagens existem?',
    'Quais vantagens de combate existem?',
    'O que faz a vantagem Esquiva?',
    'Quais os requisitos de Mago?',
    'Como funciona a vantagem Ambidestro?',
  ] },
  { id: 'complicacoes', label: 'Complicações', icon: '⚠️', questions: [
    'Quais complicações existem?',
    'Quais complicações menores existem?',
    'O que é a complicação Pacifista?',
    'Quantos pontos ganho com Complicações?',
  ] },
  { id: 'poderes', label: 'Poderes', icon: '✨', questions: [
    'Quais poderes existem?',
    'Quais poderes são do estágio Novato?',
    'Como funcionam os Pontos de Poder?',
    'Como recupero Pontos de Poder?',
    'Qual o dano do Raio?',
    'Como funciona o poder Cura?',
  ] },
  { id: 'combate', label: 'Combate', icon: '⚔️', questions: [
    'Como funciona a iniciativa?',
    'O que é estar Abalado?',
    'Como funcionam os ferimentos?',
    'Como funciona a cobertura?',
    'Como funciona o fogo automático?',
    'Como agarrar um inimigo?',
    'Como funciona a cura natural?',
  ] },
  { id: 'dados', label: 'Dados e Benes', icon: '🎲', questions: [
    'Como funcionam os Benes?',
    'O que são Ases?',
    'O que são ampliações?',
    'Como funciona o Dado Selvagem?',
    'O que é um Curinga?',
  ] },
  { id: 'equipamento', label: 'Equipamento', icon: '🛡️', questions: [
    'Qual o dano da Espada Longa?',
    'Quanto custa a Katana?',
    'Quanto de armadura dá a Cota de Malha?',
    'Quanto pesa o Arco Longo Inglês?',
    'Qual o dano da Glock?',
  ] },
  { id: 'bestiario', label: 'Bestiário', icon: '🐉', questions: [
    'Quais criaturas existem?',
    'Qual a Resistência do Leão?',
    'Quais os atributos do Dragão?',
    'O que significa Tamanho?',
  ] },
  { id: 'evolucao', label: 'Evolução', icon: '📈', questions: [
    'Como subir de nível?',
    'O que são Estágios?',
    'O que posso fazer com um Progresso?',
  ] },
];

// Quatro perguntas de boas-vindas (como no exemplo: "Comece por aqui").
export const STARTER_QUESTIONS = [
  'Como funcionam os Benes?',
  'Qual o dano do Raio?',
  'Como funciona a cobertura?',
  'Como criar um personagem?',
];
