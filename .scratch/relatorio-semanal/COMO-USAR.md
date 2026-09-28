# O relatório semanal — como usar

Escrito em 28/09/2026, depois da primeira versão ficar de pé.

---

## O endereço

```
https://SEU-DOMINIO/relatorio/<chave>
```

A chave é a variável `RELATORIO_CHAVE`. Ela existe no `.env.local` desta
máquina e **precisa ser criada na Vercel** para o link funcionar no ar.
Sem a variável, a página só abre para quem está logado no sistema.

Quem tem o link lê tudo e edita os textos. Quem não tem recebe 404 — não
existe tela de login no caminho, e não há como adivinhar o endereço.

Trocar a chave invalida os links antigos na hora. É o jeito de cortar
acesso de alguém que saiu.

**Janela:** o botão `7d · 14d · 30d` no topo troca o período, e o valor
fica na URL (`?dias=14`). O link que você mandar já abre no período que
você escolheu.

---

## O que a página responde

| Seção | Pergunta |
|---|---|
| Estado dos dados | até quando cada fonte vai, e se está em dia |
| O que atacar | o que resolve nesta semana e o que leva tempo |
| A operação toda | receita, pedido, ticket, cancelamento, visita, conversão |
| Loja por loja | os mesmos números por canal, com a série do dia |
| Produtos | curva A e B, preço, estoque, catálogo, conversão |
| Catálogo | quem ganha a página do Mercado Livre e por quanto |
| Estoque | ruptura, cobertura crítica, parado, encerrado |
| Multicanal | mesmo SKU com preço diferente, e venda migrando de canal |
| Tráfego pago | Product Ads, com o período da última importação |
| Financeiro | cobertura de custo e margem apurada |
| Planejamento estratégico | gap de meta e as alavancas, mais o seu bloco de notas |
| Dados e pendências | o que falta para a leitura ficar completa |

Cada número tem quatro comparações: janela anterior, média das quatro
anteriores, e **a melhor janela do ano**. O botão "comparar" em cada
cartão abre as três.

---

## O lápis

Todo texto de interpretação tem um lápis. O que você escrever substitui o
meu e fica salvo no banco — na próxima leitura, e para quem abrir o link,
aparece a sua versão. "Voltar ao texto original" apaga a sua e devolve a
minha.

A seção de estratégia tem um **bloco em branco**, grande, só seu.

---

## Antes de cada leitura

O relatório é montado do banco. Se a sincronização não rodou, ele mostra
dado velho e diz que está velho, na primeira faixa da página. Enquanto a
Vercel não tiver as variáveis do Mercado Livre, a atualização depende de
rodar à mão.

Ordem certa:

1. Sincronizar Mercado Livre (duas contas) e VTEX.
2. Gerar o instantâneo de estoque e catálogo.
3. Abrir o relatório.

---

## O que ainda depende de você

| O quê | Por quê |
|---|---|
| `RELATORIO_CHAVE` na Vercel | sem ela o link não abre no ar |
| Rodar `db/18`, `db/19`, `db/20` e `db/21` | promoções, sincronização automática, cadastro de cliente, estoque e catálogo no banco |
| Variáveis do Mercado Livre e `CRON_SECRET` na Vercel | para o dado entrar sozinho todo dia |
| Custo dos produtos | hoje 8 de 146; a margem cobre 14% da receita |
| Visitas da VTEX | sem elas a Loja própria não tem conversão, e ela é 88% da receita |
| Google Ads | não existe tabela nem tela; a migração 21 cria a tabela |
| Token da Vtrina | a exportação manual cobre Magalu, Casas Bahia, Madeira e WebContinental só até a data do arquivo |
