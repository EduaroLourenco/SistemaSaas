# Planejamento comercial

Nova área em `/planejamento`. Nenhum envio, publicação de oferta, alteração de preço ou integração de estoque é realizado. Apenas o menu existente recebeu um link; todas as demais mudanças ficam em arquivos novos.

## Ativação

1. No projeto Supabase usado pela plataforma, abra **SQL Editor → New query**.
2. Copie o conteúdo integral de `db/26_planejamento.sql` e execute.
3. Atualize `/planejamento`, com uma sessão autenticada e uma operação selecionada.

A instalação cria somente `planejamento_itens`, `planejamento_grupos`, `planejamento_tipos`, suas funções e políticas. Pode ser repetida. Precisa das funções de acesso já existentes (`pode_ver_operacao`) e da tabela `operacoes`. Não altera as políticas das tabelas antigas.

Qualquer membro que consiga acessar a operação pode criar, editar, aprovar e excluir planejamentos dessa operação, incluindo leitores, conforme orientação do usuário para esta primeira versão. A exceção se aplica somente às três tabelas novas. O RLS continua impedindo acesso entre operações não autorizadas.

## Uso

- A entrada agora é o **Estúdio de campanhas**, com campanhas na lateral e quatro visões do mesmo planejamento: Quadro, Mapa, Calendário e Prioridades.
- **Quadro:** digite uma frase para criar uma ideia e arraste entre colunas de andamento ou etapa. A alternativa “Mover para” permite a mesma mudança por teclado e em telas de toque. A mudança de coluna atualiza o planejamento; não publica ofertas nem confirma execução em um canal.
- **Mapa:** campanhas e ações conectadas, cartões com posição livre, arrasto do fundo e zoom. A posição é salva no banco. As setas do teclado também movem o cartão quando sua alça está selecionada. As conexões representam o vínculo entre campanha e ação; não são dependências de prazo nem um editor de desenho livre.
- **Edição rápida:** título, tipo, datas, responsável, briefing e preparativos. Produtos, estratégia, execução e resultados continuam acessíveis pelo botão de detalhamento.
- **Nova campanha:** roteiro em branco, aceleração de marketplace ou lançamento de coleção. Os roteiros criam ações editáveis com datas relativas ao início escolhido. Em caso de falha parcial, a tela informa quantas ações foram salvas, sem anunciar sucesso completo.
- No calendário de mês ou semana, arrastar uma ação muda seu começo e preserva sua duração. Campanhas e promoções de consulta não são arrastadas; isso evita mover uma campanha sem mover também suas ações.
- Mudanças rápidas aparecem imediatamente, voltam ao estado anterior se a gravação falhar e oferecem **Desfazer** após sucesso. O controle de revisão continua protegendo contra sobrescrita de alterações concorrentes.
- Calendário de mês e semana com faixas que atravessam os dias; visão semanal por canal.
- Campanhas comerciais, ações avulsas e ações vinculadas com etapas editáveis.
- Banner, CRM, conteúdo, mídia, cupom, preço, frete, kit e tipos personalizados.
- Criação pelo botão ou pelo dia, períodos editáveis, situação, responsável, orçamento e meta opcionais.
- Produtos pesquisáveis por título/SKU, grupos reutilizáveis e orientação por produto.
- Grupos copiam os SKUs selecionados para a ação; editar um grupo não muda campanhas anteriores.
- Briefing, público, meio de divulgação, link da arte e checklist.
- Duplicação de um registro. Duplicar campanha não duplica suas ações; o botão informa essa limitação.
- Datas sazonais com fonte e regras anuais; um clique cria rascunho com preparação e checklist editáveis.
- Promoções existentes consultadas por período, canal/conta e SKU. Dados incompletos não são apresentados como confirmação de oferta publicada.

## Estratégia para e-commerce e marketplace

- **Onde focar agora:** prioridades explicadas por prazo, checklist, falta de ações, execução sem registro e fechamento pendente. Sobreposições consideram produto, período e canal/conta; não são declaradas automaticamente como erro. O filtro de canal, SKU, tipo e situação também funciona nesta área. As oportunidades sazonais ao lado são gerais.
- **Estratégia:** foco, hipótese, indicador e meta numérica opcionais. O objetivo livre e a meta textual anteriores continuam disponíveis. Nenhum indicador é atribuído à campanha automaticamente.
- **Anúncios específicos:** busca por código externo (como MLB), título ou SKU, distinguindo conta e tipo de anúncio. Selecionar um anúncio também adiciona seu SKU e, quando necessário, sua conta. Anúncios escolhidos prevalecem sobre o filtro de SKUs na consulta de vendas; canais/contas continuam restringindo a consulta. Sem anúncio específico, entram os SKUs selecionados.
- **Ações de marketplace:** Product Ads, revisão de anúncio e vitrine / Minha Página, além dos tipos já existentes. Roteiros opcionais acrescentam preparativos sem apagar os existentes. São sugestões editáveis, não confirmação de elegibilidade ou integração com publicação.
- **Execução e aprendizado:** situação manual por destino, datas reais, mudanças e link de evidência. Datas futuras são recusadas no servidor. Trocar o canal preserva registros anteriores, identificados como fora do recorte atual. Situação planejada e execução permanecem independentes.
- **Fechamento:** o que funcionou, o que atrapalhou, próximo passo e decisão de repetir, ajustar ou não repetir. Aprendizados anteriores aparecem ao planejar os mesmos produtos em destinos compatíveis.
- **Duplicação:** copia o plano, mas reinicia checklist, execução, medição e fechamento. Criar uma ação dentro da campanha herda produtos, contas, canais e anúncios selecionados.

Os dados novos ficam no JSON `detalhes` das tabelas da migração 26. Não exigem uma segunda migração. Registros antigos sem estratégia recebem valores vazios ao editar.

O redesenho também usa o JSON existente para `visual` (posição e contexto do mapa) e `ordem` (ordenação do quadro). Não é necessário executar outro SQL. Componentes e estilos ficam restritos à área de planejamento. O mapa e o editor completo são carregados sob demanda.

### Referências de interação

Consultadas em 06/10/2026: [visões do Monday](https://support.monday.com/hc/en-us/articles/360001267945-The-board-views), [cartões do Miro](https://help.miro.com/hc/en-us/articles/360020911193-Cards) e [Kanban do Miro](https://help.miro.com/hc/en-us/articles/29188841316114-Kanban). A interface combina visões do mesmo registro, criação rápida e organização espacial com os dados já disponíveis na plataforma.

### Consulta de resultados

`GET /api/planejamento/resultados` exige sessão, operação e revisão correspondentes ao planejamento salvo. O servidor lê o recorte do banco, em vez de aceitar filtros de venda enviados pelo navegador. Alterações no formulário precisam ser salvas antes de consultar.

São mostrados vendas brutas dos itens de produtos, pedidos distintos com itens correspondentes e unidades. Cancelados e exclusões de análise são retirados, com quantidades visíveis. A consulta é paginada e uma falha, inclusive ao ler exclusões, impede apresentar um resultado parcial. O limite de leitura também é tratado como erro, nunca como total completo.

Compara o período planejado já decorrido (até hoje, inclusive) com os dias imediatamente anteriores de igual duração e recorte. Não usa as datas reais de execução para alterar silenciosamente esse intervalo. Se houver execução em datas diferentes, a leitura continua identificada como **período planejado**. O dia atual é parcial. A quantidade de vendas importadas não é prova de cobertura completa; “sem registros” não significa “sem vendas”.

Campanhas usam o próprio recorte e não somam implicitamente os recortes das ações filhas. Um pedido com vários itens correspondentes é contado uma vez. Ao selecionar anúncios, a identificação usa o vínculo do item com o anúncio ou código externo + conta; o SKU usa o cadastro canônico quando disponível.

Não são calculados lucro, retorno de publicidade ou atribuição de vendas à campanha. ROAS, margem, conversão e indicadores próprios podem ser registrados manualmente, com fonte e data obrigatórias, separados da consulta automática. Resultados automáticos são uma consulta atual, não um histórico imutável.

### Referências de marketplace

Fontes oficiais consultadas em 06/10/2026 para distinguir planejamento, promoções e publicidade:

- Central de Promoções: https://vendedores.mercadolivre.com.br/nota/conheca-sua-central-de-promocoes-e-ofereca-descontoss
- ROAS no Mercado Livre: https://vendedores.mercadolivre.com.br/aprender/nota/de-acos-a-roas-entenda-o-retorno-real-da-sua-publicidade?guideKeyId=GE78
- Tipos de promoções e condições por canal: https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/gerenciar-ofertas

Uma ação pode ficar sem produto, canal, orçamento ou desconto. A situação é definida pela pessoa: chegar ao dia planejado não comprova execução. A exclusão de uma campanha remove também suas ações, com confirmação e aviso da quantidade. Edições concorrentes usam revisão e retornam conflito, preservando o formulário.

## Fontes sazonais

Consulta em 05/10/2026:

- Sebrae Minas: https://mg.agenciasebrae.com.br/cultura-empreendedora/calendario-de-vendas-2026-confira-mais-de-100-datas-comemorativas/
- Nuvemshop: https://www.nuvemshop.com.br/blog/calendario-comercial/
- CIEE/MG, Dia do Estagiário: https://www.cieemg.org.br/noticia/18-de-agosto-dia-do-estagiario
- Organizador do Dia Mundial do Sono: https://worldsleepday.org/

O artigo do Sebrae contém inconsistências em datas móveis de 2026. Dia das Mães e dos Pais foram conferidos e calculados pelo segundo domingo de maio/agosto (10/05 e 09/08 em 2026). Black Friday segue a sexta após a quarta quinta de novembro; Páscoa usa o calendário gregoriano. Dia Mundial do Sono só consta para a edição confirmada de 2026. Não se extrapolam datas de campanhas específicas de marketplaces. A biblioteca é uma curadoria, não uma promessa de todas as datas existentes.

## Verificação

- **Redesenho do estúdio, 06/10/2026:** compilação de produção e TypeScript concluídos. Os 14 cenários de domínio passaram, incluindo reagendamento na virada do ano/ano bissexto, herança de produtos e anúncios sem copiar resultados, validação de posições do mapa e roteiros dentro do período da campanha. O teste de Postgres isolado confirmou também a persistência dos novos campos JSON. A aparência e as interações desta nova interface ainda precisam de conferência no navegador: a aba acessível permanece em uma página de erro `data:`, cujo controle foi recusado pela revisão automática. O usuário foi orientado a abrir o endereço HTTP local; nenhuma alternativa para contornar o bloqueio foi utilizada. Os testes visuais descritos abaixo dizem respeito à interface anterior.
- `npx tsc --noEmit`.
- `npm run build`: compilação de produção e checagem de tipos concluídas com sucesso, incluindo `/planejamento` e `/api/planejamento`.
- `node scripts/testar-planejamento.mjs`: validação de formulários e datas, incluindo recorrências de 2000–2100.
- Os testes também cobrem estratégia em registros antigos, datas de execução, medição com fonte, sobreposição entre contas, aprendizados relevantes, totalização por SKU/anúncio, pedidos distintos, cancelados, exclusões e comparação de períodos parciais.
- `npm install --prefix output/planejamento-verificacao --no-save --no-package-lock @electric-sql/pglite`, seguido de `node scripts/testar-planejamento.mjs --banco`: Postgres isolado, migração repetida, CRUD, controle de revisão, vínculos, exclusão em cascata e RLS com duas operações. Não usa dados reais.
- Navegador: formulário de CRM sem produtos, grupo, seleção de SKUs, orientação individual, tipo personalizado, modelo sazonal, filtro SKU, calendário por canal e layout móvel foram verificados em uma página temporária com dados fictícios e respostas de gravação simuladas. A página de teste foi removida da entrega.
- Extensão estratégica: navegação nas prioridades, hipótese/meta, anúncio premium específico, roteiro de preparativos, execução por conta, erro de validação, preservação do formulário após conflito de gravação, reabertura com os campos preenchidos e consulta visual de resultados foram conferidos na mesma abordagem isolada. A persistência JSON foi conferida separadamente em Postgres local. As consultas reais de leitura a pedidos, anúncios e exclusões foram verificadas quanto à compatibilidade com o esquema, sem alteração de dados.

**Instalação confirmada em 06/10/2026:** após o usuário executar a migração 26, as três tabelas passaram a responder normalmente. Uma verificação administrativa diretamente no banco confirmou criação de grupo, tipo, campanha e ação vinculada; releitura dos detalhes em JSON; edição com incremento da revisão; e rejeição de uma edição com revisão antiga. Todos os registros temporários foram removidos, com confirmação de ausência. Nenhum registro preexistente foi alterado.

**Limite desta validação:** a verificação real acima usou o cliente administrativo e não comprova o fluxo completo com as permissões da sessão do usuário. A tentativa de verificação visual da sessão foi bloqueada pela política de segurança do navegador (protocolo recusado). O teste final de salvar/reabrir pela interface autenticada permanece pendente. A validação local de RLS entre operações descrita acima continua válida. Não há fallback para armazenamento local do navegador.
