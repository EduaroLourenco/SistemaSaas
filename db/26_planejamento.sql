-- Planejamento comercial independente das promoções dos canais.
-- Qualquer membro com acesso à operação pode planejar, conforme decisão de produto.
-- Não altera permissões, tabelas ou dados de funcionalidades existentes.
begin;
create table if not exists planejamento_itens (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references operacoes(id) on delete cascade,
  natureza text not null check (natureza in ('campanha','acao')),
  campanha_id uuid,
  titulo text not null check (length(trim(titulo)) between 1 and 160),
  inicio date not null,
  fim date not null check (fim >= inicio and fim - inicio <= 730),
  status text not null default 'Rascunho' check (status in ('Rascunho','Planejada','Aprovada','Em andamento','Concluída','Cancelada')),
  tipo text not null,
  etapa text not null default '',
  cor text not null default '#0f766e' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  skus text[] not null default '{}',
  canais uuid[] not null default '{}',
  contas uuid[] not null default '{}',
  detalhes jsonb not null default '{}' check (jsonb_typeof(detalhes) = 'object'),
  revisao integer not null default 1,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique(id, operacao_id),
  check (campanha_id is null or (natureza = 'acao' and campanha_id <> id)),
  foreign key (campanha_id, operacao_id) references planejamento_itens(id, operacao_id) on delete cascade
);
create index if not exists planejamento_periodo on planejamento_itens(operacao_id, inicio, fim);
create index if not exists planejamento_campanha on planejamento_itens(campanha_id);
create table if not exists planejamento_grupos (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references operacoes(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 100),
  skus text[] not null default '{}',
  revisao integer not null default 1,
  atualizado_em timestamptz not null default now(),
  unique(operacao_id, nome)
);
create table if not exists planejamento_tipos (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references operacoes(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 60),
  cor text not null check (cor ~ '^#[0-9a-fA-F]{6}$'),
  revisao integer not null default 1,
  atualizado_em timestamptz not null default now(),
  unique(operacao_id, nome)
);
create or replace function planejamento_revisao() returns trigger language plpgsql set search_path = public as $$
begin
  if TG_OP = 'UPDATE' then
    if new.operacao_id <> old.operacao_id then raise exception 'Não é permitido transferir registros entre operações.'; end if;
    new.revisao := old.revisao + 1;
  else new.revisao := 1;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
create or replace function planejamento_parentesco() returns trigger language plpgsql set search_path = public as $$
begin
  if new.campanha_id is not null and not exists (
    select 1 from planejamento_itens p where p.id = new.campanha_id and p.operacao_id = new.operacao_id and p.natureza = 'campanha'
  ) then raise exception 'A ação deve pertencer a uma campanha desta operação.'; end if;
  if TG_OP = 'UPDATE' and old.natureza <> new.natureza then raise exception 'Não é permitido mudar a natureza do registro.'; end if;
  return new;
end;
$$;
drop trigger if exists planejamento_parentesco on planejamento_itens;
create trigger planejamento_parentesco before insert or update on planejamento_itens for each row execute function planejamento_parentesco();
do $$ declare t text; begin
  foreach t in array array['planejamento_itens','planejamento_grupos','planejamento_tipos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists planejamento_acesso on %I', t);
    execute format('create policy planejamento_acesso on %I for all to authenticated using (pode_ver_operacao(operacao_id)) with check (pode_ver_operacao(operacao_id))', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('drop trigger if exists planejamento_revisao on %I', t);
    execute format('create trigger planejamento_revisao before insert or update on %I for each row execute function planejamento_revisao()', t);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
