# 01 — O que aconteceu na semana, ao lado do número

Status: **feito em 21/10/2026**, com duas partes de fora (abaixo).

A linha do tempo está no Termômetro, logo abaixo do gráfico de dia a dia:
`src/lib/dados/acontecimentos-semana.ts` + o painel "O que aconteceu" em
`termometro-cliente.tsx`. Teste em `scripts/testar-acontecimentos.mjs`.

## O que entrou

- **Campanha que começou ou terminou**, de `planejamento_itens`.
- **Mudança de preço acima de 10%**, de `anuncio_estoque_diario.preco`,
  agrupada por SKU e só em anúncio ativo.
- **Estoque que acabou ou voltou**, com o marcador de 40 mil (sob encomenda)
  fora da conta.

Os cortes foram medidos no histórico real: 1% de variação dava 562
acontecimentos numa semana, 10% dá dezoito.

## O que ficou de fora, e por quê

1. **Anúncio pausado, reativado ou publicado** — `anuncios.status` continua sem
   histórico. Precisa de uma tabela de mudanças ou de uma coluna de data antes
   de virar linha do tempo. Sem isso, a tela só saberia o estado de agora.
2. **Anotação à mão** — o acontecimento que o sistema não mede (greve da
   transportadora, problema na fábrica, ação do concorrente). Precisa de uma
   tabela `anotacoes_semana` com data, conta e texto, mais a tela de escrever.
   O componente da linha do tempo já aceita um quarto tipo sem mudança.
