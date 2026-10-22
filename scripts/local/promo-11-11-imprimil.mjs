/**
 * A planilha da 11.11 da Imprimil, com duas réguas.
 *
 * O canal propõe coisas muito diferentes conforme o anúncio é velho ou
 * novo: nos 15 que já rodavam ele oferece de 27% a 52% de desconto; nos 20
 * que entraram em 22/10/2026 oferece 3% ou 4%, porque não tem histórico
 * para apostar neles.
 *
 * Então as duas regras do Eduardo:
 *
 *   ANTIGOS  aceita a proposta do canal até 5% abaixo do piso. Não
 *            reescreve preço — a oferta dele já é boa.
 *
 *   NOVOS    reescreve com o piso MAIS uma folga, sem usar os 5%:
 *            +15% no clássico, +10% no premium. É desconto agressivo para
 *            o anúncio pegar tração, mas acima do mínimo — e sobra espaço
 *            para descer mais ao longo do mês.
 *
 * Só o par ACTION + FINAL_PRICE é escrito. A coluna de porcentagem fica
 * como está de propósito: ela é arredondada e não descreve o preço nem na
 * proposta do próprio canal — 25,90 com 40% daria 15,54 e ele propõe
 * 15,58. Quem manda é o preço final.
 *
 * E nunca se escreve preço ACIMA do que o canal propôs: subir é
 * contrapropor um desconto menor, e ele devolve a linha recusada.
 *
 * Uso: node scripts/local/promo-11-11-imprimil.mjs <planilha.xlsx>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ExcelJS from "exceljs";
import { surgicallyEditExcel } from "../lib/editor-xlsx.mjs";

const OPERACAO = "123c2f3c-c4ed-48ba-b4c4-753d78265946";
const FOLGA = { classico: 1.15, premium: 1.10 };
const TOLERANCIA_ANTIGOS = 0.05;

/**
 * Anúncios que fogem da régua da idade, com a folga que o Eduardo deu.
 *
 * MLB7762590790 é antigo, mas o canal ofereceu 3% nele — igual aos novos,
 * e não os 26% a 52% que deu aos outros antigos. Pela idade ele aceitaria
 * 59,95 e entraria praticamente sem desconto. Vai no mínimo cravado, sem
 * folga nenhuma: 31,84 sobre um preço cheio de 61,80, 48% de desconto.
 *
 * A chave é "quanto multiplicar o piso", então 1 é o piso exato.
 */
const EXCECOES = new Map([["MLB7762590790", 1]]);
const ENTRADA = process.argv.slice(2).find((a) => a.endsWith(".xlsx"));
if (!ENTRADA) throw new Error("Passe o caminho da planilha da Central de Promoções.");

const raiz = fileURLToPath(new URL("../../", import.meta.url));
for (const l of readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: K, authorization: `Bearer ${K}` };
const get = async (p) => (await fetch(`${U}/rest/v1/${p}&limit=1000`, { headers: h })).json();
const r2 = (v) => Math.round(v * 100) / 100;
const reais = (v) => (v == null ? "—" : "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 }));

/* ── Quem é novo ──
   Pela data de criação do anúncio no sistema, não por uma lista colada
   aqui: a lista envelhece no dia seguinte e ninguém lembra de mexer. */
const anuncios = await get(`anuncios?operacao_id=eq.${OPERACAO}&select=codigo_externo,criado_em`);
const porDia = new Map();
for (const a of anuncios) {
  const d = String(a.criado_em).slice(0, 10);
  porDia.set(d, (porDia.get(d) ?? 0) + 1);
}
const diaDaLeva = [...porDia].sort((a, b) => b[0].localeCompare(a[0]))[0][0];
const novos = new Set(anuncios.filter((a) => String(a.criado_em).slice(0, 10) === diaDaLeva).map((a) => a.codigo_externo));
console.log(`última leva de anúncios: ${diaDaLeva} · ${novos.size} anúncios\n`);

/* ── O piso vigente ── */
const itens = await get(`formula_base_itens?operacao_id=eq.${OPERACAO}&select=mlb,tipo_anuncio,vigente_de`);
const precos = await get(`formula_base_precos?operacao_id=eq.${OPERACAO}&select=chave_tipo,chave,comissao,preco,vigente_de`);
const vigente = [...new Set(itens.map((i) => i.vigente_de))].sort().pop();
const tipoDe = new Map(itens.filter((i) => i.vigente_de === vigente).map((i) => [i.mlb, i.tipo_anuncio]));
const pSku = new Map(), pMlb = new Map();
for (const p of precos) {
  if (p.vigente_de !== vigente) continue;
  const alvo = p.chave_tipo === "mlb" ? pMlb : pSku;
  const k = String(p.chave), r = alvo.get(k) ?? {};
  r[Math.round(Number(p.comissao) * 1000) / 1000] = Number(p.preco);
  alvo.set(k, r);
}
/* O piso por MLB tem precedência: é o caso do moleskine, em que o mesmo
   SKU cobre a unidade e o kit de dez. */
const pisoDe = (mlb, sku, tipo) => {
  const c = tipo === "premium" ? 0.165 : 0.115;
  return pMlb.get(mlb)?.[c] ?? pSku.get(sku)?.[c] ?? null;
};

/* ── A planilha do canal ── */
const buffer = readFileSync(ENTRADA);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buffer);
const ws = wb.getWorksheet("Promoções");
const cab = ws.getRow(1).values;
const col = {};
for (let c = 1; c < cab.length; c++) if (cab[c]) col[String(cab[c]).trim().toUpperCase()] = c;
for (const obrigatoria of ["ITEM_ID", "SKU", "FINAL_PRICE", "ACTION", "ORIGINAL_PRICE"]) {
  if (!col[obrigatoria]) throw new Error(`A planilha não tem a coluna ${obrigatoria}.`);
}
const letra = (n) => { let s = ""; for (let t = n; t > 0; ) { const r = (t - 1) % 26; s = String.fromCharCode(65 + r) + s; t = Math.floor((t - r) / 26); } return s; };
const bruto = (i, k) => { const v = col[k] ? ws.getRow(i).getCell(col[k]).value : null; return v && typeof v === "object" ? (v.result ?? v.text ?? "") : v; };

const edicoes = [];
const linhas = [];
for (let i = 2; i <= ws.rowCount; i++) {
  const mlb = String(bruto(i, "ITEM_ID") ?? "");
  if (!/^MLB\d+$/i.test(mlb)) continue;
  const sku = String(bruto(i, "SKU") ?? "");
  const tipo = tipoDe.get(mlb) ?? "classico";
  const ehNovo = novos.has(mlb);
  const cheio = Number(bruto(i, "ORIGINAL_PRICE")) || null;
  const canal = Number(bruto(i, "FINAL_PRICE")) || null;
  const piso = pisoDe(mlb, sku, tipo);

  /* Os rótulos vêm da validação da própria célula: umas campanhas dizem
     "Participar", outras "Aplicar proposta". */
  const dv = ws.getRow(i).getCell(col.ACTION).dataValidation;
  const opcoes = dv?.formulae?.[0] ? String(dv.formulae[0]).replace(/['"]/g, "").split(",").map((o) => o.trim()) : [];
  const sim = opcoes[0] || "Participar";
  const nao = opcoes[1] || "Não participar";

  let acao = nao, escreve = null, motivo = "";
  const excecao = EXCECOES.get(mlb);
  if (piso == null) motivo = "sem piso cadastrado";
  else if (ehNovo || excecao != null) {
    const alvo = r2(piso * (excecao ?? FOLGA[tipo === "premium" ? "premium" : "classico"]));
    if (canal != null && alvo > canal + 0.01) motivo = `alvo ${reais(alvo)} acima da proposta ${reais(canal)} — o canal não aceita subir`;
    else { acao = sim; escreve = alvo; }
  } else {
    const minimo = r2(piso * (1 - TOLERANCIA_ANTIGOS));
    if (canal != null && canal >= minimo - 0.01) acao = sim;
    else motivo = `proposta ${reais(canal)} abaixo do piso com 5% ${reais(minimo)}`;
  }

  edicoes.push({ rowIndex: i, colLetter: letra(col.ACTION), value: acao });
  if (escreve != null) edicoes.push({ rowIndex: i, colLetter: letra(col.FINAL_PRICE), value: escreve });
  linhas.push({ mlb, sku, tipo, ehNovo, cheio, canal, piso, escreve, acao, sim, motivo });
}

console.log("MLB              SKU              tipo  idade  cheio    canal    piso    vai     desconto");
for (const l of linhas) {
  const final = l.escreve ?? l.canal;
  const desc = l.cheio && final ? `${(((l.cheio - final) / l.cheio) * 100).toFixed(0)}%` : "—";
  console.log(
    `${l.mlb} ${l.sku.padEnd(16)} ${l.tipo.slice(0, 4).padEnd(5)} ${(l.ehNovo ? "NOVO" : EXCECOES.has(l.mlb) ? "exc." : "velho").padEnd(6)} ` +
    `${String(l.cheio ?? "—").padStart(6)} ${String(l.canal ?? "—").padStart(8)} ${String(l.piso ?? "—").padStart(7)} ` +
    `${String(l.escreve ?? "—").padStart(7)} ${desc.padStart(8)}  ${l.acao === l.sim ? "" : "FORA · " + l.motivo}`
  );
}

const dentro = linhas.filter((l) => l.acao === l.sim);
const escritos = linhas.filter((l) => l.escreve != null);
console.log(`\n${linhas.length} linhas · ${dentro.length} entram · ${linhas.length - dentro.length} ficam de fora`);
console.log(`  preço reescrito em ${escritos.length} (os novos)`);
console.log(`  aceito no preço do canal em ${dentro.length - escritos.length} (os antigos)`);

const saida = path.join(raiz, "output", "11-11-Imprimil-preenchida.xlsx");
writeFileSync(saida, await surgicallyEditExcel(buffer, "Promoções", edicoes));
console.log(`\nescrito: ${saida}`);
