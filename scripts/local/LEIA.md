# Scripts locais

Rodam na máquina do Eduardo, não na Vercel. Existem porque a
sincronização automática ainda não está ligada: enquanto faltar
`CRON_SECRET` e a autorização do Mercado Livre no ambiente da Vercel, o
dado entra por aqui.

Todos leem `.env.local` para chegar no Supabase, e nenhum grava segredo
em lugar nenhum.

```powershell
# 1. Mercado Livre, as duas contas (~7 min)
node --conditions=react-server scripts/local/sincronizar-meli.mjs

# 2. Loja própria (~3 min)
node --conditions=react-server scripts/local/sincronizar-vtex.mjs 2026-08-01 2026-09-28

# 3. Estoque, preço visível e catálogo (~6 min)
node scripts/local/instantaneo-meli.mjs

# 4. Publicidade do Mercado Livre (~1 min)
node --conditions=react-server scripts/local/sincronizar-ads.mjs 2026-09-22 2026-09-28

# 5. Canais sem API, a partir da exportação da Vtrina
node scripts/local/importar-pedidos-vtrina.mjs
```

## Antes de rodar o 1 e o 3

O token de acesso do Mercado Livre dura 6 horas. Renove pelo CLI de cada
pasta — **nunca daqui**, porque o refresh token é de uso único e rotacioná-lo
aqui quebraria as automações:

```powershell
cd "C:\Users\dudu4\OneDrive\Desktop\Meli+"; node .\src\cli.mjs me
cd "C:\Users\dudu4\OneDrive\Desktop\apis\Mercado Livre Principal"; node .\src\cli.mjs me
```

## O que cada um faz

**sincronizar-meli** — catálogo, pedidos, visitas e consolidação diária
das duas contas. Usa o access token já renovado, em memória.

**sincronizar-vtex** — pedidos da loja própria. Pedido criado e nunca
pago fica de fora: a VTEX abre o pedido antes de o cartão responder, e
contá-lo põe a loja com metade de cancelamento que nunca foi venda.

**instantaneo-meli** — gera `src/lib/dados/instantaneo-meli.json` com
estoque, preço visível, campanha, posição de catálogo, reputação e
perguntas sem resposta. O relatório lê deste arquivo enquanto a migração
21 não roda; depois dela, o dado passa a vir do banco.

**sincronizar-ads** — campanhas e anúncios patrocinados das duas contas,
com gasto, cliques, receita atribuída e ACOS. Sem data, pega os últimos
60 dias. Passe a janela do relatório para o bloco de tráfego pago falar
do mesmo período do resto da página.

**importar-pedidos-vtrina** — lê a exportação de pedidos e grava só os
canais que não têm API (Magalu, Casas Bahia, Madeira Madeira,
WebContinental). Mercado Livre e VTEX são ignorados de propósito: os dois
já entram por API, com mais campo e mais fresco, e importar por cima
duplicaria a receita.

O caminho do arquivo está no começo do script — troque quando exportar um
novo.
