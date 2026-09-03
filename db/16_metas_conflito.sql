-- ─────────────────────────────────────────────────────────────────────
--  O índice parcial não serve para ON CONFLICT
--
--  Gravar a meta falhava com:
--
--    there is no unique or exclusion constraint matching the
--    ON CONFLICT specification
--
--  A causa: `idx_metas_canal` foi criado com `where canal_id is not null`,
--  para conviver com a meta da operação inteira, que tem canal nulo. O
--  Postgres só usa um índice parcial num ON CONFLICT se a cláusula
--  repetir o mesmo predicado — e o PostgREST, que é quem monta o upsert,
--  não tem como mandar predicado nenhum.
--
--  Índice parcial é ótimo para consultar e inútil para conciliar. Como o
--  upsert é o único caminho de escrita desta tabela, o índice tem que ser
--  inteiro.
--
--  ── E a meta da operação sem canal? ──
--
--  Num índice completo, linhas com `canal_id` nulo não colidem entre si —
--  é assim que o Postgres trata nulo. O índice parcial que cobre esse
--  caso continua existindo, e nada no sistema grava meta sem canal: a
--  distribuição sempre resolve por canal antes de escrever.
-- ─────────────────────────────────────────────────────────────────────

begin;

drop index if exists idx_metas_canal;

create unique index if not exists idx_metas_canal
  on metas (operacao_id, canal_id, ano, mes);

commit;

/*
 * `metas_por_canal_unica` vinha do schema original com o mesmo predicado
 * parcial. O índice completo acima é estritamente mais forte para as
 * linhas com canal — tudo que o parcial recusava, o completo recusa
 * também. Manter os dois só cobra escrita duas vezes.
 */
drop index if exists metas_por_canal_unica;
