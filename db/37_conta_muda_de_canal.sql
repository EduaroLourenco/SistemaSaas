-- ═══════════════════════════════════════════════════════════════════════
--  37. Conta que troca de canal leva os pedidos junto
--
--  ── O que aconteceu ──
--
--  Na Chopeiras Memo, em 14/10:
--
--    13:02  a conta "Site Próprio Wake" nasce no canal `outros`
--    13:10  o Bling sincroniza e grava 95 pedidos com canal_id = outros
--    13:12  alguém corrige a conta para o canal `vtex`
--    13:17  nova sincronização grava 5 pedidos, esses com vtex
--
--  Resultado: R$ 395 mil do site aparecendo em "outros" e R$ 12 mil em
--  "vtex", com a MESMA conta. A soma por conta estava certa; a leitura
--  por canal, que é como todas as telas abrem, estava errada.
--
--  ── Por que no banco, e não na rota ──
--
--  O canal da conta muda por três caminhos: a tela de Canais e contas, um
--  script de carga e o SQL direto. Corrigir só a rota deixaria os outros
--  dois quebrando os mesmos números, e o defeito voltaria sem ninguém
--  ligar uma coisa à outra. O gatilho pega os três.
--
--  ── A duplicata que o defeito cria ──
--
--  `pedidos` tem único (canal_id, codigo_externo), e o código do Bling é
--  `bling-<id>`, o mesmo em qualquer canal. Então a sincronização que
--  roda DEPOIS da troca não atualiza o pedido antigo: ela insere outro,
--  com o canal novo. O pedido passa a existir duas vezes e é contado
--  duas vezes.
--
--  Na Chopeiras Memo foram 5 assim — mesmo código, mesma data, mesmo
--  valor, mesmo status, gravados com 7 minutos de diferença. Mover o
--  antigo por cima do novo violaria a chave; deixá-lo onde está mantém a
--  contagem dobrada. Então a cópia velha é APAGADA, e só quando é cópia
--  mesmo: mesma conta, mesmo código, com o gêmeo já no canal de destino.
--  Os itens dela vão junto, por `on delete cascade`.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function conta_canal_arrasta_canal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedidos integer := 0;
  v_diarias integer := 0;
  v_anuncios integer := 0;
  v_presos  integer := 0;
begin
  if new.canal_id is not distinct from old.canal_id then
    return new;
  end if;

  /* A cópia velha do mesmo pedido sai: mover violaria o índice único, e
     deixá-la mantém o faturamento contado duas vezes. Só apaga o que é
     cópia da MESMA conta — nunca um pedido de outra origem. */
  with mortos as (
    delete from pedidos p
    where p.conta_canal_id = new.id
      and p.canal_id = old.canal_id
      and exists (
        select 1 from pedidos d
        where d.canal_id = new.canal_id
          and d.codigo_externo = p.codigo_externo
          and d.conta_canal_id = p.conta_canal_id
      )
    returning 1
  ) select count(*) into v_presos from mortos;

  with movidos as (
    update pedidos p set canal_id = new.canal_id
    where p.conta_canal_id = new.id
      and p.canal_id = old.canal_id
      and not exists (
        select 1 from pedidos d
        where d.canal_id = new.canal_id and d.codigo_externo = p.codigo_externo
      )
    returning 1
  ) select count(*) into v_pedidos from movidos;

  with movidos as (
    update vendas_diarias v set canal_id = new.canal_id
    where v.conta_canal_id = new.id and v.canal_id = old.canal_id
      and not exists (
        select 1 from vendas_diarias d
        where d.canal_id = new.canal_id and d.conta_canal_id = v.conta_canal_id and d.data = v.data
      )
    returning 1
  ) select count(*) into v_diarias from movidos;

  with movidos as (
    update anuncios a set canal_id = new.canal_id
    where a.conta_canal_id = new.id and a.canal_id = old.canal_id
      and not exists (
        select 1 from anuncios d
        where d.canal_id = new.canal_id and d.codigo_externo = a.codigo_externo
      )
    returning 1
  ) select count(*) into v_anuncios from movidos;

  raise notice 'conta % mudou de canal: % pedidos, % diárias e % anúncios movidos%',
    new.nome, v_pedidos, v_diarias, v_anuncios,
    case when v_presos > 0 then format(' — %s cópia(s) duplicada(s) do mesmo pedido apagada(s)', v_presos) else '' end;

  return new;
end;
$$;

comment on function conta_canal_arrasta_canal() is
  'Quando a conta muda de canal, leva pedidos, diárias e anúncios junto. '
  'Sem isso o que já foi importado fica apontando para o canal antigo e as '
  'telas, que leem por canal, mostram a mesma conta dividida em dois. Ver db/37.';

drop trigger if exists conta_canal_arrasta on contas_canal;
create trigger conta_canal_arrasta
  after update of canal_id on contas_canal
  for each row
  execute function conta_canal_arrasta_canal();

-- ─────────────────────────────────────────────────────────────────────
--  O que já ficou para trás
--
--  O gatilho só vale daqui para a frente. Esta parte conserta o que
--  existe hoje, em qualquer empresa: todo pedido, diária e anúncio cujo
--  canal diverge do canal da sua conta.
-- ─────────────────────────────────────────────────────────────────────

-- Primeiro as cópias: pedido que já existe no canal certo, com a mesma
-- conta e o mesmo código, está duplicado e a versão velha sai.
delete from pedidos p
using contas_canal c
where p.conta_canal_id = c.id
  and p.canal_id <> c.canal_id
  and exists (
    select 1 from pedidos d
    where d.canal_id = c.canal_id
      and d.codigo_externo = p.codigo_externo
      and d.conta_canal_id = p.conta_canal_id
  );

-- Depois o resto, que é só canal defasado.
update pedidos p set canal_id = c.canal_id
from contas_canal c
where p.conta_canal_id = c.id
  and p.canal_id <> c.canal_id;

update vendas_diarias v set canal_id = c.canal_id
from contas_canal c
where v.conta_canal_id = c.id
  and v.canal_id <> c.canal_id
  and not exists (
    select 1 from vendas_diarias d
    where d.canal_id = c.canal_id and d.conta_canal_id = v.conta_canal_id and d.data = v.data
  );

update anuncios a set canal_id = c.canal_id
from contas_canal c
where a.conta_canal_id = c.id
  and a.canal_id <> c.canal_id
  and not exists (
    select 1 from anuncios d
    where d.canal_id = c.canal_id and d.codigo_externo = a.codigo_externo
  );

-- ═══════════════════════════════════════════════════════════════════════
--  CONFERIR
--
--    select ca.codigo as canal_gravado, cc.nome as conta, count(*)
--    from pedidos p
--    join contas_canal cc on cc.id = p.conta_canal_id
--    join canais ca on ca.id = p.canal_id
--    where p.canal_id <> cc.canal_id
--    group by 1, 2;
--
--  Tem de voltar vazio. Se sobrar linha, é colisão de código externo no
--  canal de destino — o comentário no alto explica.
--
--  SE ALGO QUEBRAR: O DESFAZER
--
--    drop trigger if exists conta_canal_arrasta on contas_canal;
--    drop function if exists conta_canal_arrasta_canal();
--
--  Os pedidos já corrigidos continuam corrigidos, que é o certo.
-- ═══════════════════════════════════════════════════════════════════════
