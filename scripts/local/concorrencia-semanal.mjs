/**
 * Preço da concorrência da planilha Black Friday da Probel, direto do catálogo
 * do Mercado Livre (/products/{id}/items). Só LÊ a planilha e grava o JSON;
 * quem escreve na planilha é concorrencia-semanal.ps1 (Excel COM).
 *
 * Uso: node scripts/local/concorrencia-semanal.mjs "<planilha.xlsx>" "<saida.json>" "Grupos <dd.mm da semana anterior>"
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: ints } = await sb.from("integracoes").select("credencial_ref").eq("provedor", "mercado_livre");
// Catálogo é público (qualquer token vivo serve); o preço no ar exige o token da conta dona do anúncio.
const tokens = [];
for (const it of ints) {
  const { data: b } = await sb.rpc("integracao_segredo_ler", { p_ref: it.credencial_ref });
  const t = JSON.parse(b).access_token;
  if ((await fetch("https://api.mercadolibre.com/users/me", { headers: { authorization: "Bearer " + t } })).ok) tokens.push(t);
}
if (!tokens.length) throw new Error("nenhum token do Meli vivo: renove pelo CLI (ver scripts/local/LEIA.md)");
const tk = tokens[0];

const [, , xlsx, saida, aba] = process.argv;
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(xlsx);
const ws = wb.getWorksheet(aba);
if (!ws) throw new Error(`aba "${aba}" não existe (ex.: "Grupos 06.11")`);
// Por marca: colunas preço/anúncio/link (3 em 3, a partir de AG = 33).
const marcas = ["BF Colchões", "Ortobom", "Castor", "Anjos", "Herval", "Sankonfort", "Luckspuma", "Paropas", "Outra marca"];
const cache = new Map();
const catalogo = async (id) => {
  if (cache.has(id)) return cache.get(id);
  const r = await fetch(`https://api.mercadolibre.com/products/${id}/items?limit=100`, { headers: { authorization: "Bearer " + tk } });
  const j = r.ok ? await r.json() : null;
  const precos = (j?.results ?? []).map((x) => x.price).filter((p) => p > 0);
  const v = { http: r.status, n: precos.length, min: precos.length ? Math.min(...precos) : null, primeiro: precos[0] ?? null };
  cache.set(id, v);
  return v;
};
const linhas = [];
for (let r = 7; r <= 21; r++) {
  for (let m = 0; m < marcas.length; m++) {
    const c = 33 + m * 3;
    const lk = ws.getRow(r).getCell(c + 2).value;
    const link = typeof lk === "object" ? lk?.text ?? lk?.hyperlink : lk;
    const id = String(link ?? "").match(/MLB\d+/)?.[0];
    if (!id) continue;
    const velho = ws.getRow(r).getCell(c).value;
    linhas.push({ linha: r, coluna: c, marca: marcas[m], id, velho: typeof velho === "number" ? velho : null, ...(await catalogo(id)) });
  }
}
writeFileSync(saida, JSON.stringify(linhas, null, 1));

/* Preço no ar hoje (coluna M de "Produtos"): o que o comprador paga, com campanha. */
const wp = wb.getWorksheet(aba.replace("Grupos", "Produtos"));
const precos = [];
for (let r = 4; r <= 112; r++) {
  const id = String(wp.getRow(r).getCell(3).value ?? "").match(/MLB[0-9]+/)?.[0];
  if (!id) continue;
  const v = wp.getRow(r).getCell(13).value;
  let novo = null, http = 0;
  for (const t of tokens) {
    const x = await fetch(`https://api.mercadolibre.com/items/${id}/sale_price?context=channel_marketplace`, { headers: { authorization: "Bearer " + t } });
    http = x.status;
    if (x.ok) { novo = (await x.json()).amount ?? null; break; }
  }
  precos.push({ linha: r, id, velho: typeof v === "number" ? v : null, novo, http });
}
writeFileSync(saida.slice(0, -5) + ".precos.json", JSON.stringify(precos, null, 1));
console.log("preço no ar: ok", precos.filter((x) => x.novo != null).length, "de", precos.length, "| falhas:", precos.filter((x) => x.novo == null).map((x) => x.id + "/" + x.http).join(", ") || "nenhuma");
const ok = linhas.filter((x) => x.velho != null);
console.log(`${linhas.length} concorrentes, ${cache.size} catálogos`);
console.log("velho == min:", ok.filter((x) => x.velho === x.min).length, "| velho == primeiro:", ok.filter((x) => x.velho === x.primeiro).length, "de", ok.length);
console.log("sem oferta/erro:", linhas.filter((x) => x.min == null).map((x) => `${x.linha}/${x.marca}/${x.id}/${x.http}`).join(", ") || "nenhum");
process.exit();
