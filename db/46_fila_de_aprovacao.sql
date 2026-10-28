-- ─────────────────────────────────────────────────────────────────────
--  A fila de aprovação (degrau 2 de .scratch/automacoes/automacao-em-massa.md)
--
--  O pedido do Eduardo tinha duas metades que brigam: "aceitar
--  automaticamente... mas que eu confiro e vejo o produto e promoção
--  antes de aceitar". O que concilia as duas é separar QUEM DECIDE de
--  QUANDO SAI: a regra decide sozinha e escreve aqui; o envio espera o
--  aceite dele.
--
--  `decisoes_promocao` (migração 44) já guardava a decisão com o piso e
--  a folga do momento — o que torna a linha auditável em dezembro,
--  quando a Fórmula base já mudou de vigência. Faltava o estado: uma
--  decisão escrita não é uma decisão aprovada, e sem essa diferença a
--  tabela não serve de fila.
--
--  ── Por que o título e o SKU entram na tabela ──
--
--  A fila mostra produto, preço e promoção. Sem o título guardado, abrir
--  a fila significaria reler o canal item por item só para escrever o
--  nome na tela — cota gasta para repetir o que já se sabia na hora de
--  decidir.
-- ─────────────────────────────────────────────────────────────────────

alter table public.decisoes_promocao
  add column if not exists estado text not null default 'pendente',
  add column if not exists aprovada_por uuid references auth.users(id),
  add column if not exists aprovada_em timestamptz,
  add column if not exists titulo text,
  add column if not exists sku text,
  add column if not exists preco_canal numeric(12,2),
  add column if not exists prazo date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'decisoes_promocao_estado_check'
  ) then
    alter table public.decisoes_promocao
      add constraint decisoes_promocao_estado_check
      check (estado in ('pendente', 'aprovada', 'descartada', 'enviada', 'falhou'));
  end if;
end $$;

comment on column public.decisoes_promocao.estado is
  'pendente: a regra decidiu e espera aceite. aprovada: o Eduardo aceitou, falta sair. '
  'enviada: o canal respondeu ok. falhou: o canal recusou (o motivo fica em resposta_canal). '
  'descartada: ele tirou da fila.';

/*
 * Uma linha pendente por item e promoção.
 *
 * Gerar a fila duas vezes no mesmo dia não pode empilhar duas decisões
 * para o mesmo anúncio: a segunda substitui a primeira, porque o preço
 * do canal e o piso podem ter mudado no meio. O índice é PARCIAL — o
 * histórico de enviadas e descartadas continua inteiro.
 */
create unique index if not exists decisoes_promocao_pendente_unica
  on public.decisoes_promocao (operacao_id, conta_canal_id, promocao, mlb)
  where estado = 'pendente';

create index if not exists decisoes_promocao_fila_idx
  on public.decisoes_promocao (operacao_id, estado, criada_em desc);
