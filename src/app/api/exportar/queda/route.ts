import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { clienteServidor } from "@/lib/supabase/servidor";
import type { LinhaQueda } from "@/lib/dados/queda";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Exporta "Por que caiu" para planilha — POST com as linhas da tela.
 *
 * ── Por que as linhas vêm do cliente ──
 *
 * Os filtros da tela (causa, só quedas, busca, faixa de valor) são estado
 * de React, não estão na URL. Refazer a consulta aqui obrigaria a duplicar
 * cada filtro no servidor, e qualquer um que mudasse de um lado faria a
 * planilha deixar de ser o que estava na tela — a diferença que o usuário
 * mais paga para descobrir, porque ele confere o total e não bate.
 *
 * Então a tela manda o que está vendo. Não é dado novo: são os números que
 * ela já recebeu da consulta autenticada. A sessão é conferida de novo aqui
 * só para a rota não virar um formatador aberto.
 *
 * ── Uma coluna por número, e os dois períodos ──
 *
 * A tela mostra antes e agora lado a lado. A planilha abre cada métrica em
 * duas colunas e acrescenta a variação: é isso que permite ordenar por
 * "quem perdeu mais visita" e cruzar com preço no mesmo lugar, sem refazer
 * conta nenhuma.
 */

type Corpo = {
  periodo: { de: string; ate: string; deAnterior: string; ateAnterior: string; dias: number; diasAnterior: number };
  filtro?: string;
  linhas: LinhaQueda[];
};

const r2 = (v: number) => Number(v.toFixed(2));
/** Variação em %, nula quando não há base — zero diria "não mudou". */
const varPct = (agora: number | null, antes: number | null) =>
  agora != null && antes != null && antes > 0 ? r2(((agora - antes) / antes) * 100) : null;

export async function POST(req: NextRequest) {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao?.user) return NextResponse.json({ erro: "Entre no sistema primeiro." }, { status: 401 });

  const corpo = (await req.json().catch(() => null)) as Corpo | null;
  if (!corpo?.linhas?.length) return NextResponse.json({ erro: "Nada para exportar." }, { status: 400 });
  if (corpo.linhas.length > 5000) return NextResponse.json({ erro: "Exportação limitada a 5.000 linhas." }, { status: 413 });

  const p = corpo.periodo;
  const wb = new ExcelJS.Workbook();
  wb.creator = "gerizo";
  const ws = wb.addWorksheet("Por que caiu");

  /*
   * Os rótulos das duas colunas de cada par trazem a DATA, não "antes" e
   * "agora": a planilha sai da tela e vai para uma reunião, onde ninguém
   * lembra qual período era qual.
   */
  const atual = `${p.de} a ${p.ate}`;
  const anterior = `${p.deAnterior} a ${p.ateAnterior}`;

  type Col = { h: string; w: number; v: (l: LinhaQueda) => string | number | null; fmt?: string };
  const colunas: Col[] = [
    { h: "SKU", w: 14, v: (l) => l.sku || "" },
    { h: "Código", w: 16, v: (l) => l.codigo },
    { h: "Produto", w: 44, v: (l) => l.titulo },
    { h: "Canal · conta", w: 26, v: (l) => l.onde },
    { h: "Curva", w: 7, v: (l) => l.curva },
    { h: "Causa", w: 18, v: (l) => l.causa },
    { h: "Leitura", w: 52, v: (l) => l.explicacao },
    { h: "Situação", w: 12, v: (l) => l.status ?? "" },
    { h: "Estoque agora", w: 13, v: (l) => l.estoqueAtual, fmt: "0" },

    { h: `Receita ${anterior}`, w: 16, v: (l) => r2(l.antes.receita), fmt: '#,##0.00' },
    { h: `Receita ${atual}`, w: 16, v: (l) => r2(l.agora.receita), fmt: '#,##0.00' },
    { h: "Receita Δ R$", w: 14, v: (l) => r2(l.delta), fmt: '#,##0.00' },
    { h: "Receita Δ %", w: 12, v: (l) => l.deltaPct, fmt: '0.0' },

    { h: `Unidades ${anterior}`, w: 15, v: (l) => l.antes.unidades, fmt: "0" },
    { h: `Unidades ${atual}`, w: 15, v: (l) => l.agora.unidades, fmt: "0" },
    { h: "Unidades Δ %", w: 13, v: (l) => varPct(l.agora.unidades, l.antes.unidades), fmt: '0.0' },

    { h: `Pedidos ${anterior}`, w: 14, v: (l) => l.antes.pedidos, fmt: "0" },
    { h: `Pedidos ${atual}`, w: 14, v: (l) => l.agora.pedidos, fmt: "0" },

    { h: `Visitas ${anterior}`, w: 14, v: (l) => l.antes.visitas, fmt: "0" },
    { h: `Visitas ${atual}`, w: 14, v: (l) => l.agora.visitas, fmt: "0" },
    { h: "Visitas Δ %", w: 12, v: (l) => varPct(l.agora.visitas, l.antes.visitas), fmt: '0.0' },

    { h: `Conversão % ${anterior}`, w: 17, v: (l) => (l.antes.conversao == null ? null : r2(l.antes.conversao)), fmt: '0.00' },
    { h: `Conversão % ${atual}`, w: 17, v: (l) => (l.agora.conversao == null ? null : r2(l.agora.conversao)), fmt: '0.00' },
    { h: "Conversão Δ %", w: 14, v: (l) => varPct(l.agora.conversao, l.antes.conversao), fmt: '0.0' },

    { h: `Preço anunciado ${anterior}`, w: 20, v: (l) => l.antes.precoVitrine, fmt: '#,##0.00' },
    { h: `Preço anunciado ${atual}`, w: 20, v: (l) => l.agora.precoVitrine, fmt: '#,##0.00' },
    { h: "Preço anunciado Δ %", w: 18, v: (l) => varPct(l.agora.precoVitrine, l.antes.precoVitrine), fmt: '0.0' },

    { h: `Preço vendido ${anterior}`, w: 19, v: (l) => l.antes.precoVendido, fmt: '#,##0.00' },
    { h: `Preço vendido ${atual}`, w: 19, v: (l) => l.agora.precoVendido, fmt: '#,##0.00' },
    { h: "Preço vendido Δ %", w: 17, v: (l) => varPct(l.agora.precoVendido, l.antes.precoVendido), fmt: '0.0' },

    { h: "Preço publicado hoje", w: 18, v: (l) => l.precoAtual, fmt: '#,##0.00' },

    /* A repartição em R$: soma dos quatro = Receita Δ R$. É o que diz
       QUANTO da queda foi visita, conversão ou preço, em vez de só dizer
       que os três caíram. */
    { h: "Efeito visitas R$", w: 16, v: (l) => l.efeito.visitas, fmt: '#,##0.00' },
    { h: "Efeito conversão R$", w: 18, v: (l) => l.efeito.conversao, fmt: '#,##0.00' },
    { h: "Efeito unidades R$", w: 17, v: (l) => l.efeito.unidades, fmt: '#,##0.00' },
    { h: "Efeito preço R$", w: 15, v: (l) => r2(l.efeito.preco), fmt: '#,##0.00' },

    { h: "Dias sem estoque", w: 15, v: (l) => l.diasSemEstoque, fmt: "0" },
    { h: "Dias com estoque", w: 15, v: (l) => l.diasComEstoque, fmt: "0" },

    { h: `Dias ganhando catálogo ${anterior}`, w: 24, v: (l) => l.catalogo?.antes.ganhando ?? null, fmt: "0" },
    { h: `Dias medidos ${anterior}`, w: 18, v: (l) => l.catalogo?.antes.dias ?? null, fmt: "0" },
    { h: `Dias ganhando catálogo ${atual}`, w: 24, v: (l) => l.catalogo?.agora.ganhando ?? null, fmt: "0" },
    { h: `Dias medidos ${atual}`, w: 18, v: (l) => l.catalogo?.agora.dias ?? null, fmt: "0" },

    { h: "Cobertura de visita %", w: 18, v: (l) => r2(l.agora.cobertura * 100), fmt: '0.0' },
  ];

  /* Linha 1: o recorte, para a planilha se explicar sozinha depois de
     salva. Linha 2 em branco, linha 3 o cabeçalho. */
  ws.getCell("A1").value =
    `Por que caiu · ${atual} (${p.dias} dias) contra ${anterior} (${p.diasAnterior} dias)` +
    (corpo.filtro ? ` · filtro: ${corpo.filtro}` : "") +
    ` · ${corpo.linhas.length} linhas`;
  ws.getCell("A1").font = { bold: true, size: 11 };
  ws.getRow(3).values = colunas.map((c) => c.h);
  ws.getRow(3).font = { bold: true };
  ws.getRow(3).alignment = { vertical: "middle", wrapText: true };
  ws.getRow(3).height = 30;
  ws.columns = colunas.map((c) => ({ width: c.w }));

  for (const l of corpo.linhas) {
    const linha = ws.addRow(colunas.map((c) => c.v(l)));
    colunas.forEach((c, i) => {
      if (c.fmt) linha.getCell(i + 1).numFmt = c.fmt;
    });
  }

  /* Congela o cabeçalho e as três primeiras colunas: com 40 colunas, rolar
     para a direita sem isso perde de vista de qual produto é a linha. */
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 3 }];
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: colunas.length } };

  const buf = await wb.xlsx.writeBuffer();
  const nome = `por-que-caiu-${p.de}-a-${p.ate}.xlsx`;
  return new NextResponse(buf as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nome}"`,
      "cache-control": "no-store",
    },
  });
}
