import React from "react";
import Templates from "../../Templates.jsx";
import "./guide.css";

const STEPS = [
  {
    title: "Defina quem é o personagem",
    body: [
      "Comece pelo módulo Identidade: nome, conceito (uma frase que resume o personagem, como “barda elfa, arco e canções arcanas”), idade, vila de origem e o seu nome como jogador.",
      "Crie o token em Identidade → Criar token. É a imagem que representa o personagem no tabuleiro da mesa.",
    ],
  },
  {
    title: "Escolha a raça",
    body: [
      "Na aba Raças, logo abaixo, aplique uma das 11 raças do livro. Os traços entram nos cálculos sozinhos: atributos que já começam em d6, perícia gratuita, Resistência e Movimento ajustados.",
      "O humano começa com d4 nos cinco atributos e a primeira vantagem da lista é gratuita. Trocar de raça depois mantém os avanços que você já pagou nos atributos.",
    ],
  },
  {
    title: "Parta de um arquétipo (opcional)",
    body: [
      "Os 16 arquétipos prontos carregam atributos, perícias e vantagens de uma vez, e servem de ponto de partida: depois você ajusta nos módulos da ficha. Se nenhum servir, use Criar o meu e monte o seu, com o saldo de pontos à vista antes de aplicar.",
      "Aplicar um arquétipo substitui atributos, perícias e vantagens da ficha, por isso o app pede confirmação.",
    ],
  },
  {
    title: "Distribua os atributos",
    body: [
      "Módulo Atributos. São cinco, todos começam em d4 (a raça pode elevar alguns): Agilidade (mobilidade e ataques à distância), Astúcia (aprendizado e conhecimentos), Espírito (vontade, magia e mana), Força (dano corpo a corpo e carga) e Vigor (vida, stamina e resistência).",
      "Cada degrau de dado custa 2 pontos: d6 custa 2, d8 custa 4, d10 custa 6 e d12 custa 8. O máximo é d12.",
    ],
  },
  {
    title: "Escolha as perícias",
    body: [
      "Módulo Perícias, em abas por atributo. Cada perícia custa 1 ponto por degrau a partir do d4: d4 custa 1, d6 custa 2, d8 custa 3, d10 custa 4 e d12 custa 5.",
      "Pense nas básicas: sem Nadar o personagem se afoga ao ser submergido, e sem Perceber ele não identifica armadilhas. Lutar define o Aparar, e Conjurar e Meditar são as perícias da magia.",
    ],
  },
  {
    title: "Vantagens, complicações e poderes",
    body: [
      "Módulo Vantagens. Cada complicação rende pontos: menor +3 e maior +5. Cada vantagem custa 1 ponto a mais que a anterior (a 1ª custa 1, a 2ª custa 2, a 3ª custa 3…). A primeira vantagem do humano é gratuita, e uma vantagem pode ser repetida pelo mesmo custo da posição dela. Os pré-requisitos do livro continuam valendo, e o catálogo avisa o que falta.",
      "Quem usa magia precisa de Antecedente Arcano. Cada vantagem Pontos de Poder soma +10 de mana. Os poderes ficam em Magia e bagagem, com busca no livro.",
    ],
  },
  {
    title: "Confira o orçamento de pontos",
    body: [
      "A ficha começa com 30 pontos, mais 2 por nível (cada 5 XP sobe um nível), mais os pontos das complicações. O painel Pontos de criação, ao lado, mostra o total, o que você já gastou e quanto ainda tem livre. Ele fica vermelho se você passar do orçamento.",
    ],
  },
  {
    title: "Compre o equipamento",
    body: [
      "Todo personagem começa com $ 500. No Mercado, compre armas, armaduras, escudos, munição e itens do livro, e equipe o que o personagem usa. Armaduras somam na Resistência e armas e escudos somam no Aparar, automaticamente. Um item por espaço do corpo, e o peso acima de 2,5 × Força (em kg) tira Movimento.",
    ],
  },
  {
    title: "Confira os números derivados",
    body: [
      "O app calcula sozinho: Movimento = soma dos dados dos atributos ÷ 12 (arredondado para baixo, mínimo 1), Aparar = 2 + metade do dado de Lutar, Resistência = 2 + metade do Vigor + armadura, Vida e Stamina = Vigor, e Mana = 10 + 2 × Espírito (+10 por Pontos de Poder).",
    ],
  },
  {
    title: "Conte a história e leve para a mesa",
    body: [
      "Módulo História: de onde o personagem veio, o que procura e por que está com o grupo. A ficha salva sozinha na sua conta, a cada alteração.",
      "Na sala, aba Mesa, escolha esta ficha em “Sua ficha nesta mesa” e use Colocar meu token no tabuleiro. Combine com o mestre os pontos extras, o acesso inicial à magia e qualquer requisito que a ficha não consiga conferir.",
    ],
  },
];

// Guia de criação: passo a passo para montar uma ficha e os atalhos do livro (raças, arquétipos, arquétipo próprio).
export default function GuideTab({ c, setC, setConfirm }) {
  return (
    <>
      <p className="intro">
        Siga os passos para montar a ficha. Você pode voltar a qualquer um: tudo é recalculado na hora.
      </p>
      <ol className="guide-steps">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <span className="guide-num" aria-hidden="true">{i + 1}</span>
            <div>
              <h3>{step.title}</h3>
              {step.body.map(text => <p key={text}>{text}</p>)}
            </div>
          </li>
        ))}
      </ol>

      <table className="guide-costs">
        <caption>Resumo dos custos</caption>
        <thead><tr><th>Dado</th><th>Atributo (custo total)</th><th>Perícia (custo total)</th></tr></thead>
        <tbody>
          {[["d4", "—", "1"], ["d6", "2", "2"], ["d8", "4", "3"], ["d10", "6", "4"], ["d12", "8", "5"]].map(([die, attr, skill]) => (
            <tr key={die}><th scope="row">{die}</th><td>{attr}</td><td>{skill}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="muted guide-note">Os valores são o custo total para chegar àquele dado, partindo do d4 do atributo ou do início da perícia. Complicação menor +3, maior +5; vantagens custam 1, 2, 3…</p>

      <h3 className="guide-shortcuts">Atalhos do livro</h3>
      <Templates character={c} onChange={setC} onLoad={(title, action) => setConfirm({title, text:"A ficha atual será substituída. Salve seu PDF antes de continuar se quiser guardá-la.", action})} />
    </>
  );
}
