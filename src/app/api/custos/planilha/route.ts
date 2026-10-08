import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { paginar } from "@/lib/dados/paginar";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Planilha de custos: baixar preenchida com os produtos, preencher, subir.
 *
 * É o primeiro abastecimento de uma empresa nova — digitar 145 custos um a
 * um na tela não acontece; numa planilha, o comprador faz numa tarde.
 *
 * Célula VAZIA não mexe no que está gravado (subir a planilha só com a
 * coluna de custo não apaga a embalagem). Para apagar, use a tela.
 */

const COLUNAS = [
  { chave: "sku", titulo: "SKU", largura: 18 },
  { chave: "titulo", titulo: "Produto", largura: 50 },
  { chave: "custo_unitario", titulo: "Custo da mercadoria (R$)", largura: 24 },
  { chave: "embalagem", titulo: "Embalagem (R$)", largura: 16 },
  { chave: "aliquota_impostos", titulo: "Imposto (%)", largura: 13 },
  { chave: "peso_kg", titulo: "Peso (kg)", largura: 11 },
] as const;

const CAMPOS = ["custo_unitario", "embalagem", "aliquota_impostos", "peso_kg"] as const;
const TETO: Record<(typeof CAMPOS)[number], number> = {
  custo_unitario: 1_000_000,
  embalagem: 100_000,
  aliquota_impostos: 100,
  peso_kg: 10_000,
};
const NOME: Record<(typeof CAMPOS)[number], string> = {
  custo_unitario: "custo",
  embalagem: "embalagem",
  aliquota_impostos: "imposto",
  peso_kg: "peso",
};

type Prod = {
  id: string;
  sku: string;
  titulo: string;
  custo_unitario: number | null;
  embalagem: number | null;
  aliquota_impostos: number | null;
  peso_kg: number | null;
};

async function contexto() {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) return { erro: NextResponse.json({ erro: "Entre no sistema primeiro." }, { status: 401 }) };
  const op = await operacaoPadrao();
  if (!op) return { erro: NextResponse.json({ erro: "Nenhuma operação." }, { status: 404 }) };
  return { sb, op };
}

export async function GET() {
  const c = await contexto();
  if ("erro" in c) return c.erro;
  const produtos = (await paginar(() =>
    c.sb
      .from("produtos")
      .select("id,sku,titulo,custo_unitario,embalagem,aliquota_impostos,peso_kg")
      .eq("operacao_id", c.op.id)
      .order("sku")
  )) as unknown as Prod[];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Custos");
  ws.columns = COLUNAS.map((col) => ({ header: col.titulo, key: col.chave, width: col.largura }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const num = (v: unknown) => (v == null ? null : Number(v));
  for (const p of produtos) {
    ws.addRow({
      sku: p.sku,
      titulo: p.titulo,
      custo_unitario: num(p.custo_unitario),
      embalagem: num(p.embalagem),
      aliquota_impostos: num(p.aliquota_impostos),
      peso_kg: num(p.peso_kg),
    });
  }
  ws.getColumn(3).numFmt = "#,##0.00";
  ws.getColumn(4).numFmt = "#,##0.00";

  const ajuda = wb.addWorksheet("Como preencher");
  [
    "Preencha os custos na aba Custos e suba o arquivo em Financeiro › Custos › Subir planilha.",
    "Custo da mercadoria: quanto você paga por UMA unidade, sem o frete da venda.",
    "Embalagem: custo de embalar uma unidade.",
    "Imposto: a alíquota sobre a venda, em %. Ex.: 12 para 12%.",
    "Peso: do pacote, em kg. Serve para a faixa de frete.",
    "Célula vazia não altera o que já está gravado.",
    "SKU que ainda não existe é criado como produto novo.",
  ].forEach((t) => ajuda.addRow([t]));
  ajuda.getColumn(1).width = 95;

  const buffer = await wb.xlsx.writeBuffer();
  const nome = (c.op.empresa || "empresa").normalize("NFD").replace(/[^\w-]+/g, "-").toLowerCase();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="custos-${nome}.xlsx"`,
    },
  });
}

/** "1.234,56" → 1234.56; número do Excel passa direto. undefined = célula vazia. */
function numero(v: ExcelJS.CellValue): number | null | undefined {
  if (v && typeof v === "object" && "result" in v) v = (v as { result: ExcelJS.CellValue }).result;
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return v;
  const t = String(v).trim().replace(/[R$\s%]/g, "");
  if (!t) return undefined;
  const x = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(x) ? x : null;
}

export async function POST(req: Request) {
  const c = await contexto();
  if ("erro" in c) return c.erro;
  const { data: pode } = await c.sb.rpc("pode_editar_operacao", { op: c.op.id });
  if (!pode) return NextResponse.json({ erro: "Seu acesso é de leitura." }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof File)) return NextResponse.json({ erro: "Envie o arquivo." }, { status: 400 });
  if (arquivo.size > 5_000_000) return NextResponse.json({ erro: "Arquivo grande demais (máx. 5 MB)." }, { status: 400 });

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await arquivo.arrayBuffer());
  } catch {
    return NextResponse.json({ erro: "Não consegui ler o arquivo. Use a planilha baixada aqui (.xlsx)." }, { status: 400 });
  }
  const ws = wb.getWorksheet("Custos") ?? wb.worksheets[0];
  if (!ws) return NextResponse.json({ erro: "Planilha vazia." }, { status: 400 });

  // Acha as colunas pelo cabeçalho, para aceitar colunas reordenadas.
  const indice: Partial<Record<string, number>> = {};
  ws.getRow(1).eachCell((cel, col) => {
    const t = String(cel.value ?? "").trim().toLowerCase();
    const achada = COLUNAS.find((k) => t.startsWith(k.titulo.toLowerCase().slice(0, 5)));
    if (achada && !(achada.chave in indice)) indice[achada.chave] = col;
  });
  if (!indice.sku) return NextResponse.json({ erro: "Não achei a coluna SKU na primeira linha." }, { status: 400 });

  const existentes = (await paginar(() =>
    c.sb.from("produtos").select("id,sku,titulo").eq("operacao_id", c.op.id).order("id")
  )) as unknown as Pick<Prod, "id" | "sku" | "titulo">[];
  const porSku = new Map(existentes.map((p) => [p.sku.trim().toUpperCase(), p]));

  const recusadas: string[] = [];
  const atualizar: Record<string, unknown>[] = [];
  const criar: Record<string, unknown>[] = [];
  const agora = new Date().toISOString();
  const vistos = new Set<string>();

  ws.eachRow((row, r) => {
    if (r === 1) return;
    const sku = String(row.getCell(indice.sku!).value ?? "").trim();
    if (!sku) return;
    const k = sku.toUpperCase();
    if (vistos.has(k)) {
      recusadas.push(`linha ${r}: SKU ${sku} repetido`);
      return;
    }
    vistos.add(k);
    const titulo = indice.titulo ? String(row.getCell(indice.titulo).value ?? "").trim() : "";
    const atual = porSku.get(k);
    const linha: Record<string, unknown> = {
      ...(atual ? { id: atual.id } : {}),
      operacao_id: c.op.id,
      sku: atual?.sku ?? sku,
      titulo: atual?.titulo || titulo || sku,
    };
    let mexeu = false;
    for (const campo of CAMPOS) {
      const col = indice[campo];
      if (!col) continue;
      let v = numero(row.getCell(col).value);
      if (v === undefined) continue;
      // Imposto formatado como % no Excel chega como fração (0,12).
      if (campo === "aliquota_impostos" && v != null && v > 0 && v < 1) v = v * 100;
      if (v == null || v < 0 || v > TETO[campo]) {
        recusadas.push(`linha ${r} (${sku}): ${NOME[campo]} inválido`);
        return;
      }
      linha[campo] = v;
      if (campo === "custo_unitario") linha.custo_atualizado_em = agora;
      mexeu = true;
    }
    if (atual && mexeu) atualizar.push(linha);
    else if (!atual) criar.push(linha);
  });

  for (let i = 0; i < atualizar.length; i += 500) {
    const { error } = await c.sb.from("produtos").upsert(atualizar.slice(i, i + 500), { onConflict: "id" });
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  }
  for (let i = 0; i < criar.length; i += 500) {
    const { error } = await c.sb.from("produtos").insert(criar.slice(i, i + 500));
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  }
  return NextResponse.json({ atualizados: atualizar.length, criados: criar.length, recusadas });
}
