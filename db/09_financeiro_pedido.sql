-- ════════════════════════════════════════════════════════════════
--  09 — Dados financeiros do pedido
--  Rode depois do 08.
-- ════════════════════════════════════════════════════════════════

/* ── Por que estas colunas existem ────────────────────────────────

   O hub preenche a coluna de comissão em apenas 31% dos pedidos do
   Mercado Livre. Conferido na planilha de origem, não no banco: 2 de 6
   no arquivo, exatamente o que havia sido importado. A falta é da fonte.

   Mas `Valor a Receber (Vendedor)` vem preenchido em TODOS. E a conta
   fecha:

     total − a receber − frete do vendedor = comissão

     383,59 − 250,70 − 107,95 =  24,94   informada:  24,94
    2999,84 − 2740,16 −   0,00 = 259,68   informada: 259,68

   Duas de duas, sem diferença de centavo. Guardando as parcelas, a
   comissão passa a existir para 100% dos pedidos em vez de 31%.

   ── Por que guardar as parcelas e não só o resultado ──

   Um número derivado que ninguém consegue recompor vira artigo de fé.
   Com `liquido_recebido` e `frete_vendedor` no banco, qualquer pessoa
   refaz a conta e confere. A derivação deixa de ser opinião do código.  */

alter table pedidos
  add column if not exists liquido_recebido numeric(14,2),
  add column if not exists frete_vendedor   numeric(14,2),
  -- Falso quando o canal informou a comissão; verdadeiro quando ela foi
  -- calculada aqui. A tela precisa poder dizer qual é qual: número
  -- calculado apresentado como informado é confiança que não foi ganha.
  add column if not exists comissao_derivada boolean not null default false;

comment on column pedidos.liquido_recebido is
  'O que o canal repassa depois de reter tudo. Base do cálculo da comissão.';
comment on column pedidos.frete_vendedor is
  'Frete bancado pelo vendedor, retido pelo canal junto com a comissão.';
comment on column pedidos.comissao_derivada is
  'true = comissão calculada de total − líquido − frete; false = informada pelo canal.';
