# Demonstração com as telas do Gerizo

O pedido foi corrigido: a demonstração pública agora compõe os próprios componentes do sistema. A apresentação anterior, reduzida, foi substituída por essa experiência. O manual MASTER_KNOWLEDGE_UI_UX_FRONTEND foi utilizado como referência de hierarquia, composição comercial, reaproveitamento, ajuda contextual, estados e navegação.

## Experiência

Entrada: `/demonstracao/sistema/vendas/dia?tour=1`. Os links anteriores de demonstração redirecionam para o novo endereço.

O cenário Atlas Casa é fictício, com seis SKUs, dois canais e histórico de setembro a novembro. Há telas de Dia, Semanal, SKU, Queda, Mês até aqui, Anual, Canais, Anúncios, Tráfego pago, Termômetro, Envios, Promoções, Regras, Processar planilhas, Campanhas, Histórico, Comparar ofertas, Referências de preço, Financeiro, Custos, Produtos, Precificação, Planejamento, Resultados e Conversar.

O guia contém capítulos por área e passos curtos sobre o que observar e experimentar. Pode ser recolhido, retomado ou usado por capítulo. A interface permanece disponível durante a orientação.

O processamento de promoções lê XLSX em memória e reutiliza o motor de preços existente. A demonstração oferece uma planilha de exemplo para baixar e subir na própria tela. Custos, regras, decisões e planejamento são simulados no navegador. Alterações nos custos alimentam a leitura financeira do exemplo. Arquivos de expedição são identificados como demonstração, sem validade fiscal; a conversa tem respostas guiadas, sem consumo de IA.

## Isolamento

Navegação e transporte passam por adaptadores explícitos. Fora da demonstração, continuam usando Next e fetch originais. Dentro dela, a navegação usa histórico local e os pedidos são tratados por funções locais, sem caminho alternativo para a API operacional.

O namespace público não consulta Supabase. Cache de fotos, alertas, marca e atualização são separados entre a demonstração e a operação. Uma política de conteúdo em produção bloqueia conexões de dados e submissões convencionais nesse namespace. A simulação usa estado próprio de sessão, com comando de reinício.

Destinos administrativos não incluídos no tour não dão acesso às empresas reais. A autorização de todas as APIs operacionais permanece no servidor.

## Comercial

Nova composição com branco, tipografia editorial, marca preservada e prévias das próprias telas. As prévias são incorporadas ao vivo, sem copiar uma interface simplificada. Chamadas levam diretamente à tela demonstrada. Vídeos continuam identificados como em preparação. Nome e telefone continuam sendo recebidos pelo formulário comercial existente.

## Verificação

O usuário solicitou concluir e publicar sem a rodada de validação visual. Não se atribuem à nova versão os testes da demonstração anterior. A compilação da publicação permanece necessária ao processo de implantação.
