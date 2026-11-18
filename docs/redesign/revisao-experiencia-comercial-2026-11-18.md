# Gerizo — revisão da experiência e entrada comercial

Revisão de 18/11/2026, sobre as melhorias já concluídas de Hoje, navegação móvel e Envios. Os dois anexos de interface e UX foram usados como conhecimento de apoio; o escopo segue o pedido do usuário e os contratos do produto atual.

## Experiência

- Cabeçalhos deixam de repetir a categoria do menu. Introduções estáticas ficam na ajuda do título; datas, cobertura, avisos e contexto calculado permanecem disponíveis na leitura.
- Hoje mantém a rotina existente, com calendário ajustado à largura móvel, dias recentes mais compactos e agenda futura expansível, sem esconder o sétimo dia nem cortar os eventos de cada data.
- Semanal começa pelas semanas com dados, preserva a opção de mostrar o ano inteiro e trata ausência de semanas fechadas sem calcular um melhor/pior inexistente.
- Produtos/SKU usa seleção estável de visão no celular e rolagem local das tabelas. A métrica permanece junto dos dados.
- Tráfego pago seleciona um único relatório pela interseção com o período, com troca manual, origem e conferência recolhidas. Relatórios sobrepostos não são somados.
- Queda apresenta primeiro os sinais principais; demais causas e evidências continuam acessíveis.
- Termômetro ajusta hero, reputação, catálogo, valores da semana e ordenação dos registros no modo móvel. Nomes longos ganham espaço real.
- Promoções usa Ofertas, Histórico e Regras. Importação, campanhas processadas, referências e comparação permanecem em Ferramentas. Histórico agrupa a decisão recente por produto e abre todas as rodadas, preços e motivos. Comparação recebe o SKU do histórico.
- Financeiro reduz repetição de indicadores e explicações. Resultado e cobertura aparecem no resumo; origem dos custos e demonstrativo mensal abrem sob demanda. A tabela mantém sua rolagem dentro dos detalhes.
- Sombras discretas distinguem superfícies sem transformar cada número em um cartão decorativo.

## Comercial e demonstração

- `/`: visitantes veem a apresentação comercial. Sessões válidas mantêm a verificação de empresa e a entrada na rotina.
- `/conheca`: apresentação pública permanente, inclusive para quem já usa o produto.
- `/demonstracao`: cenário exclusivamente local, com dois canais, seis produtos, dez pedidos e nove áreas. Filtros, comparações, revisão de promoção, planejamento, custos, PDF de exemplo e perguntas guiadas funcionam em estado local.
- A demonstração não cria empresa, pedido ou anúncio no banco, não importa carregadores de negócio e não consulta APIs operacionais. As respostas de conversa são exemplos; não consomem IA. O PDF é identificado como demonstração e não tem validade fiscal.
- Tour com nove etapas, avanço, retorno, fechamento, teclado e respeito à preferência de movimento reduzido.
- Vídeos têm espaço reservado e identificação de conteúdo em preparação.

## Captação

Nome e telefone são recebidos por `POST /api/interesse`, com validação, honeypot, verificação de origem e limite de tentativas em memória. O sucesso depende da gravação; indisponibilidade mantém o formulário preenchido.

Os contatos ficam no bucket privado `gerizo-interesses`, separados dos arquivos e dados operacionais. As chaves dos arquivos usam HMAC do telefone, sem telefone no nome. Reenvios do mesmo telefone normalizado não duplicam arquivos. Não há criação automática de conta nem envio de mensagem.

`/interessados` e `GET /api/interesse` exigem administrador da plataforma. Empresas oferece o atalho somente para esse administrador. A lista inicial mostra os cem contatos mais recentes e permite exportar essa lista em CSV. A política de privacidade distingue o contato voluntário dos dados das contas conectadas.

## Validação

Os testes de interface usam componentes reais com fixtures sintéticas, sem escrita em dados de operação. As evidências locais estão em `output/revisao-2026-11-18` e `output/redesign`.

- Verificação de tipos e compilação de produção concluídas.
- Testes de análise em 320, 390, 768 e 1366 px; inspeção visual de catálogo, ranking, moeda e tabelas.
- Testes de Promoções em 320, 390 e 1366 px, incluindo histórico → comparação, piso, exportação interceptada, filtros, rodadas e confirmação sem execução.
- Testes da demonstração, tour e formulário com respostas de captação interceptadas, sem registrar pessoas reais.
- Dez verificações isoladas de captação e roteamento: validação, falha honesta, limite, acesso administrativo e proteção das APIs internas.
- Armazenamento privado verificado com arquivo temporário sem dados pessoais: gravação/leitura administrativa permitidas; leitura e listagem anônimas negadas. O próprio arquivo foi removido ao terminar.

Scripts reutilizáveis: `verificar-refino-analitico.mjs`, `verificar-refino-geral.mjs`, `verificar-comercial.mjs` e `verificar-captacao.mjs`, em `scripts/redesign`. Preparação e prova de privacidade: `node scripts/preparar-captacao.mjs --verificar-isolamento`.

## Preservação

URLs anteriores, cálculos de venda/margem, importação, exportação, permissões, aprovações e ações de negócio permanecem. As melhorias de etiquetas, DANFE e perfil Expedição recebidas dos outros trabalhos são preservadas. Alterações simultâneas de outros agentes fora do escopo desta revisão não são descartadas nem incluídas por conveniência no commit.
