-- ─────────────────────────────────────────────────────────────────────
--  A tarifa como o próprio Mercado Livre a informa
--
--  A listagem do hub traz a comissão LÍQUIDA — já descontado o bônus de
--  campanha — e só em 39,5% dos pedidos. O relatório "Vendas BR" do
--  próprio Meli traz a tarifa CHEIA e o desconto em colunas separadas, em
--  99,1% deles.
--
--  Conferido pedido a pedido, os dois batem ao centavo:
--
--    tarifa cheia 217,10 − bônus 132,15 = 84,95  (o que o hub informou)
--    tarifa cheia 233,32 − bônus 101,41 = 131,91
--
--  Nenhum dos dois estava errado: mediam coisas diferentes. Guardar as
--  duas pontas é o que permite responder "quanto a campanha economizou",
--  que hoje não tem resposta — a redução de tarifa aparecia só como um
--  cobrado menor que o de tabela, sem valor em reais.
-- ─────────────────────────────────────────────────────────────────────

begin;

alter table pedidos
  add column if not exists comissao_bruta  numeric(14,2),
  add column if not exists desconto_tarifa numeric(14,2);

comment on column pedidos.comissao_bruta is
  'Tarifa de venda cheia, antes do bônus de campanha. Vem do relatório do canal.';
comment on column pedidos.desconto_tarifa is
  'Bônus/desconto sobre a tarifa. comissao = comissao_bruta - desconto_tarifa.';

/*
 * De onde veio a comissão que está em `pedidos.comissao`.
 *
 * `comissao_derivada` era booleano e só distinguia "informada" de
 * "reconstruída". Agora há três procedências com confiabilidade
 * diferente, e a ordem importa na hora de reimportar: o relatório do
 * canal nunca deve ser sobrescrito por uma reconstrução nossa.
 */
do $$
begin
  if not exists (select 1 from pg_type where typname = 'origem_comissao') then
    create type origem_comissao as enum ('canal', 'hub', 'derivada');
  end if;
end $$;

alter table pedidos
  add column if not exists comissao_origem origem_comissao;

-- Preenche o que já existe: o booleano antigo carrega a informação.
update pedidos
   set comissao_origem = case when comissao_derivada then 'derivada'::origem_comissao
                              else 'hub'::origem_comissao end
 where comissao is not null and comissao_origem is null;

comment on column pedidos.comissao_origem is
  'canal = relatório do próprio marketplace; hub = listagem da Vtrina; derivada = reconstruída.';

commit;
