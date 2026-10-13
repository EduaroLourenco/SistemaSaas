# Correções das telas — outubro de 2026

Status: em andamento

## Pedido

Implementar as quatro páginas de “Telas a arrumar e melhorar.pdf”, enviado em 12/10/2026. As mudanças são comuns a todas as empresas; verificar Bom de Compras e Probel separadamente, sem regras especiais por cliente. Manter o design atual e a navegação no celular. Salvar cada entrega concluída em um commit e enviar ao GitHub.

## Em espera por decisão do usuário

- **Relatório interativo:** trabalho pausado; não ampliar nem publicar nesta tarefa.
- **Versão de afiliados:** ideia guardada para uma etapa futura; não implementar agora.

## Entregas

1. Atualização de dados por qualquer membro autorizado da empresa, com erros e progresso claros.
2. Salvar regras de promoções e resultados do processamento; refletir em histórico e campanhas.
3. Agrupar navegação de vendas e anúncios, preservando endereços e filtros; melhorar a leitura de campanhas.
4. Conferir tráfego pago no mesmo período e conta, explicar bases e cobertura sem misturar fontes.
5. Conectar financeiro aos dados de pedidos disponíveis; identificar fontes de produtos/categorias e margem opcional por produto.
6. Fortalecer Por que caiu: SKU, anúncios, visitas, conversão, preços, comparações, filtros, ordenação e detalhe diário.
7. Catálogo de produtos anunciados com canal, calendário, preços vendidos/anunciados e histórico disponível.
8. Estoques por fonte e depósito, incluindo Full, dentro do contexto do produto.

Cada entrega tem seu próprio arquivo em `issues/`. O estado e as verificações ficam nesses arquivos.

## Regras de dados e acesso

- Toda consulta operacional usa a empresa da sessão e preserva conta/canal; nunca misturar empresas.
- Ausência de medição não é zero. Sem vendas significa quantidade zero e preço vendido indisponível.
- Não somar estoques de ERP e canal que possam espelhar as mesmas unidades.
- Distinguir preço de vitrine, oferta atual, preço vendido e mínimo calculado. Não inventar histórico.
- API prevalece nas métricas cobertas; importações continuam válidas onde não há API ou cobertura.
- Diagnósticos são evidências/comparações, não afirmações de causalidade sem suporte.
- Leituras das APIs não alteram anúncios, preços ou saldos nos canais.

## Publicação

O pedido atual autoriza commits e push por entrega. GitHub e aplicação publicada são estados diferentes: o acesso Vercel desta sessão recusou o projeto anteriormente e o envio ao GitHub não comprovou implantação automática. Registrar essa limitação se persistir, sem afirmar que as mudanças estão online.
