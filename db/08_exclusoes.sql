-- ════════════════════════════════════════════════════════════════
--  08 — Exclusões de análise
--  Rode depois do 07.
-- ════════════════════════════════════════════════════════════════

/* ── O problema ───────────────────────────────────────────────────

   Um dia de lote entrou pela importação: 129 pedidos da Loja própria em
   27/08, 117 deles cancelados, vários com o mesmo valor e códigos em
   sequência. O dado está correto — foi isso que o hub exportou — mas ele
   descreve um evento de sistema, não a operação.

   Deixado como está, esse dia sozinho leva o cancelamento da semana a
   63% e a receita a +128%. Toda leitura acima dele fica errada.

   Apagar seria pior: o registro é verdadeiro, e apagar dado verdadeiro
   para melhorar um gráfico é como relatório se descola da realidade.

   A saída é separar o que é FATO do que entra na ANÁLISE. A linha
   continua no banco, inteira; a análise passa a ignorá-la, com registro
   de quem decidiu isso e por quê.

   ── A regra que acompanha ──

   Exclusão que age em silêncio é mais perigosa que o número torto que
   ela corrige: quem olha não sabe que está vendo um recorte. Por isso
   toda tela que aplica exclusão precisa DIZER que aplicou, e quanto
   mudou. Isso é responsabilidade do front, e está escrito aqui porque é
   parte do desenho, não detalhe de implementação.                       */

create table exclusoes_analise (
  id            uuid primary key default gen_random_uuid(),
  operacao_id   uuid  not null references operacoes(id) on delete cascade,

  data_inicio   date  not null,
  data_fim      date  not null,

  -- Nulo = o dia inteiro, em todos os canais. Preenchido = só aquele canal.
  canal_id      uuid  references canais(id) on delete cascade,
  -- Nulo com canal_id preenchido = todas as contas daquele canal.
  conta_canal_id uuid references contas_canal(id) on delete cascade,

  -- Obrigatório de propósito. Exclusão sem justificativa vira folclore:
  -- daqui a seis meses ninguém sabe por que aquele dia sumiu, e ninguém
  -- ousa reverter.
  motivo        text  not null check (length(trim(motivo)) >= 3),

  criado_por    uuid  references usuarios(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  check (data_fim >= data_inicio)
);

create index on exclusoes_analise (operacao_id, data_inicio, data_fim);

comment on table exclusoes_analise is
  'Períodos que as telas de análise ignoram. O dado permanece no banco.';

alter table exclusoes_analise enable row level security;

create policy exclusoes_leitura on exclusoes_analise
  for select using (pode_ver_operacao(operacao_id));

create policy exclusoes_escrita on exclusoes_analise
  for all using (pode_editar_operacao(operacao_id))
  with check (pode_editar_operacao(operacao_id));

create trigger set_atualizado_em_exclusoes_analise
  before update on exclusoes_analise
  for each row execute function set_atualizado_em();
