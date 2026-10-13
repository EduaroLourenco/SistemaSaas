# 01 — Atualizar dados

Status: concluído no código; publicação pendente

Permitir a atualização por qualquer membro da empresa atual. Manter autenticação, isolamento, limites e o bloqueio ao trocar de empresa. Exibir falhas úteis, sem sucesso falso.

## Verificação

Testar permissões, empresa, paginação e falhas parciais. Preservar testes de origem e zero versus dado indisponível.

## Comments

- 12/10/2026: iniciado a partir do PDF; há correções anteriores de origem/estoque ainda locais a preservar.
- 12/10/2026: a rota agora aceita qualquer membro com acesso à empresa, inclusive leitor. Continua recusando sessão ausente, empresa alheia e troca de empresa durante o processamento. Testes de atualização, origens e estoques passaram. Falha na leitura de visitas não vira lista vazia, e depósitos sem nome vêm identificados como tal.
- A leitura de fontes com credenciais ausentes/expiradas continua retornando pendência específica; não se altera o saldo do canal. Para aparecer online, esta entrega precisa de implantação Vercel.
