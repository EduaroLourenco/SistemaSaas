# 08 — Estoques no produto

Status: publicado em 14/10/2026; Bling depende de permissão de leitura de depósitos e nova autorização

Exibir origem e nomes reais dos depósitos, Full separado, saldos zero e atualização. Painel contextual ao produto e acesso à tela completa. Indicar indisponibilidade de conexão sem usar saldo antigo como atual.

## Comments

- 12/10/2026: estrutura db/37 já instalada; Meli já sincronizado. Bling depende de credenciais de aplicativo presentes na produção e ausentes localmente. Não declarar a leitura do Bling concluída sem executar e conferir.
- 13/10/2026: aba Estoques dentro do produto e do anúncio, com busca exata de SKU, origem, depósito, disponível/físico/reservado e data. Full separado, saldo compartilhado identificado e sem somar ERP com canal. API exige sessão e preserva a operação.
- 13/10/2026: consulta real por produto validada nas duas empresas. Prévia mobile verificou Full zero, depósito com saldo e integração aguardando. Testes de estoque passaram. Bling segue explicitamente incompleto; nenhum saldo foi inventado.
- 14/10/2026: usuário informou `403 /depositos` com a descrição de `insufficient_scope`. Documentação oficial do Bling confirma autorização insuficiente. As permissões vêm do cadastro do aplicativo; adicionar `scope` à URL ou renovar token não concede acesso. Referências: https://developer.bling.com.br/erros-comuns e https://developer.bling.com.br/aplicativos.
- 14/10/2026: cliente passou a explicar essa recusa em português, apontando a leitura que falta e a reconexão. Erros 401 e outros 403 continuam distintos. Aba ERP ganhou ajuda e teve a afirmação obsoleta “Estoque ainda não é lido” corrigida. Manual inclui depósitos, revisão de permissões e o efeito documentado: salvar alterações de escopos revoga as autorizações de todas as empresas do mesmo aplicativo.
- 14/10/2026: testes `testar-bling-permissoes.mjs`, `testar-estoques.mjs` e verificação TypeScript aprovados. Falha de escopo interrompe a consulta, registra o erro na integração correta, não renova autorização nem grava saldos. A liberação da permissão no Bling e a leitura real dos estoques continuam pendentes; nenhuma configuração de autorização foi alterada por esta correção.
