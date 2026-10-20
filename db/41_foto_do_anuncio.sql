-- ─────────────────────────────────────────────────────────────────────
--  A foto de capa do anúncio
--
--  Toda tela que lista anúncio mostra MLB, SKU e título — três textos
--  parecidos, um embaixo do outro. Na Probel são 256 SKUs de colchão com
--  nome quase igual ("Colchão Casal Mola Ensacada Probel Bari",
--  "Colchão Casal Mola Ensacada Probel Excede Premium"), e achar a linha
--  certa vira leitura de caractere. A capa resolve antes do texto: é como
--  o próprio Mercado Livre lista, e é como o dono reconhece o produto.
--
--  A URL vem do /items do canal (`secure_thumbnail`), que já é devolvido
--  em toda sincronização de catálogo — não é chamada a mais. Guardamos a
--  URL, não a imagem: ela é servida pelo CDN do canal, muda quando o
--  anúncio troca de foto, e baixar 1.400 miniaturas para um bucket seria
--  pagar armazenamento para ter cópia velha.
-- ─────────────────────────────────────────────────────────────────────

alter table anuncios add column if not exists foto text;

comment on column anuncios.foto is
  'URL https da miniatura de capa no CDN do canal. Null = nunca sincronizado ou canal sem foto.';
