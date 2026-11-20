import { useCallback, useRef, useState } from 'react';
import { TOPICS, STARTER_QUESTIONS } from './topics.js';
import { bookFailureMessage } from './bookAccess.js';

const MIN_TYPING_MS = 380; // dá tempo de ler que está "procurando"
const TOPIC_CHIP_PREFIX = '__topic:';
const SUGGESTED_TOPICS = 6;

const welcome = () => ({
  id: 0, role: 'bot', source: [], chips: STARTER_QUESTIONS.map(q => ({ label: q, question: q })),
  blocks: [
    { type: 'text', text: 'Oi! **Pergunte o que quiser** sobre as regras: poderes, vantagens, perícias, combate, equipamentos ou criaturas.' },
    { type: 'text', text: 'Eu respondo **só com o que está no livro** e digo de qual página tirei (se o seu mestre mudou alguma regra, vale a palavra dele). Para ver tudo, toque em **Ver todas as perguntas**.' },
    { type: 'text', text: 'Comece por aqui:' },
  ],
});

const failureReply = error => ({ role: 'bot', blocks: [{ type: 'text', text: bookFailureMessage(error) }], source: [], chips: [], reply: true });

// Sem resposta no livro: oferece os assuntos da árvore em vez de deixar o usuário num beco sem saída.
function withTopicChips(result) {
  const lost = ['none', 'clarify'].includes(result.kind);
  if (!lost) return result.chips;
  const topicChips = TOPICS.slice(0, SUGGESTED_TOPICS).map(t => ({ label: `${t.icon} ${t.label}`, question: `${TOPIC_CHIP_PREFIX}${t.id}` }));
  return [...(result.chips || []), ...topicChips];
}

// A conversa: mensagens, pergunta em digitação e a lista "todas as perguntas". Nada aqui sabe onde o painel está na tela.
export function useConversation() {
  const [messages, setMessages] = useState(() => [welcome()]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const counter = useRef(1);
  const lastEntity = useRef(null);
  const brain = useRef(null);

  const push = useCallback(message => setMessages(prev => [...prev, { id: counter.current++, ...message }]), []);

  const ask = useCallback(async (question, shown) => {
    const q = String(question || '').trim();
    if (!q || busy) return;
    setShowAll(false);
    push({ role: 'user', text: shown || q });
    setInput('');
    setBusy(true);
    const started = Date.now();
    try {
      if (!brain.current) brain.current = await (await import('./brain.js')).loadBrain();
      const result = brain.current.ask(q, { last: lastEntity.current });
      if (result?.entity) lastEntity.current = result.entity.id;
      await new Promise(resolve => setTimeout(resolve, Math.max(0, MIN_TYPING_MS - (Date.now() - started))));
      push({ role: 'bot', blocks: result.blocks, source: result.source, chips: withTopicChips(result), reply: true });
    } catch (error) {
      push(failureReply(error));
    } finally {
      setBusy(false);
    }
  }, [busy, push]);

  const openTopic = useCallback(topic => {
    setShowAll(false);
    push({ role: 'user', text: `${topic.icon} ${topic.label}` });
    push({ role: 'bot', source: [], reply: true, blocks: [{ type: 'text', text: `Sobre **${topic.label}**, o que você quer saber?` }], chips: topic.questions.map(q => ({ label: q, question: q })) });
  }, [push]);

  // Chips especiais "__topic:id" voltam para o nível 1 da árvore.
  const onAsk = useCallback(question => {
    const topic = String(question).startsWith(TOPIC_CHIP_PREFIX) && TOPICS.find(t => `${TOPIC_CHIP_PREFIX}${t.id}` === question);
    if (topic) openTopic(topic); else ask(question);
  }, [ask, openTopic]);

  return { messages, input, setInput, busy, showAll, setShowAll, ask, openTopic, onAsk };
}
