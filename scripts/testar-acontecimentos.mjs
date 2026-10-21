/**
 * Os acontecimentos da semana: o que vira linha e o que não vira.
 *
 * Esta tela só serve se a lista couber na tela. Medido no histórico
 * real da Probel, na semana de 13 a 20/10:
 *
 *   variação de preço >= 1%   →  562 acontecimentos   (ruído)
 *   variação de preço >= 10%  →   18 acontecimentos   (cabe)
 *
 * Os cortes aqui são o que separa uma coisa da outra, e é por isso que
 * eles têm teste: afrouxar qualquer um deles enche a tela de nada.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const vazio = path.join(mkdtempSync(path.join(tmpdir(), "gerizo-")), "vazio.cjs");
writeFileSync(vazio, "module.exports={}");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(raiz, "src"), "server-only": vazio },
  interopDefault: true,
});
const { carregarAcontecimentos } = await jiti.import(
  path.join(raiz, "src/lib/dados/acontecimentos-semana.ts"),
);

/** Um Supabase de mentira que devolve o que o teste mandar. */
function fingirBanco({ diarias = [], plano = [] }) {
  const montar = (linhas) => {
    const q = {
      select: () => q,
      gte: () => q,
      lte: () => q,
      or: () => q,
      order: () => q,
      range: async () => ({ data: linhas, error: null }),
    };
    return q;
  };
  return {
    from: (t) => montar(t === "anuncio_estoque_diario" ? diarias : plano),
  };
}

const anuncio = (sku, status = "ativo") => ({
  codigo_externo: "MLB" + sku,
  sku_canal: sku,
  titulo: "Produto " + sku,
  status,
});

/* ══ 1. Preço: o corte de 10% ══ */
{
  const sb = fingirBanco({
    diarias: [
      /* −9,1%: fica de fora. 1% dava 562 numa semana. */
      { data: "2026-10-14", estoque: 5, preco: 1100, anuncios: anuncio("PEQUENO") },
      { data: "2026-10-15", estoque: 5, preco: 1000, anuncios: anuncio("PEQUENO") },
      /* −40%: entra. */
      { data: "2026-10-14", estoque: 5, preco: 1000, anuncios: anuncio("GRANDE") },
      { data: "2026-10-15", estoque: 5, preco: 600, anuncios: anuncio("GRANDE") },
    ],
  });
  const r = await carregarAcontecimentos(sb, "2026-10-13", "2026-10-20");
  const precos = r.filter((a) => a.tipo === "preco");
  assert.equal(precos.length, 1, "só a variação relevante vira acontecimento");
  assert.match(precos[0].texto, /GRANDE baixou/);
  assert.match(precos[0].texto, /-40%/);
  assert.equal(precos[0].tom, "up", "preço menor costuma puxar a venda para cima");
}

/* ══ 2. O mesmo SKU em dois anúncios é UMA linha ══
   Todo colchão vive em clássico e premium, nas duas contas. Sem
   agrupar, a mesma decisão de preço aparece quatro vezes no mesmo dia. */
{
  const sb = fingirBanco({
    diarias: [
      { data: "2026-10-14", estoque: 5, preco: 1000, anuncios: { ...anuncio("PA1"), codigo_externo: "MLB_CLASSICO" } },
      { data: "2026-10-15", estoque: 5, preco: 700, anuncios: { ...anuncio("PA1"), codigo_externo: "MLB_CLASSICO" } },
      { data: "2026-10-14", estoque: 5, preco: 1100, anuncios: { ...anuncio("PA1"), codigo_externo: "MLB_PREMIUM" } },
      { data: "2026-10-15", estoque: 5, preco: 660, anuncios: { ...anuncio("PA1"), codigo_externo: "MLB_PREMIUM" } },
    ],
  });
  const r = await carregarAcontecimentos(sb, "2026-10-13", "2026-10-20");
  const precos = r.filter((a) => a.tipo === "preco");
  assert.equal(precos.length, 1, "dois anúncios do mesmo SKU dão uma linha só");
  assert.match(precos[0].texto, /-40%/, "vale a maior variação do dia, que é a que se lembra");
}

/* ══ 3. Anúncio pausado não conta ══
   Preço de anúncio fora do ar mudou no cadastro, não na vitrine. */
{
  const sb = fingirBanco({
    diarias: [
      { data: "2026-10-14", estoque: 5, preco: 1000, anuncios: anuncio("PARADO", "pausado") },
      { data: "2026-10-15", estoque: 5, preco: 500, anuncios: anuncio("PARADO", "pausado") },
    ],
  });
  const r = await carregarAcontecimentos(sb, "2026-10-13", "2026-10-20");
  assert.equal(r.length, 0, "ninguém viu esse preço mudar");
}

/* ══ 4. Estoque: "sob encomenda" não é ruptura ══
   Acima de 40 mil o canal declara que não controla estoque. Tratar
   como quantidade inventa ruptura onde não houve. */
{
  const sb = fingirBanco({
    diarias: [
      { data: "2026-10-14", estoque: 99999, preco: null, anuncios: anuncio("ENCOMENDA") },
      { data: "2026-10-15", estoque: 0, preco: null, anuncios: anuncio("ENCOMENDA") },
      /* Esta é ruptura de verdade. */
      { data: "2026-10-14", estoque: 3, preco: null, anuncios: anuncio("REAL") },
      { data: "2026-10-15", estoque: 0, preco: null, anuncios: anuncio("REAL") },
    ],
  });
  const r = await carregarAcontecimentos(sb, "2026-10-13", "2026-10-20");
  const est = r.filter((a) => a.tipo === "estoque");
  assert.equal(est.length, 1, "só o estoque que o canal controla vira ruptura");
  assert.match(est[0].texto, /REAL acabou o estoque/);
  assert.equal(est[0].tom, "down");
}

/* ══ 5. Dia sem leitura não inventa mudança ══
   A coleta falha de vez em quando. Comparar leituras CONSECUTIVAS
   MEDIDAS, e não dias de calendário, evita acusar queda quando o que
   houve foi um buraco na coleta. */
{
  const sb = fingirBanco({
    diarias: [
      { data: "2026-10-14", estoque: 5, preco: 1000, anuncios: anuncio("BURACO") },
      /* 15 e 16 sem leitura */
      { data: "2026-10-17", estoque: 5, preco: 1000, anuncios: anuncio("BURACO") },
    ],
  });
  const r = await carregarAcontecimentos(sb, "2026-10-13", "2026-10-20");
  assert.equal(r.length, 0, "mesmo preço em leituras separadas não é mudança");
}

/* ══ 6. Campanha que começou e que terminou ══ */
{
  const sb = fingirBanco({
    plano: [
      { titulo: "Oferta Relâmpago", inicio: "2026-10-19", fim: "2026-10-31", natureza: "campanha", status: "Em andamento" },
      { titulo: "10 10", inicio: "2026-09-28", fim: "2026-10-13", natureza: "acao", status: "Concluída" },
      /* Fora da janela dos dois lados: não aparece. */
      { titulo: "Black Friday", inicio: "2026-11-01", fim: "2026-11-30", natureza: "campanha", status: "Planejada" },
      /* Cancelada não é acontecimento. */
      { titulo: "Desistida", inicio: "2026-10-15", fim: "2026-10-16", natureza: "acao", status: "Cancelada" },
    ],
  });
  const r = await carregarAcontecimentos(sb, "2026-10-13", "2026-10-20");
  const c = r.filter((a) => a.tipo === "campanha");
  assert.equal(c.length, 2, "uma que começou e uma que terminou na janela");
  assert.ok(c.some((x) => x.data === "2026-10-19" && /começou/.test(x.texto)));
  assert.ok(c.some((x) => x.data === "2026-10-13" && /terminou/.test(x.texto)));
  assert.ok(!c.some((x) => /Desistida|Black Friday/.test(x.texto)));
}

/* ══ 7. A ordem: mais recente primeiro, campanha antes de preço ══
   Campanha costuma ser a CAUSA da mudança de preço daquele dia. */
{
  const sb = fingirBanco({
    diarias: [
      { data: "2026-10-18", estoque: 5, preco: 1000, anuncios: anuncio("X") },
      { data: "2026-10-19", estoque: 5, preco: 600, anuncios: anuncio("X") },
    ],
    plano: [
      { titulo: "Relâmpago", inicio: "2026-10-19", fim: "2026-10-31", natureza: "campanha", status: "Em andamento" },
    ],
  });
  const r = await carregarAcontecimentos(sb, "2026-10-13", "2026-10-20");
  assert.equal(r.length, 2);
  assert.equal(r[0].tipo, "campanha", "no mesmo dia, a campanha explica o preço");
  assert.equal(r[1].tipo, "preco");
}

console.log(
  "OK: corte de 10%, um por SKU, anúncio no ar, sob encomenda fora, buraco de coleta não inventa, e a campanha vem antes do preço.",
);
