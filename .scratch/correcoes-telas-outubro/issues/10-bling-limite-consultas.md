# 10 — Limite de consultas do Bling

Status: implementado e testado; conferência da atualização completa em produção pendente

O usuário recebeu `429 /pedidos/vendas`: limite de requisições por segundo atingido.

## Correção

- Fila por integração: pedidos, estoque e preparação do token na mesma instância não disparam juntos.
- Espaçar consultas e respeitar `Retry-After`, em segundos ou data HTTP, com pausas crescentes e variação entre tentativas.
- Compartilhar a pausa com as chamadas já aguardando; limitar tentativas e tempo de espera. Limite diário não gera repetição imediata.
- Preservar falha como pendência, sem anunciar dados atualizados ou sugerir reconexão para um erro de velocidade.

## Comments

- 14/10/2026: documentação oficial confirma limite de 3 requisições por segundo por **conta**, somando recursos e aplicativos, e 120.000/dia: https://developer.bling.com.br/limites. O controle antigo era global por módulo e permitia chamadas concorrentes acordarem no mesmo instante.
- 14/10/2026: a fila em memória cobre a instância que a executa. Não é um bloqueio distribuído entre funções Vercel e não coordena aplicativos de terceiros. As respostas 429 dessas disputas são tratadas com pausa e tentativas limitadas, sem promessa de eliminar toda recusa do provedor.
- 14/10/2026: implementado intervalo de 450 ms, até quatro repetições com pausas crescentes e variação aleatória, `Retry-After` sem encurtar o prazo informado e até 45 segundos para espera/repetição da chamada. Pausas longas e cota diária encerram a tentativa como pendente. Preparação da autorização fica dentro da fila para evitar renovação simultânea na mesma instância.
- 14/10/2026: testes de concorrência, contas independentes, pausa compartilhada, datas HTTP, limite diário, falha persistente e recuperação passaram em `scripts/testar-bling-limite.mjs`. Regressões de permissões Bling, estoques, atualização por empresa e TypeScript aprovadas.
- 14/10/2026: consulta real e somente leitura de `/pedidos/vendas` na Bom de Compras, limitada a um pedido de hoje, aceita pelo Bling usando o cliente corrigido. Não houve escrita de pedidos ou estoques. Isso confirma acesso à API naquele instante, não comprova a conclusão de uma sincronização inteira nem resolve a permissão de depósitos.
