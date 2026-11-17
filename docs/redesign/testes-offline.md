# Regressões de domínio — checkpoint do piloto

Comando: `node scripts/redesign/testar-offline.mjs`.

Foram executados dez scripts de regressão existentes, selecionados por inspeção de suas dependências. Os subprocessos carregaram um bloqueio de rede em `fetch`, HTTP/HTTPS, TCP e TLS; não foram carregadas credenciais ou variáveis de `.env.local`. A suíte completa `testar-tudo.mjs` não foi executada porque também inclui escrita em banco real.

| Regressão existente | Resultado |
|---|---|
| Planejamento | Passou: 14 cenários de domínio, mais identificação de anúncio |
| Filtros de queda | Passou: texto, limites, nulos, estoque zero e cobertura parcial |
| Causa da queda | Passou: dez casos |
| Filtros de tráfego pago | Passou: contas, janelas, série independente e cobertura de margem |
| Janela de tráfego pago | Passou |
| Resumo financeiro | Passou |
| Portão de escrita | Passou |
| Pedido nunca pago | Passou |
| Central de anúncios | Passou |
| Atualização | Falhou: fixture da suíte não acompanha a arquitetura atual da fila |

Total: **9 de 10 passaram**. Log integral local: `output/redesign/testes-offline.json`.

A falha de `scripts/testar-atualizacao.mjs` ocorre quando o GET de `/api/atualizar` chama `estadoDaEmpresa` em `src/lib/atualizacao-fila.ts`, que usa `clientePrivilegiado` sem stub neste teste. A execução parou por `SUPABASE_SERVICE_ROLE_KEY ausente`, antes de qualquer acesso de rede. O teste ainda espera o controlador anterior (`executar`, `rodando`, `etapas`), enquanto o produto usa a fila atual. A regra de negócio e o teste existente foram preservados; é necessária uma manutenção específica da fixture da suíte, fora da transformação visual.

Estes resultados verificam partes do domínio em isolamento. Não comprovam autenticação real, RLS, permissões com sessão, troca de empresas, integrações, exportações com dados reais ou aceite visual. Os resultados de navegador e compilação pertencem ao relatório do checkpoint.
