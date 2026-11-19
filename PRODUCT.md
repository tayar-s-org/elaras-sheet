# Produto — Crônicas de Manrakora

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

O público atual é o grupo de amigos que joga RPG junto na campanha.

- **Jogadores de Savage Worlds** criam e editam fichas, vinculam personagens à mesa e usam a sala durante a sessão. Entre sessões, podem planejar rotinas e acompanhar o progresso.
- **Mestres** organizam a mesa, administram convites e aprovações, conduzem a sessão e gerenciam mapa, criaturas, recompensas e tempo de campanha.

## Product Purpose

Reunir preparação, sessão e evolução de personagem para Crônicas de Manrakora. Um jogador consegue levar a mesma ficha da preparação à sessão e acompanhar o que mudou depois. O mestre consegue administrar o grupo e conduzir o jogo usando os dados da mesa.

## Positioning

O produto conecta ficha editável, regras adaptadas da campanha e mesa virtual. Um personagem vinculado pode rolar com base na ficha, aparecer no tabuleiro, receber recompensas e evoluir conforme o calendário e as rotinas aprovadas.

## Operating Context

- **Preparação:** consultar o livro e os catálogos, montar a ficha, criar mesa ou entrar por convite e vincular o personagem.
- **Sessão:** usar chat, presença, mapa compartilhado, tokens, rolagens e recursos correntes. O mestre dispõe de controles próprios.
- **Entre sessões:** editar rotinas, organizar dias de campanha e acompanhar treino, trabalho, estudo, aptidão e evolução.
- **Portabilidade:** importar e exportar PDFs editáveis pelo app. A instalação com Supabase oferece conta e sincronização.

## Capabilities and Constraints

- A ficha permanente, o estado corrente da sessão e o progresso por atividade têm registros próprios.
- O mestre controla participação, aprovações, concessões e avanço do relógio. As ações dependem das permissões da mesa.
- A aplicação usa termos em português do Brasil e regras de Savage Worlds adaptadas à campanha. XP geral da ficha, estágio do catálogo e XP de treinamento têm usos distintos.
- O nível de proteção deve ser proporcional ao uso entre amigos. Em operações de criação, leitura, edição e exclusão, preserve as permissões de jogador e mestre. Um jogador não pode alterar fichas ou outros dados que pertencem a outro jogador. As regras da campanha estão em `src/rules.js`, `src/rpg/` e nas migrações SQL.

## Evidence on Hand

- A [página inicial](src/features/home/HomePage.jsx) apresenta os fluxos de ficha, entrada na mesa e jogo em grupo.
- O [README](README.md) registra regras da campanha e compatibilidade de PDF. As seções sobre compartilhamento via Node descrevem o servidor legado.
- O texto e as páginas do livro ficam em `public/assets/`. Os catálogos estruturados incluem `src/races.json`, `src/archetypes.json` e `src/catalog.json`.

## Product Principles

Princípios baseados nos fluxos existentes e nas permissões confirmadas pelo responsável.

1. Preservar a continuidade da ficha entre preparação, jogo e evolução.
2. Deixar claras as ações disponíveis a cada papel e impedir que jogadores alterem dados de outros jogadores.
3. Apresentar separadamente os recursos da sessão, as mudanças permanentes e os saldos de treino.
4. Aplicar a terminologia e as regras da campanha de forma consistente entre ficha, sala e registros.
