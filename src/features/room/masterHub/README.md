# Central do Mestre

Camada administrativa **sobre** os sistemas do RPG (ficha, mochila, XP, dinheiro, tokens, mapas, música, soundpad). Não guarda uma
segunda versão dos dados do jogo: cada módulo lê e escreve nas fontes que já existiam, por RPCs do mestre que registram tudo num
histórico. Migração: `supabase/migrations/0040_master_hub.sql`. Teste de banco: `node scripts/masterHubDbTest.mjs`.

## Onde está cada coisa

| Parte | Arquivo |
|---|---|
| Painel (identidade da campanha, botões, região animada, minimizar) | `src/features/room/masterHub/MasterHub.jsx` + `masterHub.css` (reusa as classes `.bsp-*` do painel da ficha) |
| Lista e ordem dos módulos (`needsHub`) | `src/features/room/masterHub/core.js` → `MASTER_MODULES` |
| Chave → componente | `src/features/room/masterHub/modules.jsx` |
| Módulos | `src/features/room/masterHub/modules/*` |
| Lote, ids pendentes, prévia, texto do histórico (puro, testado) | `src/features/room/masterHub/core.js` (+ `core.test.js`) |
| Seletor de alvo, `useMasterRun`, `BatchResults` | `src/features/room/masterHub/ui.jsx` |
| Moedas/carteiras/experiências (uma cópia por sala, Realtime) | `src/features/room/masterHub/extras.jsx` (`useTableExtras`, `useExtras`, `useCharacterConditions`) |
| RPCs, reenvio idempotente, capacidade, leituras | `src/lib/masterHub.js` |
| Formato de condições (compartilhado com criaturas) | `src/tokenState.js` (`effectsOf`, `addEffect`, `conditionsOf`, `tokenEffects`) |
| Chips de condição | `src/features/sheet/ActiveConditions.jsx` |

A Central é montada em `BoardView.jsx` (só para o mestre) e recebe `tools`, que liga os botões aos estados que o `BoardView` já tinha
(`maker`, `masterOpen`, `mapTools`, `audioOpen`): os modais de criatura, predefinições, tokens, mapas, música e soundpad são os de
sempre. Os 5 botões do mestre saíram da barra do tabuleiro; agora são abertos pela Central.

## Tabelas (todas com RLS; **nenhuma tem política de escrita**: só os RPCs escrevem)

| Tabela | Conteúdo | Leitura |
|---|---|---|
| `master_audit_log` | histórico: `table_id, actor_id, character_id, category, kind, summary, before, after, note, request_id, created_at` | só o mestre (`is_gm`) |
| `table_currencies` | moedas da mesa (`name, symbol, description, rate` informativa; no máx. 20) | membros da mesa |
| `character_wallets` | saldo por personagem e moeda (`0..999.999.999`) | dono do personagem e mestre |
| `table_experience_types` | tipos de experiência (`name, description, icon, category`; no máx. 20) | membros da mesa |
| `character_experience` | contador por personagem e tipo (`0..1.000.000`) | **todos os membros da mesa** (migração 0042: públicas como o XP) |

Integridade: `unique(table_id, id)` nas definições; carteiras e contadores têm FK **composta** `(table_id, currency_id|type_id)` →
definição (uma moeda/tipo de outra mesa é recusada), FK `character_id → characters on delete cascade`, `unique(character_id, currency_id|type_id)`
e `check` de faixa. O RPC confere que o personagem é membro **aprovado** da mesa. Apagar moeda/tipo apaga os saldos em cascata e só
passa com `p_force = true` quando há saldo (a interface mostra quantos personagens serão afetados e o histórico guarda os valores apagados).

Realtime: as 4 tabelas de definições/saldos estão na publicação (`replica identity full`). `master_audit_log` não precisa (lido ao abrir).

## RPCs (todos `security definer`, só `authenticated`, todos exigem **mestre da mesa**)

Todos recebem `p_request_id uuid` (um por alvo) e devolvem `jsonb { ok, replayed, category, kind, summary, before, after }`.

| RPC | O que faz | Limites |
|---|---|---|
| `gm_adjust_money(table, character, mode, amount, note, request)` | `add` (com sinal) ou `set` em `characters.data.money`; grava `money_awards` como `grant_money` | add ±1.000.000, set 0..999.999.999 |
| `gm_adjust_xp(...)` | idem para `data.xp` + `xp_awards` | add ±10.000, set 0..1.000.000 |
| `gm_give_items(table, character, id, custom, qty, note, request)` | chama `gm_give_item` (que continua igual) e registra antes/depois | qty 1..99 |
| `gm_upsert_currency` / `gm_delete_currency` | criar/editar/apagar moeda (`p_force`) | nome único (sem diferenciar maiúsculas) |
| `gm_wallet_adjust(table, character, currency, mode, amount, note, request)` | soma/define o saldo | 0..999.999.999 |
| `gm_upsert_experience_type` / `gm_delete_experience_type` | tipos de experiência | idem |
| `gm_experience_adjust(table, character, type, mode, amount, note, request)` | soma/define o contador | 0..1.000.000 |
| `gm_set_conditions(table, character, conditions, note, request)` | troca a lista de condições (máx. 8, rótulo único, `note`/`duration` opcionais) | — |
| `master_hub_version()` | sonda de capacidade (devolve 1) | qualquer autenticado |

Internos (sem permissão para ninguém): `mh_begin`, `mh_log`, `mh_clean_conditions`, `state_keep_conditions`.

`grant_money`, `grant_xp` e `gm_give_item` **não foram reescritas**. Com a migração aplicada, `lib/money.js` (`grantMoney`), `lib/xp.js`
(`grantXp`) e `lib/items.js` (`giveItem`) passam a chamar os RPCs novos (idempotentes e registrados no histórico); sem ela, usam os antigos.
Assim o Grupo (`MoneyGrant`, `XpGrant`, `GmItemsModal`) também aparece no histórico.

### Dinheiro e XP × ficha aberta do jogador
O app do jogador reconcilia pela **ficha** (`sheetRebase.js`: `rewardDelta` compara `xp`/`money` da nuvem com a base local), não pela soma
de `money_awards`/`xp_awards`; essas linhas servem de aviso (Realtime) e de registro na mesa. Por isso o RPC grava o valor exato na
ficha e uma linha de fila com o **delta efetivo**. `money_awards.amount` só aceita ±1.000.000 e `xp_awards.amount` ±10.000 (constraints
existentes): ao *definir* um valor com variação maior, a linha da fila fica no teto e a nota ganha `[variação real: N]`; a ficha e o
histórico guardam o valor exato.

### Condições
Personagens: `table_character_state.state.conditions` (mesmo formato dos efeitos de criatura: `{id,label,icon[,note][,duration]}`).
Só `gm_set_conditions` altera a chave. O gatilho `state_keep_conditions` (BEFORE INSERT/UPDATE) preserva `conditions` em qualquer outra
escrita (jogador, `PartyPanel`, upsert do PostgREST — que passa pelo caminho de UPDATE com `OLD` —, funções de rotina como `advance_time`),
exceto quando o RPC liga a flag de transação `elara.mh`. Escritores conhecidos de `state`: `saveState` (`PartyPanel.change/setFaint`, agora com
spread do estado), `useRoom.patchState` (mescla e mantém `conditions`) e as funções SQL das migrações 0024/0025/0026/0031 (releem o estado
travado e regravam, preservando chaves extras). Criaturas: continuam em `board_tokens.effects`. O token escolhe a fonte por
`tokenEffects(token, states)`. A duração é só texto (não expira sozinha).

## Idempotência (contrato)
1. A ação gera **um `request_id` por alvo** e o reutiliza em qualquer reenvio (`runBatch`, `core.js`); ids de resultado incerto ficam em
   `sessionStorage` até haver resposta definitiva (sobrevivem a recarregar a página).
2. `callIdempotent` (`lib/masterHub.js`) reenvia com **os mesmos argumentos** (até 3x, com espera) em erro de rede/timeout; se acabar sem
   resposta, o erro sai com `uncertain = true`.
3. Servidor: `pg_advisory_xact_lock(hash(request_id))`, procura em `master_audit_log` por `(request_id, character_id)`; se achar, devolve o
   resultado gravado com `replayed = true`, sem reaplicar. `unique(request_id, coalesce(character_id, 0))` garante no banco. Reusar o id
   em outra categoria é recusado.

## Sincronização
Uma fonte por dado (ficha: dinheiro/XP/mochila; `state.conditions`; tabelas novas). **Sem atualização otimista** nas ações do mestre:
a interface espera o RPC, mostra o antes → depois devolvido pelo servidor e relê (`useTableExtras`: Realtime, releitura ao reconectar
o canal, ao voltar o foco e a cada 30 s). Em lote, cada alvo tem resultado individual (✓ aplicado, ↻ já aplicado antes, ✗ erro) e "Tentar
de novo os que falharam" (mesmos ids). A exceção consciente é o efeito de **criatura** (`setTokenEffects` atualiza o token na hora e
recarrega em caso de erro, como o painel da criatura já fazia).

## Implantação (ordem)
1. Aplicar `0040` (`node scripts/db.mjs --file supabase/migrations/0040_master_hub.sql`; aditiva, pode ser repetida).
2. Validar: `node scripts/masterHubDbTest.mjs` (contas descartáveis `elara.teste.mh*`, apaga tudo no fim).
3. Publicar o app. A Central verifica `master_hub_version()` ao montar: sem a migração mostra "Falta aplicar a migração 0040" e **não chama
   nenhuma função inexistente**; os módulos de ferramentas (criaturas, mapas, música, soundpad) e Jogadores funcionam mesmo assim.

## Como adicionar um módulo
1. `core.js`: uma linha em `MASTER_MODULES` (`key`, `label`, `needsHub: true` se usa a migração).
2. `modules/MeuModulo.jsx`: componente `({ ctx })`. `ctx` traz `tableId, closed, players, members, characters, states, extras, board, tokens, pad, tools, sheets, auth, selectedPlayer, setSelectedPlayer, campaign`.
3. `modules.jsx`: `meu: MeuModulo`.
4. Se muda dados: criar o RPC na próxima migração seguindo o padrão (`mh_begin` → trava `for update` → muda → `mh_log`), conceder só a `authenticated`, adicionar a
   categoria em `master_audit_log.category` (check) e em `AUDIT_CATEGORIES`/`auditDetails` (`core.js`), expor o wrapper em `lib/masterHub.js`
   e usar `useMasterRun` (confirmação + lote + resultado individual) na interface.
5. Testes: puros em `core.test.js` (entram no `npm test`) e casos de permissão/idempotência/concorrência em `scripts/masterHubDbTest.mjs`.

## Permissões de leitura (resumo)
Condições e **experiências personalizadas**: públicas à mesa (como o XP e os efeitos do token; aparecem na ficha, no Grupo e no resumo do token de cada personagem). Carteira de moedas: dono do personagem e mestre (os outros jogadores **não** veem).
Definições de moeda/experiência: membros. Histórico: só o mestre. Escrita: nenhuma direta; só os RPCs.

## Loja do Mestre (migração `0041_master_shop.sql`)

Itens criados pelo mestre, vendidos aos jogadores por uma **moeda da mesa** (as de `table_currencies`). O `$` da ficha e o Mercado do livro não mudam.

| Parte | Onde |
|---|---|
| Tabela | `table_shop_items` (`name, weight, effects, description` no mesmo modelo dos itens customizados + `currency_id, price, active`); FK composta `(table_id, currency_id)` com `on delete restrict` (a moeda não pode ser apagada enquanto houver item à venda nela); leitura: o mestre vê todos, membros veem só os `active`; sem política de escrita |
| RPCs do mestre | `gm_shop_upsert(table, id, custom, currency, price, active, request)` (criar/editar; `custom` nulo mantém o item; `active` pausa sem apagar; máx. 100 itens, preço 1..999.999.999) e `gm_shop_delete(table, id, request)` |
| RPC do jogador | `shop_buy(table, character, listing, qty, request)` — só para o **próprio** personagem (`owns_character`), membro aprovado, mesa não encerrada, qtd 1..99. Numa transação: trava a ficha e a carteira (nessa ordem), confere o saldo (`Saldo insuficiente`), debita e põe `custom-<id do anúncio>` na mochila (`inv_put`: compras repetidas empilham, teto de 99 por item). Idempotente por `request_id` |
| Histórico | categoria `item`, kinds `shop_create`, `shop_update`, `shop_delete`, `shop_buy` (na compra o responsável é o jogador que comprou; só o mestre lê o histórico) |
| Capacidade | `master_hub_version()` passou a devolver **2**; a interface só liga a loja com a versão 2 (`masterHubVersion` em `lib/masterHub.js`). A versão **3** (migração `0043_shop_money_price.sql`) liga o preço em `$` |
| Preço em dinheiro ($) | `currency_id` nulo = pago em `$`. `shop_buy` debita `characters.data.money` (mesma transação, ficha travada) e grava uma linha negativa já resgatada em `money_awards` (teto de ±1.000.000, valor real na nota), igual a `gm_adjust_money`, então o `useRewardSync`/`sheetRebase` do jogador reconciliam sem falso conflito. Na tela o `$` é a opção `money` (`MONEY_CURRENCY` em `market/shop.js`) e `upsertShopItem` converte para nulo. Isto não converte moeda em `$`: só deixa o mestre cobrar em `$` |
| Regras puras | `src/market/shop.js` (+ `shop.test.js`) |
| Mestre — criar e vender | `ShopSaleOptions.jsx` (moeda já existente + preço + "vender na loja") na Central (módulo Itens › Criar item › "Colocar à venda") e na janela "Entregar itens" do Grupo; `modules/ShopManager.jsx` (trocar moeda/preço, pausar, tirar da loja) |
| Jogador — comprar | `src/features/sheet/MasterShop.jsx`, aba "Loja do Mestre" do `MarketTab` (usa `useExtras`/`useTableExtras`, `shop` no mesmo provedor das moedas) |

O item comprado é uma entrada **custom** da mochila (mesmo caminho dos itens que o mestre entrega), então aparece na ficha, no token e no painel da sala, e a ficha aberta
reconcilia pelo merge de 3 vias que já existia. Tirar um item da loja **não** tira de quem já comprou. Testes de banco da loja: seção "Loja do Mestre" de `scripts/masterHubDbTest.mjs`
(permissões, saldo insuficiente, empilhar, reenvio idempotente, 10 compras simultâneas com saldo para 5, 6 cliques com o mesmo id, moeda de outra mesa, FK ao apagar moeda).

## Loja aprovada (migração `0044_approved_shop.sql`)

Todo item customizado **aprovado** pelo mestre (fluxo de `ItemApprovals`/`approve_custom_item`) entra à venda para a mesa toda na aba **Loja aprovada** do Mercado.
Reaproveita a Loja do Mestre em vez de criar outra tabela: cada item aprovado vira um anúncio em `table_shop_items`, pago em `$`, e a compra é a mesma `shop_buy`.

| Parte | Como funciona |
|---|---|
| Origem | `table_shop_items.source_id` = pedido (`table_custom_items`) de onde veio; `NULL` = item criado pelo mestre. O anúncio usa o **mesmo id** do pedido, então a mochila guarda `custom-<id>` igual ao item que o autor recebeu e as compras empilham |
| Entrar / sair | Gatilho `custom_item_to_shop` em `table_custom_items`: `status` vira `approved` → cria o anúncio (preço = o preço da aprovação); deixa de ser `approved` (revogado) → apaga o anúncio. `approve_custom_item`/`revoke_custom_item` não mudam. Os itens já aprovados na época da migração entram no preenchimento |
| Preço | O preço da aprovação é cobrado do autor (como sempre) **e** vira o preço da loja para os demais. **Preço 0 = grátis**: só vale para anúncio com origem (`check` da tabela); `gm_shop_upsert` mantém 1..999.999.999 para os itens do mestre. Compra de preço 0 em `$` não grava `money_awards` (a coluna não aceita 0) |
| Mestre | Em Central › Itens › Lojas os anúncios aprovados aparecem com a marca "Loja aprovada"; dá para mudar o preço, **pausar** (esconde da loja sem apagar) ou tirar. O limite de 100 itens conta só os criados pelo mestre |
| Revogar | Sai da loja e da mochila do autor (como antes). Quem já comprou **continua com o item** (pagou por ele) |
| Jogador | `MarketTab` › aba "Loja aprovada" (`MasterShop approved`), com `approvedListings(extras.shop)`; a aba "Loja do Mestre" mostra só `masterListings`. Capacidade: `master_hub_version() = 4`; sem a 0044 a coluna `source_id` não existe e `loadExtras` relê sem ela (tudo cai na Loja do Mestre) |
| Testes | `src/market/shop.test.js` (regras puras e a migração) e a seção "Loja aprovada" de `scripts/masterHubDbTest.mjs` |

## Armadilha conhecida: nomes de canal Realtime
O Supabase devolve o canal existente quando o nome se repete, e registrar `postgres_changes` num canal já assinado derruba o app. `useTableExtras` e `useCharacterConditions` usam nome **único por uso** (`uniqueName` em `extras.jsx`), porque a página da ficha monta dois usos ao mesmo tempo (resumo lateral e Mercado). Ao criar um hook novo com canal, dê um nome único ou garanta uma só instância.

## Ícones das experiências
O seletor oferece só as imagens embutidas; o tipo guarda a **chave** da imagem (até 8 caracteres, começa com `@`: `@fita`, `@placar`, `@trofeu`, `@selo`, `@xp`). Tipos antigos com emoji continuam aparecendo. As imagens ficam em `public/assets/experience/` (128 px) e o mapa chave → arquivo está em `experienceIcons.js` (`IMAGE_ICONS`). `ExperienceIcon`/`HoldingChip` (`ExperienceIcon.jsx`) mostram a imagem ou o texto; em listas só de texto (listas suspensas, confirmações, histórico) a imagem vira `★` (`iconText`). Para somar um ícone novo: copiar o PNG para a pasta e uma linha em `IMAGE_ICONS` (chave com `@` e até 8 caracteres); não precisa de migração.

## Ícones das moedas
O seletor de moeda oferece só as imagens embutidas (`CURRENCY_ICONS` em `experienceIcons.js`, arquivos em `public/assets/currency/`): `@cedula`, `@euro`, `@lingote`, `@chines`, `@maco`. A chave vai no campo `symbol` da moeda (limite de 8 caracteres do banco). Imagem onde há espaço (chips, cabeçalhos, preços); em textos puros vira `¤` (`iconText(symbol, '¤')`), e `cleanIconKeys` limpa chaves cruas que o servidor coloca nos resumos do histórico. Moedas antigas com emoji continuam como estão. Sem migração.

## Glossário (use estes termos na interface)
- **Dinheiro ($)**: o `$` da ficha (`characters.data.money`); é o que o jogador gasta no Mercado do livro. Sempre escrito com o `$` e rotulado "Dinheiro".
- **Moedas** (módulo Moedas › "Moedas da mesa"): moedas criadas pelo mestre, cada uma com a sua **carteira** por jogador. Não viram `$` e só pagam itens da **Loja do Mestre**.
- **XP de evolução**: o XP do nível (nível = XP ÷ 5). **Experiências / tipos de experiência**: contadores criados pelo mestre (Reputação…), que não mexem em XP nem em nível.
- **Pontos livres**: pontos de personagem ainda não gastos ("0 de 41 pontos livres").
- Campo de quantidade: "Quantidade a somar / a retirar" e "Novo saldo / Novo XP", sempre com a unidade entre parênteses.
- Aviso de atualização do banco: "Atualização do banco pendente (0040/0041): aplique-a no Supabase e recarregue a página."
