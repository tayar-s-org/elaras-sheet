# Revisão modular — 20/11/2026

## Escopo e método

Referência: checkout `080aeae`. Consolidado em 37 achados, incluindo seis P1 e um P1 condicionado ao modelo de confiança da ficha; demais achados P2/P3. As sugestões de manutenção não entram nessa contagem. Este relatório está em diretório ignorado pelo Git e não foi commitado.

Revisão do checkout local de Crônicas de Manrakora por seis agentes: núcleo de regras; acesso a dados e backend; aplicação, fichas e contas; sala e tabuleiro; ferramentas do mestre, rotinas e tokens; interface transversal, livro, assistente, dados 3D e assets. A coordenação executou a suíte, o build e verificações adicionais e cruzou achados entre os módulos.

Critérios: correção, integridade, permissões, UI, UX, acessibilidade, performance, responsabilidade única e dependências (SOLID aplicado a funções, hooks e componentes), baixa complexidade cognitiva, nomes semânticos e comentários que expliquem motivos ou restrições reais. Tamanho de arquivo sozinho não caracteriza defeito; abstrações novas precisam reduzir complexidade concreta.

Revisão estática e testes locais. Não houve navegação visual, teste com usuários, profiler, consulta ao schema remoto nem execução de migrações. Problemas SQL referem-se às definições versionadas e dependem de elas corresponderem ao ambiente publicado. Não foram alterados código de aplicação, dados ou configurações. Nenhuma revisão garante ausência de outros defeitos.

Prioridades: **P1** = corrigir primeiro, por perda de dados, violação de permissões ou bloqueio de fluxo; **P2** = problema funcional, de acessibilidade ou custo evitável; **P3** = manutenção ou impacto menor. Sugestões estruturais ficam separadas de bugs.

## Verificações executadas

- `npm test`: 338 testes; 337 passaram. O teste de integração do servidor falhou com `connect EACCES 127.0.0.1`, bloqueio de conexão local deste ambiente, sem evidência suficiente para atribuir falha ao aplicativo.
- `node --test src/powerDamage.test.js`: 6 testes passaram. Esse arquivo não está na lista explícita do script `test` e, portanto, não roda no fluxo atual de CI.
- `npm run build`: passou. JavaScript principal de 1.195,24 kB (352,02 kB gzip); chunk DiceStage de 535,84 kB (135,96 kB gzip); CSS de 180,51 kB (31,97 kB gzip). O Vite emitiu alerta de chunks acima de 500 kB. Tamanho não equivale a medição de lentidão em dispositivo real.

## Achados

### Aplicação, contas e sincronização

1. **P1 — Logout apaga edições pendentes e modelos locais.** `src/App.jsx:194-198`; debounce em `src/features/library/useAutosave.js:33-39`. Editar e sair antes de um segundo, ou depois de falha/conflito, remove rascunhos sem aguardar persistência. Também remove arquétipos locais. Aguardar salvamento e preservar rascunhos por conta quando houver pendências; remover modelos somente por ação explícita.
2. **P1 — Benefícios podem ser consumidos antes de serem persistidos na ficha.** `src/features/library/useEvolutionClaims.js:34-50`, `useCustomSkillClaims.js:31-33`; RPCs em `supabase/migrations/0024_time_engine.sql:323-334`, `0025_work_and_study.sql:251-263` e `0032_custom_skill_attribute.sql:37-48`. O banco marca entrega antes da alteração local e do autosave. Fechar navegador, trocar conta ou perder a resposta pode perder evolução, melhoria de feitiço ou perícia, sem nova entrega em outro aparelho. Aplicação e confirmação precisam da mesma transação, com ID idempotente.
3. **P2 — Claims multiplicam consultas por ficha aberta.** `src/features/library/useCustomItemClaims.js:29-40,68`, `useCustomSkillClaims.js:46`, `useEvolutionClaims.js:65`, `useMoneyClaims.js:49`, `src/App.jsx:180`. Há vários ciclos de 15 segundos, inclusive fora do editor e com aba oculta. A mesma lista de itens é relida dentro do loop. Agrupar por usuário, buscar listas compartilhadas uma vez por ciclo e suspender consultas quando adequado. A estimativa estática de aproximadamente 210 chamadas por ciclo com 30 fichas não é medição de tráfego real.
4. **P2 — Salvamento de outra ficha esconde conflitos pendentes.** `src/features/library/useAutosave.js:16,35,44,53`; `CloudSheets.jsx:22`. O bloqueio é individual, mas o status é global: B salva e troca o erro de A por sucesso, embora A permaneça bloqueada. Manter status por ficha e indicação agregada de pendências.
5. **P2 — Erro de rede é apresentado como ausência de mesas.** `src/features/sheet/TableBinding.jsx:17-24`. O erro vira lista vazia, sem retry; recuperar a rede não recupera o seletor. Separar erro/vazio e oferecer nova tentativa.
6. **P2 — Busca pode mostrar resultados de pesquisa anterior.** `src/features/tables/TablesPage.jsx:33-36`. Respostas fora de ordem substituem a busca atual e erros antigos permanecem. Usar geração/cancelamento por consulta e limpar erro ao recomeçar.
7. **P2 — Fechar editor perde arquétipo em elaboração.** `src/CustomArchetype.jsx:16-19`, `src/features/sheet/SheetModules.jsx:218-222`, `src/ui/Modal.jsx:20-24`. Draft só em memória é perdido por Escape/clique no fundo/fechamento. Persistir draft ou confirmar descarte de formulário sujo.

### Núcleo, regras, inventário e recuperação

8. **P1 — Estudo Mágico bloqueia a segunda tentativa.** `src/rpg/activities.js:56`, `src/rpg/magicStudy.js:40-44`; `supabase/migrations/0025_work_and_study.sql:214-215,232`. O total histórico de dados é limitado a 24 e cada tentativa consome 16 acumulados. Depois da primeira restam, para sempre, no máximo oito. Reprodução: `astuciaDice(100000, 16)` produz `available:8, canAttempt:false`. Rever teto do saldo e atualizar JavaScript, SQL e teste em `src/rpg/work.test.js:138`, que hoje aceita esse comportamento.
9. **P2 — Compra no limite cobra sem entregar.** `src/market/inventory.js:22-27`; `src/features/sheet/MarketTab.jsx:62-65,121-133`. Com 99 adagas, comprar uma desconta 25 e mantém 99. Rejeitar excesso antes do débito e desabilitar compra na interface.
10. **P2 — Rebase pode apagar líquido preservado na nuvem.** `src/sheetRebase.js:38-45`. Base/local com dois cantis e `fills:[0.2,0.6]`, nuvem com um e `fills:[1]`, resulta em um cantil com `fills:[0]`. Se local não alterou o campo, aceitar a nuvem diretamente; revisar conflitos e identidade de unidades quando ambos alteram.
11. **P2 — Uma aba inválida derruba a restauração de todas.** `src/sheets.js:92-110`; efeito de persistência em `src/App.jsx`. Uma aba com `schemaVersion:0` interrompe o `map` completo: uma ficha válida ao lado também desaparece e a sessão vazia pode ser gravada sobre a original. Recuperar por aba, preservar snapshot original e informar falhas.
12. **P2 — Histórico fecha a meditação errada na mudança de dia.** `src/rpg/history.js:117-119`; eventos em `src/rpg/activities.js:125-129,199-202`. Ao meditar 26 horas desde tick zero, a nova sessão do tick 24 fica encerrada com 24 horas e a antiga permanece aberta. Processar fechamento antigo antes do início novo, ou separar os eventos.

### Sala, tabuleiro e áudio

13. **P1 — Reconexão da sala não recupera eventos perdidos.** `src/features/room/useRoom.js:47-52,73-78`. Reassinar só atualiza conexão/presença. Mensagens, recursos e membros alterados durante queda podem continuar antigos com indicador de conectado. Reconciliar snapshot após assinatura/reconexão, combinando histórico por ID e protegendo respostas antigas.
14. **P2 — Tabuleiro não recupera alterações com o mesmo mapa.** `src/features/room/useBoard.js:37-44,72-74,90`. Na reconexão, tokens/marcas só são recarregados se `map_path` mudar; movimentos e exclusões perdidos permanecem invisíveis. Recarregar itens também ao reassinar, protegendo concorrência com eventos.
15. **P2 — Erro ao salvar recursos mantém valor falso na tela.** `src/features/room/PartyPanel.jsx:48-52,60-67`. Atualização otimista não reverte/reconsulta em falha e a exceção é engolida. A ação de desmaiar pode anunciar sucesso sem persistir. Propagar erro e restaurar/reconciliar o estado.
16. **P2 — Soundpad pode tocar depois de parar ou sair.** `src/features/room/useSoundpad.js:41-55,58,64`. Pedido pendente de URL assinada continua após cleanup; plays concorrentes podem criar áudio sem referência para pará-lo. Invalidar operações pendentes por montagem/som e conferir após cada `await`.
17. **P2 — Pollers duplicados carregam as mesmas fichas.** `src/features/room/useRoom.js:93-101`, `useLiveCharacters.js:25-31`; composição em `RoomPage.jsx:152-155`; JSON completo em `src/lib/room.js:47-51`. Ciclos de seis e cinco segundos geram cerca de 22 consultas/minuto por cliente ocioso, além de eventos e comparações completas. Unificar cache/atualização, deduplicar pedidos e pausar aba oculta.
18. **P2 — Cache de áudio não considera expiração da URL.** `src/features/room/useSoundpad.js:46-47`, `src/lib/music.js:7-11`; caso semelhante em `MusicPlayer.jsx:23-29`. URLs de seis horas ficam em cache por toda a sessão; reproduções posteriores podem falhar sem explicação. Guardar validade, renovar e informar erro.
19. **P2 — Históricos crescem indefinidamente durante a sessão.** `src/features/room/useRoom.js:57-68`, `ChatPanel.jsx:36`, `TableLog.jsx:20-29`. Eventos são anexados sem limite; chat renderiza tudo e log ordena tudo antes de recortar. Limitar buffer e paginar histórico. Não houve medição de memória ou tempo de renderização.

### Ferramentas do mestre, rotina e tokens

20. **P2 — Condições podem sobrescrever alterações recentes.** `src/features/room/masterHub/modules/ConditionsModule.jsx:43-47,57`; `supabase/migrations/0040_master_hub.sql:446`. Adicionar A e B antes do Realtime responder, ou em duas abas, calcula listas sobre snapshot antigo e substitui integralmente a lista persistida. Aplicar deltas por ID no banco sob lock ou exigir revisão.
21. **P2 — Entrada vazia vira operação de zerar saldo/XP.** `src/features/room/masterHub/AdjustForm.jsx:22-24`. `Number('')` vira zero no modo Definir valor, inclusive para seleção em lote. Há confirmação, mas o campo ausente passa como número intencional. Validar texto não vazio e inteiro finito antes da conversão.
22. **P2 — Resposta de outra mesa pode substituir o estado atual.** `src/features/room/masterHub/extras.jsx:24-38`, `src/features/routine/useClock.js:13-20`. Um único `alive.current` volta a true no próximo efeito e permite aceitar resposta iniciada para a mesa antiga. Usar geração por consulta/identidade, reset por mesa e proteção contra polls anteriores ao Realtime.
23. **P2 — Aptidão pode apresentar mesa diferente da consultada.** `src/features/routine/SheetAptitude.jsx:30,35-40,47-51`. Ao mudar ficha, seleção antiga é preservada mesmo ausente das novas mesas; rótulo usa fallback e consulta mantém ID antigo. Validar seleção e vincular respostas a `(tableId, cloudId)`.
24. **P2 — Enquadramento de token não tem alternativa por teclado.** `src/features/token/TokenMaker.jsx:149-157,242-244`. Posição X/Y só muda por ponteiro, embora zoom/rotação tenham controles. Oferecer controles direcionais ou campos de posição e instruções de foco.

### Banco, permissões e operações persistidas

25. **P1 — Migração vazia impede reconstruir banco novo.** `supabase/migrations/0018_custom_items.sql` tem zero bytes e não há criação de `table_custom_items` nos demais arquivos. `0021_custom_items_price.sql:12` já altera a tabela ausente; 0039/0044 também dependem dela. Restaurar definição completa, funções, gatilhos e permissões e verificar instalação em banco descartável. Isso não demonstra falha do banco atualmente publicado.
26. **P1 — Jogador pode remover condições do mestre por JSON não objeto.** `supabase/migrations/0040_master_hub.sql:132`. O trigger aceita `state` não objeto sem preservar condições. O DDL de `0003_room.sql` não restringe o tipo JSON. Atualizar o próprio estado para `[]` e depois `{}` remove as condições preservadas pelo mestre. Rejeitar estados não objeto por constraint/gatilho e preservar condições em qualquer escrita. Cenário inferido das políticas e SQL versionados; não executado no banco.
27. **P1 condicional — Escrita direta contorna progressão/economia controladas.** `supabase/migrations/0001_profiles_characters.sql:49-50,55-62`. O dono pode alterar todo `characters.data`, incluindo dinheiro, XP e inventário; os gatilhos protegem metadados, sem impor os fluxos de concessão/compra. Se a ficha é intencionalmente livre, documentar o modelo de confiança e retirar garantias incompatíveis como a de `0039_inventory_items.sql:10-12`. Se o mestre deve controlar esses campos, separar dados autoritativos e restringir alterações a RPCs validadas. Não é possível decidir a política do produto apenas pelo código.
28. **P2 — Aprovação de item verifica saldo sem reservar/debitar.** `supabase/migrations/0021_custom_items_price.sql:30-41`. Aprovar item insere cobrança pendente, mas mantém o saldo. Jogador offline com 500 pode ter dois itens de 400 aprovados, mesmo sequencialmente. Debitar/reservar sob lock da ficha na mesma transação e registrar aplicação idempotente.
29. **P2 — Aprovar/revogar item concorrentemente pode duplicar movimentação.** `supabase/migrations/0021_custom_items_price.sql:22-25,36-41,49-58`. Duas sessões leem o mesmo estado sem lock e ambas inserem cobrança/reembolso. Travar pedido/ficha ou usar transição condicional com `RETURNING` e movimentar apenas uma vez. Não foi encontrado override posterior.
30. **P2 — Limite de jogadores não é serializado.** `supabase/migrations/0028_character_table.sql:101,118-127`; `0002_tables_members.sql:158-168`. Duas entradas/aprovações podem ocupar a última vaga simultaneamente, pois a contagem não bloqueia a mesa. Usar lock comum antes de contar e aprovar.
31. **P2 — Troca de música apaga arquivo anterior antes de persistir referência.** `src/lib/music.js:19-23`. Falha posterior em `setMusic` deixa mesa apontando para arquivo removido. Confirmar troca persistida antes de excluir o antigo; limpar upload novo em falha.
32. **P2 — Vida e mana concorrentes sobrescrevem estado completo.** `src/lib/room.js:29-31`; `src/features/room/PartyPanel.jsx:51`. Mestre reduz vida e jogador gasta mana a partir do mesmo snapshot; último upsert pode restaurar recurso alterado pelo outro. Usar operação por campo no banco ou revisão com tratamento de conflito. É distinto da falta de rollback no achado 15 e também afeta sessões com conexão funcionando.

### Interface transversal, livro e carregamento

33. **P2 — Modal do livro devolve foco ao chat coberto.** `src/assistant/Assistant.jsx:217-224,119-138`. Abrir página altera `viewer` e dispara foco no input do chat após 80 ms. O modal não contém foco nem torna fundo inerte. Separar foco inicial do chat e navegação do livro; reutilizar modal com foco inicial, contenção e restauração.
34. **P2 — Lista de perguntas pode ficar sob rodapé do assistente.** `src/assistant/assistant.css:87,95`; `Assistant.jsx:304-315`. A lista absoluta ocupa até o fim do painel e o rodapé sobrepõe sua parte inferior sem reserva de espaço. Últimas perguntas podem ficar cobertas. Usar áreas flex/grid sem sobreposição. Validar visualmente o cenário após correção.
35. **P2 — Chat pode abrir fora da tela em janela baixa.** `src/assistant/Assistant.jsx:31-43`. Altura mínima de 240 px ultrapassa o espaço disponível. Exemplo calculado: viewport 800×400, botão com `bottom:169`, painel `bottom:243,height:240` resulta em topo -83. Limitar pelo espaço real ou posicionar dentro do viewport com modo compacto.
36. **P2 — Rotas e módulos pesados entram no JavaScript inicial.** `src/App.jsx:23-30`, `src/features/sheet/SheetModules.jsx:1-13`. Importações estáticas trazem sala, mesas, biblioteca e ficha mesmo no início. O bundle principal medido tem 1.195,24 kB (352,02 kB gzip); Three.js/DiceStage já está separado. Adotar carregamento por rota/módulo com fallback e medir novamente. Não atribuir o custo inteiro ao PDF, sem consumidor ativo identificado.
37. **P3 — Busca do livro normaliza o corpus em renders repetidos.** `src/Book.jsx:24,31-32`. As 218 páginas são normalizadas a cada render com busca; o texto volta a ser normalizado para o trecho. O JSON tem aproximadamente 1,33 MB. Pré-normalizar índice, consulta fora do loop e memorizar resultados. Confirmar impacto em aparelho representativo antes de otimizações adicionais.

## Manutenção e critérios de refatoração

- **Responsabilidade única:** decompor `App.jsx` em sessão/persistência, sincronização e composição de rotas; `BoardView.jsx` em gestos e operações de tokens; `TokenMaker.jsx` em carregamento, produção de imagem/payload e interface. Extrair por comportamento e contrato, sem impor classes.
- **Complexidade cognitiva:** separar normalizadores de `validateCharacter` (`src/rules.js:267`) por agregado e handlers de `processHour` (`src/rpg/activities.js:111`) por atividade. Preservar regras e testes de comportamento antes de mudar estrutura.
- **Dependências:** `src/market/shop.js:4` importa ícones de `features/room/masterHub/experienceIcons.js`. Mover a apresentação compartilhada para módulo neutro, evitando que o domínio dependa de uma tela.
- **Ciclos assíncronos:** hooks de claims repetem busy/alive/disabled, timers e reconhecimento de erro por regex. Unificar infraestrutura pequena de sincronização por identidade; manter a regra de cada benefício explícita.
- **Semântica e ruído:** remover `isGm ? rows : rows` em `PartyPanel.jsx:127` e derivações idênticas próximas; reduzir props não usadas de `IdentityTab.jsx:9-10` e a respectiva supressão. Priorizar nomes que expressem intenção e contratos de retorno/erro.
- **Comentários:** o comentário em `useLiveCharacters.js:8-10` diz dez segundos, mas o intervalo é cinco; o de `useClock` sobre estado nulo não vale ao trocar mesa. Corrigir junto ao comportamento. Preservar explicações de autorização, idempotência, compatibilidade e regras da campanha; remover apenas paráfrases sem valor ou informação incorreta.
- **UX adicional:** `ChatPanel.jsx:19` rola sempre ao fim, interrompendo leitura do histórico. Acompanhar automaticamente apenas quando usuário estiver próximo do fim e indicar novas mensagens.
- **Performance a medir:** TokenMaker redesenha canvas em renders de campos não visuais. Confirmar custo em profiler antes de introduzir memoização adicional.
- **Cobertura de CI:** incluir `src/powerDamage.test.js` no script de teste ou substituir a lista manual por descoberta compatível com a versão do Node. Os seis testes passam quando executados diretamente.
- **Assistente:** separar posição/arraste e conversa em `src/assistant/Assistant.jsx:151-335`; separar interpretação, recuperação e apresentação em `engine.js:86-459`, preservando os testes existentes.
- **Migrações:** separar rollbacks dos arquivos de avanço, resolver numeração repetida e adotar registro de aplicação. A instrução genérica de executar arquivos em ordem não é suficiente para reconstrução segura.
- **Erros de infraestrutura:** `src/lib/requests.js`, `engine.js` e `customItems.js` têm caminhos que transformam erros diversos em ausência de recurso/migração. Diferenciar capacidade não instalada de indisponibilidade, sessão expirada e permissão negada.
- **Servidor legado:** separar roteamento, persistência, autenticação e arquivos estáticos de `server/index.js` se ele continuar suportado; prioridade inferior aos fluxos ativos de integridade.
- **Legado/latente:** `src/pdf.js:89,100-103` omite bônus `d12+N` ao imprimir dados. Não foi encontrado consumidor ativo na interface atual; confirmar suporte a PDF/Dice.jsx antes de corrigir ou remover e atualizar documentação conforme decisão.

## Sequência recomendada

1. Corrigir perda de dados no logout e entrega transacional de benefícios; restaurar abas individualmente. Fechar bypass de condições e recuperar migração ausente; definir se economia/progressão são autoritativas no servidor.
2. Corrigir bloqueio do Estudo Mágico e reconciliação após reconexão.
3. Corrigir demais falhas de concorrência, inventário e interface com testes específicos dos cenários descritos.
4. Unificar consultas periódicas e reduzir carregamento inicial; medir em aparelho/rede representativos.
5. Refatorar responsabilidades e comentários em mudanças pequenas, mantendo regras e comportamento observável.

Antes de tratar este documento como auditoria de produção, validar permissões e concorrência em Supabase de teste com sessões distintas de mestre/jogador, e realizar navegação visual desktop/mobile e por teclado. O banco remoto não foi inspecionado nesta revisão.
