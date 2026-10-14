# 09 — Publicação bloqueada pelo agendamento de estoque

Status: concluído; publicação em produção confirmada

## Problema

O GitHub recebeu os commits, mas a integração Vercel marcou `ab8fdc3` como falha de publicação. O endereço de diagnóstico (`https://vercel.link/3Fpeeb1`) aponta para o limite de frequência de Cron Jobs no plano Hobby.

Em `vercel.json`, `/api/cron/estoques` estava agendado com `3,33 * * * *`, a cada meia hora. A expressão não é aceita no Hobby, que permite uma execução diária por agendamento.

## Correção

- Estoque automático configurado para `3 7 * * *`, diariamente por volta das 04h de Brasília. O plano não garante execução no minuto exato.
- Atualização manual de estoque pelo botão **Atualizar agora** preservada.
- Outras rotinas e proteção dos endpoints preservadas. Nenhum serviço externo ou plano pago acrescentado.
- Fonte: https://vercel.com/docs/cron-jobs/usage-and-pricing

## Comments

- 14/10/2026: conferido que `main` local e GitHub estavam em `ab8fdc3`. O problema é a recusa de publicação, não um commit ausente. O acesso direto à Vercel continua sem autorização; acompanhar a nova tentativa pela integração do GitHub e verificar o resultado antes de declarar online.
- 14/10/2026: `1dc1d41` publicado com sucesso no ambiente Production, implantação `HZWsmPJ3PmvqeFSfPa851U46KvcF`, confirmada pelo GitHub às 09:12 de Brasília. O domínio principal respondeu 200 e seu pacote público contém `/produtos` e “Resultados de vendas”. A interface autenticada e o Bling ainda dependem de validação com login.
