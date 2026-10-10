-- ═══════════════════════════════════════════════════════════════════════
--  36. O piso de promoção é da empresa, não do código
--
--  ── O que era fixo ──
--
--  O motor de promoções tinha 5% escritos em dois lugares, com dois
--  sentidos diferentes:
--
--    · desconto MÍNIMO que o canal exige para aceitar uma oferta — isso é
--      regra do Mercado Livre, continua no código;
--    · tolerância para aceitar oferta ABAIXO do preço de referência —
--      essa é decisão comercial, e estava fixa junto da outra.
--
--  Enquanto o número de referência era a Fórmula base da Probel (o preço
--  PRETENDIDO), aceitar 5% abaixo era negociar. Quando o número passou a
--  ser piso calculado do custo — como na Bom de Compras —, os mesmos 5%
--  viraram "vender abaixo do mínimo": num item de R$ 1.080 de piso são
--  R$ 54 que ninguém decidiu abrir mão.
--
--  As duas leituras são legítimas, e qual vale depende da empresa e da
--  campanha. Então o número sai do código e vira cadastro.
--
--  ── O que fica guardado ──
--
--  Dois campos, com o padrão igual ao comportamento de hoje, para que
--  nenhuma empresa mude de resultado por causa desta migração:
--
--    promo_tolerancia_pct = 5  → segue aceitando 5% abaixo da referência
--    promo_usar_como_piso = false → o número segue sendo alvo a propor
--
--  A Bom de Compras, que trabalha com piso, passa a querer 0 e true. Fica
--  por tela, não por update aqui: é escolha dela, e o valor aparece onde
--  se processa a planilha.
-- ═══════════════════════════════════════════════════════════════════════

alter table operacoes
  add column if not exists promo_tolerancia_pct numeric(5,2) not null default 5
    check (promo_tolerancia_pct >= 0 and promo_tolerancia_pct <= 50),
  add column if not exists promo_usar_como_piso boolean not null default false;

comment on column operacoes.promo_tolerancia_pct is
  'Quanto a oferta do canal pode ficar abaixo do preço de referência e '
  'ainda ser aceita, em pontos percentuais. 5 reproduz o comportamento '
  'antigo (tabela como alvo); 0 é o certo quando o número é piso de custo. '
  'Não confundir com o desconto mínimo que o canal exige, que é regra do '
  'Mercado Livre e segue no código. Ver db/36.';

comment on column operacoes.promo_usar_como_piso is
  'Padrão da empresa: o número da Fórmula base é piso (true) ou preço a '
  'propor (false). Com true o motor não altera preço nenhum — compara a '
  'oferta do canal com o mínimo e decide participar. Ver db/36.';

-- ═══════════════════════════════════════════════════════════════════════
--  CONFERIR
--
--    select nome, promo_usar_como_piso, promo_tolerancia_pct from operacoes;
--
--  Esperado logo após rodar: todas com false e 5 — ou seja, nada mudou de
--  comportamento. A Bom de Compras vira true/0 pela tela de Processar
--  planilha.
--
--  SE ALGO QUEBRAR: O DESFAZER
--
--    alter table operacoes
--      drop column if exists promo_tolerancia_pct,
--      drop column if exists promo_usar_como_piso;
-- ═══════════════════════════════════════════════════════════════════════
