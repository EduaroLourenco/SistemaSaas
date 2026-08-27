import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "@/lib/dados/paginar";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Gera os arquivos de exportação.
 *
 * A tela anterior tinha botões que não faziam nada e tamanhos fixos
 * ("~2,4 MB") escritos no código. Um botão de download que não baixa é
 * pior que a ausência dele: a pessoa clica, não acontece nada, e ela fica
 * sem saber se o problema é o arquivo ou a conexão.
 *
 * O arquivo sai direto na resposta, montado sob demanda. Não há fila nem
 * agendamento — quando existir, entra aqui.
 */

type Formato = "vendas_diarias" | "consolidado_mensal" | "desempenho_anuncios" | "historico_promocoes";

const CSV_BOM = "﻿";

/** CSV com separador ponto e vírgula: é o que o Excel em pt-BR espera. */
function csv(cabecalho: string[], linhas: (string | number | null)[][]) {
  const escapar = (v: string | number | null) => {
    if (v == null) return "";
    const s = String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    CSV_BOM +
    [cabecalho, ...linhas].map((l) => l.map(escapar).join(";")).join("\r\n")
  );
}

/** Número em formato pt-BR, para o Excel não ler 1.234,56 como texto. */
const br = (v: unknown) =>
  v == null ? "" : String(Number(v).toFixed(2)).replace(".", ",");

export async function GET(req: NextRequest) {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) {
    return NextResponse.json(
      { erro: "Não autenticado", codigo: "sem_sessao" },
      { status: 401 }
    );
  }

  const formato = req.nextUrl.searchParams.get("formato") as Formato | null;
  const de = req.nextUrl.searchParams.get("de") ?? undefined;
  const ate = req.nextUrl.searchParams.get("ate") ?? undefined;

  if (!formato) {
    return NextResponse.json({ erro: "Informe o formato" }, { status: 400 });
  }

  const hoje = new Date().toISOString().slice(0, 10);

  try {
    if (formato === "vendas_diarias") {
      const linhas = await paginar(() => {
        let q = sb
          .from("vendas_diarias")
          .select(
            "data,visitas,pedidos,receita,investimento_ads,receita_ads,pedidos_cancelados," +
              "valor_cancelado,ticket_medio,acos,roas,contas_canal(nome,canais(nome))"
          )
          .order("data", { ascending: true });
        if (de) q = q.gte("data", de);
        if (ate) q = q.lte("data", ate);
        return q;
      });

      type L = {
        data: string; visitas: number; pedidos: number; receita: string;
        investimento_ads: string; receita_ads: string; pedidos_cancelados: number;
        valor_cancelado: string; ticket_medio: string | null;
        acos: string | null; roas: string | null;
        contas_canal: { nome: string; canais: { nome: string } | null } | null;
      };

      const corpo = csv(
        ["Data", "Canal", "Conta", "Visitas", "Pedidos", "Receita", "Inv. ADS",
         "Receita ADS", "Ped. cancelados", "Valor cancelado", "Ticket médio", "ACOS", "ROAS"],
        (linhas as unknown as L[]).map((l) => [
          l.data,
          l.contas_canal?.canais?.nome ?? "",
          l.contas_canal?.nome ?? "",
          l.visitas,
          l.pedidos,
          br(l.receita),
          br(l.investimento_ads),
          br(l.receita_ads),
          l.pedidos_cancelados,
          br(l.valor_cancelado),
          br(l.ticket_medio),
          br(l.acos),
          br(l.roas),
        ])
      );

      return arquivo(corpo, `lancamentos-diarios-${hoje}.csv`, "text/csv");
    }

    if (formato === "consolidado_mensal") {
      const linhas = await paginar(() =>
        sb
          .from("vendas_diarias")
          .select("data,visitas,pedidos,receita,investimento_ads,valor_cancelado,contas_canal(nome,canais(nome))")
          .order("data", { ascending: true })
      );

      type L = {
        data: string; visitas: number; pedidos: number; receita: string;
        investimento_ads: string; valor_cancelado: string;
        contas_canal: { nome: string; canais: { nome: string } | null } | null;
      };

      const acc = new Map<string, {
        canal: string; mes: string; vis: number; ped: number;
        rec: number; ads: number; canc: number;
      }>();

      for (const l of linhas as unknown as L[]) {
        const canal = `${l.contas_canal?.canais?.nome ?? ""} · ${l.contas_canal?.nome ?? ""}`;
        const mes = l.data.slice(0, 7);
        const k = `${canal}|${mes}`;
        const g = acc.get(k) ?? { canal, mes, vis: 0, ped: 0, rec: 0, ads: 0, canc: 0 };
        g.vis += l.visitas;
        g.ped += l.pedidos;
        g.rec += Number(l.receita) || 0;
        g.ads += Number(l.investimento_ads) || 0;
        g.canc += Number(l.valor_cancelado) || 0;
        acc.set(k, g);
      }

      const corpo = csv(
        ["Canal", "Mês", "Visitas", "Pedidos", "Receita", "Inv. ADS",
         "Valor cancelado", "Ticket médio", "Conversão %", "TACOS %"],
        [...acc.values()]
          .sort((a, b) => a.canal.localeCompare(b.canal) || a.mes.localeCompare(b.mes))
          .map((g) => [
            g.canal,
            g.mes,
            g.vis,
            g.ped,
            br(g.rec),
            br(g.ads),
            br(g.canc),
            br(g.ped ? g.rec / g.ped : 0),
            br(g.vis ? (g.ped * 100) / g.vis : 0),
            br(g.rec ? (g.ads * 100) / g.rec : 0),
          ])
      );

      return arquivo(corpo, `consolidado-mensal-${hoje}.csv`, "text/csv");
    }

    if (formato === "desempenho_anuncios") {
      const linhas = await paginar(() =>
        sb
          .from("anuncio_desempenho_semanal")
          .select(
            "ano_iso,semana_iso,inicio,fim,visitas,vendas,receita,preco_praticado," +
              "comissao_negociada,conversao,anuncios(codigo_externo,titulo,sku_canal,tipo)"
          )
          .order("semana_iso", { ascending: true })
      );

      type L = {
        ano_iso: number; semana_iso: number; inicio: string; fim: string;
        visitas: number; vendas: number; receita: string;
        preco_praticado: string | null; comissao_negociada: string | null;
        conversao: string | null;
        anuncios: { codigo_externo: string; titulo: string; sku_canal: string | null; tipo: string } | null;
      };

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Desempenho semanal");
      ws.columns = [
        { header: "MLB", key: "mlb", width: 16 },
        { header: "SKU", key: "sku", width: 14 },
        { header: "Produto", key: "titulo", width: 46 },
        { header: "Tipo", key: "tipo", width: 11 },
        { header: "Ano", key: "ano", width: 7 },
        { header: "Semana", key: "sem", width: 8 },
        { header: "Início", key: "ini", width: 12 },
        { header: "Fim", key: "fim", width: 12 },
        { header: "Visitas", key: "vis", width: 10 },
        { header: "Unidades", key: "un", width: 10 },
        { header: "Receita", key: "rec", width: 14 },
        { header: "Preço pago", key: "preco", width: 13 },
        { header: "Comissão %", key: "com", width: 12 },
        { header: "Conversão %", key: "conv", width: 12 },
      ];
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: "frozen", ySplit: 1 }];

      for (const l of linhas as unknown as L[]) {
        ws.addRow({
          mlb: l.anuncios?.codigo_externo ?? "",
          sku: l.anuncios?.sku_canal ?? "",
          titulo: l.anuncios?.titulo ?? "",
          tipo: l.anuncios?.tipo === "premium" ? "Premium" : "Clássico",
          ano: l.ano_iso,
          sem: l.semana_iso,
          ini: l.inicio,
          fim: l.fim,
          vis: l.visitas,
          un: l.vendas,
          rec: Number(l.receita) || 0,
          preco: l.preco_praticado != null ? Number(l.preco_praticado) : null,
          com: l.comissao_negociada != null ? Number(l.comissao_negociada) : null,
          conv: l.conversao != null ? Number(l.conversao) : null,
        });
      }

      for (const k of ["rec", "preco"]) ws.getColumn(k).numFmt = '#,##0.00';
      for (const k of ["com", "conv"]) ws.getColumn(k).numFmt = '0.00"%"';

      const buf = await wb.xlsx.writeBuffer();
      return arquivo(
        Buffer.from(buf),
        `desempenho-anuncios-${hoje}.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
    }

    if (formato === "historico_promocoes") {
      const linhas = await paginar(() =>
        sb
          .from("historico_promocoes")
          .select(
            "mlb,sku,campanha,tipo_anuncio,tipo_campanha,preco_tabela,preco_oferta," +
              "preco_piso,preco_com_extra,reducao_tarifa,status_aprovacao,motivo,data_processamento"
          )
          .order("data_processamento", { ascending: false })
      );

      type L = {
        mlb: string; sku: string | null; campanha: string;
        tipo_anuncio: string; tipo_campanha: string | null;
        preco_tabela: string | null; preco_oferta: string | null;
        preco_piso: string | null; preco_com_extra: string | null;
        reducao_tarifa: string | null; status_aprovacao: string;
        motivo: string | null; data_processamento: string;
      };

      const corpo = csv(
        ["Data", "MLB", "SKU", "Campanha", "Tipo anúncio", "Tipo campanha",
         "Ofertado ML", "Tabela", "Piso -5%", "Com extra", "Redução tarifa",
         "Decisão", "Motivo"],
        (linhas as unknown as L[]).map((l) => [
          l.data_processamento.slice(0, 10),
          l.mlb,
          l.sku ?? "",
          l.campanha,
          l.tipo_anuncio === "premium" ? "Premium" : "Clássico",
          l.tipo_campanha ?? "",
          br(l.preco_oferta),
          br(l.preco_tabela),
          br(l.preco_piso),
          br(l.preco_com_extra),
          l.reducao_tarifa ?? "",
          l.status_aprovacao === "aprovado" ? "Participa" : "Fora",
          l.motivo ?? "",
        ])
      );

      return arquivo(corpo, `historico-promocoes-${hoje}.csv`, "text/csv");
    }

    return NextResponse.json({ erro: "Formato desconhecido" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "falha ao gerar";
    console.error("Exportação falhou:", e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}

function arquivo(corpo: string | Buffer, nome: string, tipo: string) {
  return new NextResponse(corpo as BodyInit, {
    headers: {
      "content-type": `${tipo}; charset=utf-8`,
      // `attachment` com nome: sem isso o navegador abre o CSV como texto.
      "content-disposition": `attachment; filename="${nome}"`,
      "cache-control": "no-store",
    },
  });
}
