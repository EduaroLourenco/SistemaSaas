# 08 — Estoques no produto

Status: publicado em 14/10/2026; validação do Bling pendente

Exibir origem e nomes reais dos depósitos, Full separado, saldos zero e atualização. Painel contextual ao produto e acesso à tela completa. Indicar indisponibilidade de conexão sem usar saldo antigo como atual.

## Comments

- 12/10/2026: estrutura db/37 já instalada; Meli já sincronizado. Bling depende de credenciais de aplicativo presentes na produção e ausentes localmente. Não declarar a leitura do Bling concluída sem executar e conferir.
- 13/10/2026: aba Estoques dentro do produto e do anúncio, com busca exata de SKU, origem, depósito, disponível/físico/reservado e data. Full separado, saldo compartilhado identificado e sem somar ERP com canal. API exige sessão e preserva a operação.
- 13/10/2026: consulta real por produto validada nas duas empresas. Prévia mobile verificou Full zero, depósito com saldo e integração aguardando. Testes de estoque passaram. Bling segue explicitamente incompleto; nenhum saldo foi inventado.
