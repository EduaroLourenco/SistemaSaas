import { NextResponse } from "next/server";
import { abrirPlanilha } from "@/lib/planilhas/abrir";
import { lerPrecoMinimo, type Aba } from "@/lib/planilhas/preco-minimo";
import { gravarPrecoMinimo } from "@/lib/dados/sugestoes";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Sobe a tabela de preço mínimo (Clássico e Premium por SKU) como vigência de hoje.
 * Aceita .xlsx — o .xlsb do Excel precisa ser salvo como .xlsx antes.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return NextResponse.json({ erro: "Escolha a planilha." }, { status: 400 });
  if (/\.xlsb$/i.test(arquivo.name)) {
    return NextResponse.json({ erro: "Arquivo .xlsb: no Excel, use Salvar como › Pasta de Trabalho do Excel (.xlsx) e envie de novo." }, { status: 400 });
  }
  let lido;
  try {
    const wb = await abrirPlanilha(Buffer.from(await arquivo.arrayBuffer()));
    const abas: Aba[] = wb.worksheets.map((ws) => {
      const linhas: unknown[][] = [];
      const amarelas = new Set<string>();
      ws.eachRow({ includeEmpty: false }, (row) => {
        const r = linhas.length;
        linhas.push((row.values as unknown[]).slice(1));
        row.eachCell((cell, col) => {
          const f = cell.fill as { type?: string; fgColor?: { argb?: string } } | undefined;
          /* Amarelo puro do Excel (FFFF00), com ou sem canal alfa. */
          if (f?.type === "pattern" && /^(FF)?FFFF00$/i.test(f.fgColor?.argb ?? "")) amarelas.add(`${r}:${col - 1}`);
        });
      });
      return { nome: ws.name, linhas, amarelas };
    });
    lido = lerPrecoMinimo(abas);
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Planilha ilegível." }, { status: 400 });
  }
  if (!lido.linhas.length) return NextResponse.json({ erro: `A aba ${lido.aba} não tem nenhum preço.` }, { status: 400 });
  const r = await gravarPrecoMinimo(lido.linhas, `${arquivo.name} · ${lido.aba}${lido.destaques ? ` + amarelos de ${lido.destaques.aba}` : ""}`);
  if (r.erro) return NextResponse.json(r, { status: 400 });
  return NextResponse.json({ ...r, aba: lido.aba, skus: new Set(lido.linhas.map((l) => l.sku)).size, semPreco: lido.semPreco, destaques: lido.destaques });
}
