-- ─────────────────────────────────────────────────────────────────────
--  A família do anúncio no catálogo do canal
--
--  O Mercado Livre agrupa anúncios em três níveis, e o sistema só
--  conhecia o primeiro:
--
--    anúncio (MLB)            o que vendemos
--      └ catalog_product_id   une os anúncios do MESMO produto
--          └ parent_id        une os TAMANHOS do mesmo colchão
--
--  O parent_id é o que a tela de publicidade do canal mostra como
--  "Colchão Probel Guarda Costas Turim Springs": solteiro, viúva,
--  casal e queen na mesma página, e o cliente troca de tamanho ali
--  dentro sem sair.
--
--  Sem ele o sistema erra em três lugares:
--
--   · TRÁFEGO PAGO manda desligar o MLB que não vendeu sem ver que os
--     irmãos vendem — e no canal o patrocínio é do grupo, então
--     desligar derruba quem vende. Foi o caso do MLB5382536864.
--   · CATÁLOGO lista "disputando" o anúncio premium que perde para o
--     clássico da própria casa, e sugere baixar preço contra si mesmo.
--   · ANÁLISE DE OFERTA atribui a venda ao tamanho que o cliente
--     escolheu, não ao que estava em oferta, e a campanha parece não
--     ter funcionado.
--
--  Medido na Probel em 21/10/2026: 261 dos 1.036 anúncios ativos estão
--  em catálogo, formando 48 famílias. Os outros 775 não têm família no
--  canal — nulo aqui quer dizer isso, e não "ainda não sincronizei".
-- ─────────────────────────────────────────────────────────────────────

alter table anuncios add column if not exists catalogo_produto_id text;
alter table anuncios add column if not exists familia_id text;
alter table anuncios add column if not exists familia_nome text;

comment on column anuncios.catalogo_produto_id is
  'catalog_product_id do canal: une os anúncios do mesmo produto. Null = anúncio fora do catálogo.';
comment on column anuncios.familia_id is
  'parent_id do produto de catálogo: une os TAMANHOS do mesmo modelo. É por ele que se agrupa para decidir mídia e preço.';
comment on column anuncios.familia_nome is
  'Nome da família como o canal mostra, ex. "Colchão Probel Guarda Costas Turim Springs".';

-- Agrupar por família é a consulta mais comum destas telas.
create index if not exists anuncios_familia_idx on anuncios (operacao_id, familia_id);
