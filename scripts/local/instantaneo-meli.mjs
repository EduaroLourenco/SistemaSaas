/**
 * Instantâneo de estoque, preço visível e catálogo, das duas contas do
 * Mercado Livre.
 *
 * Existe porque o banco não guarda estoque nem posição de catálogo — é a
 * migração 21 que cria as colunas, e ela ainda não rodou. Até lá, o
 * relatório lê deste arquivo, que vai commitado com data e hora na cara.
 * Quando a coluna existir, o carregador prefere o banco e este arquivo
 * morre.
 */
import fs from "node:fs";

const SAIDA = new URL("../../src/lib/dados/instantaneo-meli.json", import.meta.url).pathname.replace(/^//, "");
const CONTAS = [
  { conta: "principal", nome: "São Paulo — pronta entrega", seller: 1561372958, token: "C:/Users/dudu4/OneDrive/Desktop/Meli+/.meli/token.json" },
  { conta: "segunda", nome: "2ª conta — venda a prazo", seller: 566214003, token: "C:/Users/dudu4/OneDrive/Desktop/apis/Mercado Livre Principal/.meli/token.json" },
];

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function comLimite(itens, n, fn) {
  const saida = new Array(itens.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) {
      const k = i++;
      saida[k] = await fn(itens[k]);
    }
  }));
  return saida;
}

const instantaneo = { geradoEm: new Date().toISOString(), contas: {} };

for (const c of CONTAS) {
  const T = JSON.parse(fs.readFileSync(c.token, "utf8").replace(/^\uFEFF/, "")).access_token;
  const H = { headers: { Authorization: "Bearer " + T, Accept: "application/json" } };
  const get = async (p, tent = 0) => {
    const r = await fetch("https://api.mercadolibre.com" + p, H);
    if ((r.status === 429 || r.status >= 500) && tent < 3) { await espera(900 * (tent + 1)); return get(p, tent + 1); }
    if (!r.ok) return null;
    return r.json();
  };

  /* Todos os anúncios, ativos e pausados: pausa é informação. */
  const ids = [];
  for (const status of ["active", "paused"]) {
    for (let off = 0; off < 3000; off += 100) {
      const j = await get(`/users/${c.seller}/items/search?status=${status}&limit=100&offset=${off}`);
      const r = j?.results ?? [];
      ids.push(...r.map((id) => ({ id, status })));
      if (r.length < 100) break;
    }
  }
  console.log(c.nome, "| anúncios:", ids.length);

  const porId = new Map();
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20);
    const j = await get(`/items?ids=${lote.map((x) => x.id).join(",")}&attributes=id,title,price,available_quantity,sold_quantity,listing_type_id,status,catalog_listing,catalog_product_id,seller_custom_field,shipping,tags,health`);
    for (const x of j ?? []) {
      const b = x.body;
      if (!b) continue;
      porId.set(b.id, {
        mlb: b.id,
        sku: b.seller_custom_field ?? null,
        titulo: b.title,
        tipo: b.listing_type_id === "gold_pro" ? "Premium" : b.listing_type_id === "gold_special" ? "Clássico" : "—",
        situacao: b.status,
        estoque: b.available_quantity ?? 0,
        vendidos: b.sold_quantity ?? 0,
        emCatalogo: Boolean(b.catalog_listing),
        catalogoProdutoId: b.catalog_product_id ?? null,
        freteGratis: Boolean(b.shipping?.free_shipping),
        logistica: b.shipping?.logistic_type ?? null,
        elegivelCatalogo: (b.tags ?? []).includes("catalog_listing_eligible"),
      });
    }
    await espera(120);
  }
  console.log("  detalhes lidos:", porId.size);

  /* Preço visível: só faz sentido em anúncio ativo. */
  const ativos = [...porId.values()].filter((x) => x.situacao === "active");
  await comLimite(ativos, 6, async (x) => {
    const sp = await get(`/items/${x.mlb}/sale_price?context=channel_marketplace`);
    x.precoVitrine = null;
    x.precoVisivel = sp?.amount ?? null;
    x.precoCheio = sp?.regular_amount ?? null;
    x.campanha = sp?.metadata?.campaign_id ?? null;
  });
  /* O preço de vitrine vem do multiget, que já rodou: recupera do detalhe. */
  for (let i = 0; i < ativos.length; i += 20) {
    const j = await get(`/items?ids=${ativos.slice(i, i + 20).map((x) => x.mlb).join(",")}&attributes=id,price`);
    for (const x of j ?? []) if (x.body) porId.get(x.body.id).precoVitrine = x.body.price;
    await espera(100);
  }
  console.log("  preços lidos:", ativos.length);

  /* Catálogo: ganhando, perdendo, dividindo, e o preço para ganhar. */
  const emCatalogo = ativos.filter((x) => x.emCatalogo || x.elegivelCatalogo);
  await comLimite(emCatalogo, 5, async (x) => {
    const p = await get(`/items/${x.mlb}/price_to_win?version=v2`);
    if (!p) return;
    x.catalogo = {
      status: p.status ?? null,
      precoParaGanhar: p.price_to_win ?? null,
      precoAtual: p.current_price ?? null,
      fatiaVisita: p.visit_share ?? null,
      dividindoPrimeiro: p.competitors_sharing_first_place ?? null,
      motivo: p.reason ?? [],
      vencedorPreco: p.winner?.price ?? null,
      alavancas: (p.boosts ?? []).map((b) => ({ id: b.id, situacao: b.status })),
    };
  });
  console.log("  catálogo consultado:", emCatalogo.length);

  /* Reputação da conta. */
  const u = await get(`/users/${c.seller}`);
  const rep = u?.seller_reputation ?? {};

  /* Visitas da conta inteira, últimos 60 dias. */
  const vis = await get(`/users/${c.seller}/items_visits/time_window?last=60&unit=day`);

  /* Perguntas sem resposta. */
  const perg = await get(`/questions/search?seller_id=${c.seller}&status=UNANSWERED&limit=1`);

  instantaneo.contas[c.conta] = {
    nome: c.nome,
    seller: c.seller,
    anuncios: [...porId.values()],
    reputacao: {
      nivel: rep.level_id ?? null,
      categoria: rep.power_seller_status ?? null,
      reclamacoes: rep.metrics?.claims?.rate ?? null,
      cancelamentos: rep.metrics?.cancellations?.rate ?? null,
      atrasos: rep.metrics?.delayed_handling_time?.rate ?? null,
      vendas60d: rep.metrics?.sales?.completed ?? null,
    },
    visitasConta: (vis?.results ?? []).map((r) => ({ dia: String(r.date).slice(0, 10), total: r.total })),
    perguntasSemResposta: perg?.total ?? null,
  };
}

fs.writeFileSync(SAIDA, JSON.stringify(instantaneo));
const kb = (fs.statSync(SAIDA).size / 1024).toFixed(0);
console.log("\nsalvo:", SAIDA, `(${kb} KB)`);
for (const [k, v] of Object.entries(instantaneo.contas)) {
  const a = v.anuncios;
  const cat = a.filter((x) => x.catalogo);
  const g = cat.filter((x) => x.catalogo.status === "winning").length;
  const p = cat.filter((x) => x.catalogo.status === "losing").length;
  const d = cat.filter((x) => x.catalogo.status === "sharing_first_place").length;
  console.log(`${k}: ${a.length} anúncios | ativos ${a.filter((x) => x.situacao === "active").length} | pausados ${a.filter((x) => x.situacao === "paused").length} | estoque zero ${a.filter((x) => x.situacao === "active" && !x.estoque).length}`);
  console.log(`   catálogo: ganhando ${g}, perdendo ${p}, dividindo ${d}, consultados ${cat.length} | elegíveis fora ${a.filter((x) => x.elegivelCatalogo && !x.emCatalogo).length}`);
}
