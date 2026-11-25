import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { paginar } from "@/lib/dados/paginar";
import { abrirPlanilha } from "@/lib/planilhas/abrir";
import { lerTabelaFaixas, type Modo } from "@/lib/planilhas/tabela-faixas";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Sobe a tabela por faixa como vigência de hoje, no modo escolhido.
 *
 * Fluxo vai para `formula_base_fluxo` e não toca em mais nada.
 * Antecipado é a Fórmula base do motor: além dos preços por SKU, copia da
 * vigência anterior o mapa MLB → tipo e os preços por MLB — o motor escolhe
 * a vigência pelos ITENS, e preço novo sem item novo nunca seria lido
 * (mesma regra de scripts/local/importar-tabela-precos.mjs).
 *
 * Grava com o cliente da sessão: quem não pode editar a empresa leva 403
 * do próprio RLS.
 */
export async function POST(req: Request) {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) return NextResponse.json({ erro: "Entre no sistema primeiro." }, { status: 401 });
  const op = await operacaoPadrao();
  if (!op) return NextResponse.json({ erro: "Nenhuma empresa selecionada." }, { status: 404 });

  const form = await req.formData();
  const modo: Modo = form.get("modo") === "fluxo" ? "fluxo" : "antecipado";
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return NextResponse.json({ erro: "Escolha a planilha." }, { status: 400 });

  let tabela;
  try {
    tabela = lerTabelaFaixas(await abrirPlanilha(Buffer.from(await arquivo.arrayBuffer())), modo);
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Planilha ilegível." }, { status: 400 });
  }

  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const base = { operacao_id: op.id, vigente_de: hoje };
  const linhas = [...tabela].flatMap(([chave, l]) => [...l].map(([comissao, preco]) => ({ ...base, chave, comissao, preco })));

  const gravar = async (nome: string, rows: object[], conflito: string) => {
    for (let i = 0; i < rows.length; i += 1000) {
      const { error } = await sb.from(nome).upsert(rows.slice(i, i + 1000), { onConflict: conflito });
      if (error) throw new Error(error.code === "42501" ? "Seu acesso não permite alterar a tabela desta empresa." : error.message);
    }
  };

  try {
    if (modo === "fluxo") {
      await gravar("formula_base_fluxo", linhas, "operacao_id,chave,comissao,vigente_de");
    } else {
      const { data: v } = await sb
        .from("formula_base_itens")
        .select("vigente_de")
        .eq("operacao_id", op.id)
        .lt("vigente_de", hoje)
        .order("vigente_de", { ascending: false })
        .limit(1);
      const anterior = v?.[0]?.vigente_de as string | undefined;
      if (anterior) {
        const itens = await paginar(() =>
          sb.from("formula_base_itens").select("mlb,sku,tipo_anuncio,comissao_padrao").eq("operacao_id", op.id).eq("vigente_de", anterior)
        );
        await gravar("formula_base_itens", itens.map((i) => ({ ...base, ...i })), "operacao_id,mlb,vigente_de");
        const mlb = await paginar(() =>
          sb.from("formula_base_precos").select("chave,comissao,preco").eq("operacao_id", op.id).eq("vigente_de", anterior).eq("chave_tipo", "mlb")
        );
        await gravar("formula_base_precos", mlb.map((p) => ({ ...base, chave_tipo: "mlb", ...p })), "operacao_id,chave_tipo,chave,comissao,vigente_de");
      }
      await gravar("formula_base_precos", linhas.map((l) => ({ ...l, chave_tipo: "sku" })), "operacao_id,chave_tipo,chave,comissao,vigente_de");
    }
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Falha ao gravar." }, { status: 500 });
  }

  return NextResponse.json({ skus: tabela.size, linhas: linhas.length, vigenteDe: hoje });
}
