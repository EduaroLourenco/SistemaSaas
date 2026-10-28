-- ─────────────────────────────────────────────────────────────────────
--  A folga abaixo do piso, lembrada por tipo de campanha
--
--  Na tela de Automações a folga é um campo no topo que volta a 5% a
--  cada visita. Quem trabalha ali muda esse número o tempo todo, e o
--  número NÃO é o mesmo para todo tipo de campanha: na Probel, a régua
--  é 5% nas automáticas e 0% no pré-acordo — porque ali o preço foi
--  negociado a dedo e descer dele é desfazer a negociação.
--
--  Então a memória é por operação E por tipo de campanha. Uma linha por
--  tipo, mais a linha '*', que é o padrão de quem ainda não tem régua
--  própria.
--
--  ── Por que não entrou em `regras_promocao` ──
--
--  São coisas diferentes. A regra decide SE o item entra ("se a margem
--  passa de 20%, aceitar"); a folga é a régua que a pessoa gira na mão
--  enquanto confere, e que ela quer encontrar como deixou. Misturar as
--  duas faria toda mudança de folga virar uma edição de regra, com
--  histórico e tudo — peso que o campo não pede.
--
--  Nomes: a proposta em `.scratch/automacoes/automacao-em-massa.md`
--  chamava a tabela de `regras_automacao`. Virou `folgas_campanha`
--  porque `regras_promocao` (migração 44) já ocupa o lugar de "regra",
--  e duas tabelas com nome parecido e papel diferente é como alguém
--  grava na errada.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.folgas_campanha (
  operacao_id uuid not null references public.operacoes(id) on delete cascade,
  -- Tipo de campanha do canal (DEAL, PRE_NEGOTIATED, ...) ou '*' para o padrão.
  tipo_campanha text not null,
  -- Em pontos percentuais: 5 = 5% abaixo do piso.
  folga_pct numeric(5,2) not null default 5,
  atualizada_por uuid references auth.users(id),
  atualizada_em timestamptz not null default now(),
  primary key (operacao_id, tipo_campanha),
  constraint folgas_campanha_faixa check (folga_pct >= 0 and folga_pct <= 30)
);

-- ─────────────────────────────────────────────────────────────────────
--  RLS no padrão das outras tabelas de dado
-- ─────────────────────────────────────────────────────────────────────
alter table public.folgas_campanha enable row level security;
alter table public.folgas_campanha force row level security;

drop policy if exists folgas_campanha_leitura on public.folgas_campanha;
create policy folgas_campanha_leitura on public.folgas_campanha
  for select using (pode_ver_operacao(operacao_id));

drop policy if exists folgas_campanha_escrita on public.folgas_campanha;
create policy folgas_campanha_escrita on public.folgas_campanha
  for all using (pode_editar_operacao(operacao_id))
  with check (pode_editar_operacao(operacao_id));

grant select, insert, update, delete on public.folgas_campanha to authenticated;
