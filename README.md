# Ascensia RPG

## Acesso de mestre e nomes repetidos

**Entrar como mestre** permite atualizar qualquer ficha compartilhada após validar a chave no backend. **Visão do mestre** organiza a tela, mas não concede permissões sozinha. A chave pode ser definida em `ELARA_MASTER_KEY`; caso contrário, o backend gera um arquivo privado `master-key` dentro de `DATA_DIR` no primeiro acesso à API. O administrador obtém essa chave diretamente no servidor e informa ao mestre. Ela fica apenas na memória da página enquanto o acesso está ativo; não é exportada em PDF. O controle de versões também vale para o mestre.

Abrir novamente uma ficha já aberta seleciona a aba existente e preserva edições e acesso do criador. Chaves individuais ficam guardadas no navegador mesmo após fechar a aba. Novas publicações com nome repetido são recusadas para evitar duplicatas acidentais. As duplicatas anteriores não são removidas: um código curto identifica cada entrada na lista.

## Fichas compartilhadas no servidor

Requer Node.js 22+. Após `npm run build`, execute `npm start`: o mesmo processo serve o frontend e `/api/characters` em `127.0.0.1:8788`. Em desenvolvimento, rode também `npm run dev`; o Vite encaminha `/api` para o backend. Os dados são gravados atomicamente em `data/characters.json` (ou no diretório `DATA_DIR`). Faça backup desse diretório.

**Salvar no servidor** publica a ficha com seu nome e guarda uma chave de edição neste navegador. Novos salvamentos atualizam o mesmo identificador, mesmo se o personagem mudar de nome. Nomes iguais geram fichas distintas. **Fichas do grupo** lista as fichas; abrir uma cria uma aba acompanhada, atualizada a cada 5 segundos quando não há edições locais pendentes. A visão do mestre acompanha as abas abertas da mesma forma. Conflitos de versão não sobrescrevem dados; abra a versão do servidor para comparar.

A chave de edição é mantida nos rascunhos locais e não aparece nos PDFs nem nas respostas de leitura. Limpar os dados do navegador perde essa chave; mantenha também um PDF de segurança. Quem acompanha pode editar uma cópia local, mas não publicar sobre a original. Reimportar o PDF permite criar uma nova ficha no servidor. O acesso compartilhado foi pensado para a rede privada Tailscale: todos que acessam o site podem listar/ler/criar fichas. Não publique este serviço na internet sem controle de acesso adequado.

O pacote **elara-server.tar.gz** inclui backend e frontend. `deploy/install-server.sh` instala um serviço separado e um Nginx na porta Tailscale 8089, sem alterar o painel do Zomboid ou o site estático anterior. A instalação exige portas 8788 e 8089 livres e não substitui uma instalação existente. Os dados persistem em `/var/lib/elara-fichas`, fora do código publicado. O antigo pacote estático não oferece salvamento compartilhado.

## Várias fichas e visão do mestre

Cada personagem tem sua própria aba. **Nova ficha** e **Abrir PDF** adicionam abas sem substituir outras; é possível selecionar vários PDFs de uma vez. Todas as abas e a seleção atual são restauradas neste navegador. O rascunho da versão anterior é migrado sem remover a cópia antiga. Fechar uma aba exige confirmação e remove aquele rascunho; exporte o PDF antes de fechar para guardá-lo.

**Visão do mestre** exibe todas as fichas lado a lado com valores máximos, atributos, perícias, vantagens, poderes, bagagem e notas. Editar volta à ficha escolhida; Salvar PDF exporta somente aquele personagem. Essa visão não sincroniza alterações entre computadores.

No Discord, selecione `/roll` do **Dice Maiden** na lista de comandos e cole apenas a expressão no campo `dice`. O botão **Copiar expressão** não inclui `/roll` nem o nome do personagem, para evitar enviar um comando como texto comum.

## Dados para Discord

A seção **Dados para Discord** gera comandos `/roll` do Dice Maiden a partir dos atributos e perícias atuais. Use **Copiar só expressão** no campo de dados do slash command escolhido no Discord. Os atalhos `sw4` a `sw12` rolam Característica e Selvagem com explosões, mantendo o maior. Perícias sem treino usam d4−2; modificadores temporários são informados pelo jogador. Perceber dos sáurios inclui +2, e o bônus de Escalar dos rakashanos é opcional conforme a superfície.

Dano exige configurar os dados da arma. Atirar usa Agilidade; Lutar e Arremessar usam Força. Os dados são enviados como rolagens separadas e devem ter seus totais somados, sem Dado Selvagem. O d6 extra de ampliação é opcional, conforme a mesa. Nome e dados da arma ficam salvos no PDF. A aplicação não envia mensagens ao Discord nem avalia a defesa do inimigo. Referência: https://github.com/Humblemonk/dicemaiden-rs/blob/main/roll_syntax.md

## Regras confirmadas da campanha

O padrão atual é 30 pontos iniciais. Nível = piso(XP/5), com +2 pontos disponíveis por nível. Movimento = piso(soma dos atributos/12), respeitando o mínimo 1 e ajustes raciais/manuais. Mana = 10 + 2×Espírito + ajuste manual; vantagens não concedem mana automaticamente. Aparar permanece 2 + Lutar/2 + ajuste manual. Estas definições substituem as observações antigas de orçamento em aberto e bônus automático de mana abaixo. XP e nível constam da ficha e do PDF; PDFs antigos sem XP abrem com zero.

## Catálogos e início rápido

Em **Vantagens**, filtre pelo estágio mínimo ou mostre só opções cujos requisitos a ficha confirma. Os estágios do livro usam os limites de 0/20/40/60/80 XP; isso não altera o nível nem o orçamento da mesa. O catálogo verifica atributos, perícias, vantagens conhecidas e pontos livres. Requisitos especiais ou que dependem de informações não registradas ficam para revisão do mestre. A edição manual continua disponível para exceções da campanha.

Em **Poderes**, abra **Buscar poderes no livro** para consultar 50 poderes da edição incluída no aplicativo. É possível procurar pelo nome ou efeito e copiar para a ficha o custo do livro, alcance e duração, deixando esses campos editáveis para as regras da mesa.

Em **Identidade → Começar com o livro**, escolha uma das 11 raças ou carregue um dos 16 arquétipos. Arquétipos substituem a ficha após confirmação e deixam nome e história livres; os pontos abertos de perícia recebem uma distribuição sugerida. Poderes e equipamento ainda precisam seguir o cenário da mesa.

Raças aplicam bases de atributo e perícia sem custo, ajustes de Resistência e a primeira vantagem gratuita quando prevista. Meio-elfos escolhem a herança; androides escolhem a perícia programada. Para anões, o movimento 5 do livro foi adaptado como −1 sobre a fórmula da mesa. Efeitos situacionais aparecem como lembretes e no PDF. Complicações raciais não geram pontos extras.

As novas escolhas são preservadas no PDF editável. Fichas anteriores continuam com os ajustes antigos até escolher uma raça do catálogo. O leitor tem 218 páginas originais, zoom e texto ampliado; vantagens e desvantagens também têm um catálogo pesquisável.

Aplicativo React para criar fichas da campanha, consultar o livro e salvar/importar fichas em PDF. O frontend funciona sozinho (GitHub Pages ou qualquer servidor estático); o backend Node descrito acima é opcional e só roda em instalação própria.

> **Roadmap:** o projeto está evoluindo para uma plataforma multiplayer (contas, mesas, sala em tempo real) sobre Supabase. As fichas continuam compatíveis; o servidor Node será aposentado ao final da migração.

## Executar

Requer Node.js 22.12+ (mesmo requisito do servidor opcional).

```sh
npm install
npm run dev
```

Abra o endereço mostrado pelo Vite. Para gerar a versão estática, execute `npm run build`. A pasta `dist` pode ser hospedada em qualquer servidor estático. `npm run preview` permite conferir o resultado localmente.

## Usar

1. Crie uma ficha ou carregue o exemplo da Elara.
2. Combine o orçamento inicial com o mestre em Identidade.
3. Preencha atributos, perícias, vantagens, poderes e história.
4. Clique em **Salvar PDF**. O arquivo contém a ficha legível e os dados para reabertura.
5. Para continuar em outro computador, clique em **Abrir PDF** e selecione o arquivo original exportado pelo aplicativo. Reimprimir ou otimizar o PDF em outros programas pode remover os dados editáveis.

O rascunho atual é salvo no localStorage deste navegador. PDFs são o meio portátil de guardar fichas. Contas e armazenamento na nuvem ainda não existem na versão publicada no Pages.

## Regras e limites

- O contador usa as alterações da planilha do mestre e um orçamento compartilhado configurável. A planilha deixa o total inicial em aberto.
- Atributos custam 2 pontos por estágio e perícias iniciais custam 1. Vantagens custam 1, 2, 3… Pontos de desvantagens são 3 para menor e 5 para maior.
- O checkbox racial aplica apenas a Agilidade inicial d6. Registre os outros efeitos raciais e ajustes manualmente. Desvantagens raciais já compensadas devem ficar nas Anotações para evitar pontos extras indevidos.
- Poderes, vantagens, pré-requisitos e equipamentos são de registro livre, aprovados pelo mestre. A perícia Conjurar segue a associação ao Espírito indicada pela adaptação da mesa.
- A fórmula de mana conta as vantagens marcadas como “vantagem de poder”. Ajustes permitem refletir acordos específicos.
- O leitor usa `public/assets/book.json` (texto) e as páginas em `public/assets/book/*.webp`, geradas por `scripts/extract-book.py` a partir de `assets/livro.pdf`. A edição é a brasileira baseada no Deluxe e será movida para armazenamento privado na fase de contas.
- Fadiga, gastos em jogo e compras de novas perícias durante a campanha ficam registrados nas notas. O contador calcula criação, e não automatiza avanços de campanha.
- A biblioteca de regras é uma cópia local e não se atualiza automaticamente com a planilha do mestre.
- Fontes web são opcionais. Sem internet, o aplicativo usa fontes locais substitutas.

## Verificação

```sh
npm test
npm run build
```
