/**
 * Os blocos da atualização, na ordem em que rodam e aparecem na tela.
 *
 * `tempo` é o da Probel (469 + 800 anúncios), medido em 10/11/2026 onde
 * diz "medido": vendas 17s, envios 28s, anúncios 5 min (a disputa do
 * catálogo pesa), estoque ~28s por lote de 40 anúncios. Preço e visitas
 * são estimativa: uma chamada por anúncio no freio de 4 por segundo.
 */
export const TEMPO_TUDO = "~35 min";
export const BLOCOS = [
  { id: "vendas", nome: "Vendas", tempo: "~20 s" },
  { id: "envios", nome: "Envios", tempo: "~30 s" },
  { id: "anuncios", nome: "Anúncios", tempo: "~5 min" },
  { id: "precos", nome: "Preços", tempo: "~5 min" },
  { id: "estoque", nome: "Estoque", tempo: "~15 min" },
  { id: "visitas", nome: "Visitas", tempo: "~5 min" },
  { id: "publicidade", nome: "Publicidade", tempo: "~1 min" },
  { id: "financeiro", nome: "Financeiro", tempo: "~30 s" },
] as const;

export type Bloco = (typeof BLOCOS)[number]["id"];

export const ehBloco = (v: unknown): v is Bloco => BLOCOS.some((b) => b.id === v);
