-- ═══════════════════════════════════════════════════════════════════════
--  PLATAFORMA — ARQUIVOS (Supabase Storage)
--
--  As planilhas não ficam no banco relacional: o arquivo vai para o Storage
--  e a TABELA guarda o caminho. Um .xlsx de 3 MB dentro de uma coluna bytea
--  entra em todo backup, incha o dump e nunca mais sai.
--
--  Convenção de caminho — o primeiro segmento é SEMPRE a operação, porque é
--  o que as políticas usam para isolar:
--    importacoes/{operacao_id}/{ano}/{importacao_id}.xlsx
--    exportacoes/{operacao_id}/{ano}/{exportacao_id}.xlsx
--    anexos/{operacao_id}/{entidade}/{id}/{arquivo}
--
--  Executar depois de 04_seed.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
--  1. Buckets
--
--  Todos PRIVADOS (public = false). O acesso é por URL assinada, com
--  validade curta, gerada no servidor. Bucket público aqui significaria
--  custo, margem e folha de pagamento acessíveis por quem tivesse o link.
-- ─────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'importacoes',
    'importacoes',
    false,
    52428800,                                  -- 50 MB
    array[
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', -- .xlsx
      'application/vnd.ms-excel',                                          -- .xls
      'text/csv',
      'text/plain'
    ]
  ),
  (
    'exportacoes',
    'exportacoes',
    false,
    104857600,                                 -- 100 MB (backup JSON é grande)
    array[
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/pdf',
      'application/json',
      'application/zip'
    ]
  ),
  (
    'anexos',
    'anexos',
    false,
    20971520,                                  -- 20 MB
    array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
  )
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────
--  2. Políticas
--
--  Mesma regra do resto do sistema: o primeiro segmento do caminho é o
--  uuid da operação, e só membro daquela operação enxerga o arquivo.
-- ─────────────────────────────────────────────────────────────────────

-- Extrai a operação do caminho. Devolve NULL — e não erro — quando o
-- primeiro segmento não é um uuid. Sem esta guarda, um único arquivo com
-- caminho fora do padrão faria o cast estourar e a política inteira parar
-- de avaliar, trancando todo mundo para fora do bucket.
create or replace function operacao_do_caminho(caminho text)
returns uuid
language sql
immutable
as $$
  select case
    when (storage.foldername(caminho))[1] ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (storage.foldername(caminho))[1]::uuid
    else null
  end;
$$;

-- Leitura: qualquer membro da operação, inclusive papel `leitor`.
create policy arquivos_leitura on storage.objects
  for select
  using (
    bucket_id in ('importacoes', 'exportacoes', 'anexos')
    and pode_ver_operacao(operacao_do_caminho(name))
  );

-- Envio: só quem pode editar a operação.
create policy arquivos_envio on storage.objects
  for insert
  with check (
    bucket_id in ('importacoes', 'exportacoes', 'anexos')
    and pode_editar_operacao(operacao_do_caminho(name))
  );

create policy arquivos_alteracao on storage.objects
  for update
  using (
    bucket_id in ('importacoes', 'exportacoes', 'anexos')
    and pode_editar_operacao(operacao_do_caminho(name))
  );

-- Exclusão: idem. A limpeza automática roda com service_role e ignora RLS.
create policy arquivos_exclusao on storage.objects
  for delete
  using (
    bucket_id in ('importacoes', 'exportacoes', 'anexos')
    and pode_editar_operacao(operacao_do_caminho(name))
  );

-- ─────────────────────────────────────────────────────────────────────
--  3. Ligação entre arquivo e registro
--
--  `importacoes` e `exportacoes` ganham a coluna do caminho no Storage.
--  Guardar bucket e caminho separados evita ter de fatiar string depois.
-- ─────────────────────────────────────────────────────────────────────

alter table importacoes
  add column if not exists bucket  text not null default 'importacoes',
  add column if not exists caminho text,
  add column if not exists tamanho_bytes bigint;

alter table exportacoes
  add column if not exists bucket text not null default 'exportacoes';

-- ─────────────────────────────────────────────────────────────────────
--  4. Faxina
--
--  Exportação é derivada: pode ser gerada de novo a qualquer momento.
--  Guardar para sempre só custa dinheiro. Importação é o oposto — é a
--  prova de origem do número, então fica.
-- ─────────────────────────────────────────────────────────────────────

create or replace function limpar_exportacoes_antigas(dias integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removidas integer;
begin
  with alvo as (
    delete from exportacoes
    where criado_em < now() - make_interval(days => dias)
    returning caminho
  )
  select count(*) into removidas from alvo;

  -- O objeto no Storage sai por rotina do servidor, que tem a chave de
  -- serviço. Esta função só limpa o registro e devolve quantos saíram.
  return removidas;
end;
$$;

comment on function limpar_exportacoes_antigas is
  'Remove registros de exportação com mais de N dias. Agende via pg_cron ou pela rotina de manutenção.';
