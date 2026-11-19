import React, { useEffect, useRef, useState } from 'react';
import { navigate, loginThen } from '../../lib/router.js';
import { cloudConfigured } from '../../lib/supabase.js';
import { listMine } from '../../lib/cloud.js';
import { myMemberships, STATUS_LABEL } from '../../lib/tables.js';
import './home.css';

const SIDES = [4, 6, 8, 10, 12, 20, 100];

// Sorteio local uniforme (so para a demonstracao; nas mesas o servidor sorteia e registra).
function randomInt(n) {
  const limit = 0x100000000 - (0x100000000 % n);
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return (buf[0] % n) + 1;
}

function DiceDemo() {
  const [sides, setSides] = useState(20);
  const [roll, setRoll] = useState({ value: null, key: 0 });
  const [history, setHistory] = useState([]);
  const timer = useRef(null);
  const [shown, setShown] = useState(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => () => clearInterval(timer.current), []);
  function rollNow(s = sides) {
    clearInterval(timer.current);
    const value = randomInt(s);
    const finish = () => { setShown(value); setRoll(r => ({ value, key: r.key + 1 })); setHistory(h => [{ s, value, id: Date.now() + Math.random() }, ...h].slice(0, 6)); };
    if (reduced) return finish();
    let ticks = 0;
    timer.current = setInterval(() => {
      ticks += 1;
      if (ticks >= 9) { clearInterval(timer.current); finish(); } else setShown(randomInt(s));
    }, 55);
  }
  const best = roll.value === sides;
  const worst = roll.value === 1;
  return <div className="dice-demo" aria-label="Rolador de dados de demonstração">
    <div className="die-picker" role="group" aria-label="Escolha o dado">
      {SIDES.map(s => <button key={s} className={s === sides ? 'chip-btn on' : 'chip-btn'} aria-pressed={s === sides}
        onClick={() => { setSides(s); rollNow(s); }}>d{s}</button>)}
    </div>
    <button className={`big-die${best ? ' crit' : ''}${worst ? ' fumble' : ''}`} key={roll.key} onClick={() => rollNow()}
      aria-label={`Rolar d${sides}`}>
      <span className="big-die-face">{shown ?? `d${sides}`}</span>
      <span className="big-die-hint">{shown == null ? 'Clique para rolar' : best ? 'Máximo!' : worst ? 'Falha crítica…' : `d${sides}`}</span>
    </button>
    <p className="sr-only" role="status" aria-live="polite">{roll.value != null ? `Resultado: ${roll.value} no d${sides}` : ''}</p>
    <ol className="roll-trail" aria-label="Últimas rolagens">
      {history.map((h, i) => <li key={h.id} style={{ opacity: 1 - i * 0.14 }}>d{h.s}: <b>{h.value}</b></li>)}
      {!history.length && <li className="muted">Suas rolagens aparecem aqui.</li>}
    </ol>
    <p className="muted">Demonstração local. Nas mesas, o servidor sorteia e registra cada rolagem para todos verem.</p>
  </div>;
}

const FEATURES = [
  { rune: 'ᚠ', title: 'Fichas na nuvem', text: 'Crie com raças e arquétipos do livro, calcule pontos e níveis sozinho e leve suas fichas para qualquer aparelho. PDF editável continua disponível.', go: '/fichas', cta: 'Abrir a ficha' },
  { rune: 'ᚢ', title: 'Mesas e convites', text: 'Crie uma mesa pública ou privada, convide por link ou código e aprove quem entra. O mestre decide, inclusive expulsar.', go: '/mesas', cta: 'Ver as mesas' },
  { rune: 'ᚦ', title: 'Sala em tempo real', text: 'Chat com sussurros, quem está online, selo do mestre e Vida, Stamina e Mana de todo o grupo ao vivo.', go: '/mesas', cta: 'Entrar numa sala' },
  { rune: 'ᚨ', title: 'Dados confiáveis', text: 'De d4 a d100, vantagem e desvantagem, dado selvagem de Savage Worlds e rolagens secretas do mestre. Quem sorteia é o servidor.', go: '/mesas', cta: 'Rolar na mesa' },
  { rune: 'ᚱ', title: 'Tabuleiro compartilhado', text: 'Mapa enviado pelo mestre, grade, zoom, tokens que todos veem se moverem e marcadores no mapa.', go: '/mesas', cta: 'Ir ao tabuleiro' },
  { rune: 'ᚲ', title: 'Livro e regras', text: 'Consulte o livro, o catálogo de vantagens e os poderes sem sair da ficha, com busca e páginas originais.', go: '/fichas', cta: 'Consultar o livro' },
];

const STEPS = [
  { title: 'Crie sua ficha', text: 'Escolha raça e arquétipo, distribua atributos e perícias e acompanhe os pontos sobrando em tempo real.', go: '/fichas', cta: 'Criar ficha' },
  { title: 'Monte ou entre numa mesa', text: 'Como mestre, crie a mesa e mande o link. Como jogador, peça entrada e vincule sua ficha.', go: '/mesas', cta: 'Ver mesas' },
  { title: 'Jogue junto', text: 'Na sala, converse, role dados, mova tokens no mapa e veja a vida do grupo. Tudo sincronizado.', go: '/mesas', cta: 'Abrir uma sala' },
];

function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!('IntersectionObserver' in window)) { el.classList.add('in'); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add('in'); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}
const Reveal = ({ children, className = '' }) => { const ref = useReveal(); return <div ref={ref} className={`reveal ${className}`}>{children}</div>; };

function Grimoire({ auth }) {
  const [sheets, setSheets] = useState(null);
  const [tables, setTables] = useState(null);
  useEffect(() => {
    if (!auth.user) return;
    listMine().then(setSheets).catch(() => setSheets([]));
    myMemberships().then(setTables).catch(() => setTables([]));
  }, [auth.user?.id]);
  if (!auth.user) return null;
  return <Reveal className="grimoire card-like">
    <div className="grimoire-head"><p className="eyebrow">SEU GRIMÓRIO</p><h2>Olá, {auth.profile?.display_name || 'aventureiro'}</h2></div>
    <div className="grimoire-cols">
      <div>
        <h3>Suas fichas {sheets && <span className="pill">{sheets.length}</span>}</h3>
        {!sheets ? <p className="muted">Carregando…</p> : !sheets.length ? <p className="muted">Nenhuma ficha na nuvem ainda.</p> :
          <ul className="mini-list">{sheets.slice(0, 4).map(s => <li key={s.id}><button className="text-button" onClick={() => navigate('/fichas')}>{s.name || 'Sem nome'} <span className="muted">v{s.revision}</span></button></li>)}</ul>}
        <button className="outline" onClick={() => navigate('/fichas')}>Abrir fichas</button>
      </div>
      <div>
        <h3>Suas mesas {tables && <span className="pill">{tables.length}</span>}</h3>
        {!tables ? <p className="muted">Carregando…</p> : !tables.length ? <p className="muted">Você ainda não está em nenhuma mesa.</p> :
          <ul className="mini-list">{tables.slice(0, 4).map(r => <li key={r.tables.id}><button className="text-button" onClick={() => navigate(r.status === 'approved' ? `/sala/${r.tables.id}` : `/mesa/${r.tables.id}`)}>
            {r.tables.name} <span className="muted">{r.role === 'gm' ? 'mestre' : r.status === 'pending' ? 'aguardando' : STATUS_LABEL[r.tables.status].toLowerCase()}</span></button></li>)}</ul>}
        <button className="outline" onClick={() => navigate('/mesas')}>Ir às mesas</button>
      </div>
    </div>
  </Reveal>;
}

export default function HomePage({ auth }) {
  const [step, setStep] = useState(0);
  const loggedIn = Boolean(auth.user);
  const cur = STEPS[step];
  const goSheets = () => (cloudConfigured && !loggedIn ? loginThen('/fichas') : navigate('/fichas'));
  const go = path => (path === '/fichas' ? goSheets() : navigate(path));
  return <main className="home">
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">ASCENSIA RPG</p>
        <h1>Sua mesa de RPG, <em>onde você estiver</em></h1>
        <p className="lead">Fichas de Savage Worlds, salas em tempo real, dados que ninguém pode forjar e um tabuleiro para o grupo inteiro. Tudo no navegador, sem instalar nada.</p>
        <div className="cta-row">
          <button className="primary big" onClick={goSheets}>{loggedIn ? 'Abrir minhas fichas' : 'Criar minha ficha'}</button>
          {cloudConfigured && (loggedIn
            ? <button className="outline big" onClick={() => navigate('/mesas')}>Minhas mesas</button>
            : <button className="outline big" onClick={() => loginThen('/')}>Entrar ou criar conta</button>)}
        </div>
        <ul className="hero-facts" aria-label="Destaques">
          <li><b>Grátis</b><span>sem instalar</span></li>
          <li><b>Ao vivo</b><span>chat, dados e mapa</span></li>
          <li><b>Seu grupo</b><span>mestre no comando</span></li>
        </ul>
      </div>
      <DiceDemo />
    </section>

    <Grimoire auth={auth} />

    <section className="band" aria-labelledby="como">
      <Reveal>
        <p className="eyebrow">COMO FUNCIONA</p>
        <h2 id="como">Da ficha à aventura em três passos</h2>
        <div className="steps" role="tablist" aria-label="Passos">
          {STEPS.map((s, i) => <button key={s.title} role="tab" aria-selected={i === step} className={i === step ? 'step on' : 'step'} onClick={() => setStep(i)}>
            <span className="step-n">{i + 1}</span>{s.title}</button>)}
        </div>
        <div className="step-panel" role="tabpanel" key={step}>
          <p>{cur.text}</p>
          <button className="primary" onClick={() => go(cur.go)}>{cur.cta} →</button>
        </div>
      </Reveal>
    </section>

    <section aria-labelledby="recursos">
      <Reveal><p className="eyebrow">TUDO PARA A SESSÃO</p><h2 id="recursos">Feito para jogar, não para configurar</h2></Reveal>
      <div className="feature-grid">
        {FEATURES.map((f, i) => <Reveal key={f.title} className="feature" >
          <article className="feature-card" style={{ '--delay': `${i * 60}ms` }}>
            <span className="rune" aria-hidden="true">{f.rune}</span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
            <button className="text-button" onClick={() => go(f.go)}>{f.cta} →</button>
          </article>
        </Reveal>)}
      </div>
    </section>

    <Reveal className="final-cta">
      <h2>Chame o grupo. A mesa está posta.</h2>
      <p>Crie sua conta em segundos e monte a primeira sala hoje.</p>
      <div className="cta-row">
        <button className="primary big" onClick={() => (loggedIn ? navigate('/mesas') : loginThen('/mesas'))}>{loggedIn ? 'Criar uma mesa' : 'Começar agora'}</button>
        <button className="outline big" onClick={goSheets}>Ver as fichas</button>
      </div>
    </Reveal>
    <footer className="home-foot muted">Ascensia RPG · ficha e mesa para Savage Worlds</footer>
  </main>;
}
