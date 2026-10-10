import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { lerFormulaBase, resumoFormulaBase } from "@/lib/planilhas/formula-base";
import { carregarFormulaBase } from "@/lib/dados/formula-base";
import { carregarCustosPromocao, baseDosAnuncios } from "@/lib/dados/custos-promocao";
import type { RegraPreco } from "@/lib/planilhas/motor-promocoes";
import { processarPlanilha, type LinhaProcessada } from "@/lib/planilhas/processar";
import { generateReport, type ReportItem } from "@/lib/planilhas/relatorio-gerencial";
import { guardarPacote } from "@/lib/planilhas/pacotes";
import { gravarProcessamento } from "@/lib/dados/gravar-promocoes";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";

// exceljs e jszip precisam do runtime Node, não do Edge.
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Processa as planilhas da Central de Promoções.
 *
 * Devolve JSON com a conferência item a item — a tela mostra isso antes de
 * o usuário baixar qualquer coisa. O arquivo gerado fica guardado por alguns
 * minutos e sai pela rota de download.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const planilhas = formData.getAll("planilha") as File[];
    const base = formData.get("formulaBase") as File | null;
    const descontoExtra = parseFloat((formData.get("descontoExtra") as string) || "0");
    const pedida = String(formData.get("regra") ?? "tabela");
    /*
     * Duas perguntas independentes, dois campos: de ONDE vem o mínimo
     * (regra) e se ele é alvo a propor ou piso a respeitar (comoUsar).
     * Juntá-los num só seletor impediria a combinação que o cliente sem
     * tabela de preço precisa: mínimo calculado do custo, usado como piso.
     */
    const comoUsar: RegraPreco["comoUsar"] =
      String(formData.get("comoUsar") ?? "alvo") === "piso" ? "piso" : "alvo";
    /* Vazio é diferente de zero: vazio cai no padrão de cada leitura (5%
       em alvo, 0 em piso), zero é a empresa dizendo "nenhuma folga". */
    const bruta = formData.get("toleranciaPct");
    const toleranciaPct =
      bruta == null || String(bruta).trim() === "" ? undefined : Math.min(50, Math.max(0, parseFloat(String(bruta)) || 0));
    const modo: RegraPreco["modo"] = pedida === "margem" || pedida === "maior" ? pedida : "tabela";
    const margemMinima = Math.min(60, Math.max(0, parseFloat((formData.get("margemMinima") as string) || "0") || 0));

    if (!planilhas.length) {
      return NextResponse.json(
        { erro: "Envie ao menos uma planilha da Central de Promoções." },
        { status: 400 }
      );
    }
    /*
     * A Fórmula base pode vir no envio OU do banco.
     *
     * Ela muda poucas vezes por ano e a planilha de promoção chega toda
     * semana. Exigir o reenvio era pedir o mesmo arquivo de novo — e abria
     * espaço para mandar uma versão antiga sem perceber, o que mudaria
     * todo preço calculado sem nenhum sinal na tela.
     *
     * Enviar continua valendo, e o arquivo enviado tem precedência: é
     * assim que a base é atualizada.
     */
    let formulaData;
    let origemBase: string;

    if (base) {
      formulaData = await lerFormulaBase(Buffer.from(await base.arrayBuffer()));
      origemBase = "arquivo enviado agora";
    } else {
      const guardada = await carregarFormulaBase();
      if (!guardada && modo !== "tabela") {
        // Sem Fórmula base, a regra de margem anda sozinha: o tipo e a
        // alíquota de cada anúncio vêm da sincronização.
        formulaData = await baseDosAnuncios();
        origemBase = "sem Fórmula base — tipo e comissão dos anúncios sincronizados";
      } else if (!guardada) {
        return NextResponse.json(
          {
            erro:
              "Não há Fórmula base guardada. Envie o arquivo desta vez — " +
              "nas próximas ele fica opcional.",
          },
          { status: 400 }
        );
      } else {
        formulaData = guardada.dados;
        origemBase = `base guardada, vigente desde ${guardada.vigenteDe}`;
      }
    }

    let custosUsados = 0;
    let custosIncompletos = 0;
    if (modo !== "tabela") {
      const { custos, incompletos } = await carregarCustosPromocao();
      custosUsados = custos.size;
      custosIncompletos = incompletos;
      if (!custos.size && modo === "margem") {
        return NextResponse.json(
          { erro: "Nenhum SKU com custo completo. Preencha em Financeiro › Custos (mercadoria, embalagem, imposto e peso)." },
          { status: 400 }
        );
      }
      formulaData = { ...formulaData, custos, regra: { modo, margemMinima, comoUsar, toleranciaPct } };
    } else if (comoUsar === "piso") {
      // Sem custo nenhum a carregar: o piso já está na tabela guardada.
      formulaData = { ...formulaData, regra: { modo, margemMinima, comoUsar, toleranciaPct } };
    }

    const resumoBase = resumoFormulaBase(formulaData);

    if (resumoBase.itens === 0) {
      return NextResponse.json(
        {
          erro:
            'A aba "Base MLB" veio vazia. Sem ela todo item volta como pendência, então o processamento foi interrompido.',
        },
        { status: 400 }
      );
    }

    const zip = new JSZip();
    const todasLinhas: LinhaProcessada[] = [];
    const todosItens: ReportItem[] = [];
    const arquivos: { nome: string; campanha: string; linhas: number }[] = [];

    for (const arquivo of planilhas) {
      const buffer = Buffer.from(await arquivo.arrayBuffer());
      const r = await processarPlanilha(
        buffer,
        arquivo.name,
        formulaData,
        descontoExtra
      );

      zip.file(`processado_${arquivo.name}`, r.buffer);
      todasLinhas.push(...r.linhas);
      todosItens.push(...r.itensRelatorio);
      arquivos.push({
        nome: arquivo.name,
        campanha: r.campanha,
        linhas: r.linhas.length,
      });
    }

    if (todosItens.length > 0) {
      const relatorio = await generateReport(todosItens);
      zip.file("Relatorio_Gerencial_Campanhas.xlsx", relatorio);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const id = await guardarPacote(zipBuffer);

    /*
     * Grava a decisão. Sem isto, o processamento decidia e esquecia:
     * Campanhas e Histórico apareciam vazios porque não havia o que
     * mostrar.
     *
     * Falha aqui não derruba o processamento — o arquivo já está pronto e
     * o usuário precisa dele. O erro vai para a resposta, que a tela
     * mostra: perder o registro é ruim, perder o arquivo é pior.
     */
    let gravacao = null;
    let erroGravacao: string | null = null;
    try {
      const sb = await clienteServidor();
      const { data: sessao } = await sb.auth.getUser();
      const operacao = await operacaoPadrao();
      if (!operacao) throw new Error("Nenhuma operação acessível para gravar o processamento.");
      gravacao = await gravarProcessamento({
        operacaoId: operacao.id,
        linhas: todasLinhas,
        arquivos: arquivos.map((a) => a.nome),
        descontoExtra,
        usuarioId: sessao.user?.id,
      });
    } catch (e) {
      erroGravacao = e instanceof Error ? e.message : "falha ao gravar";
      console.error("Promoções: processou mas não gravou:", e);
    }

    const participam = todasLinhas.filter((l) => l.aprovado).length;
    const pendencias = todasLinhas.filter((l) => l.motivo).length;

    // Cada cenário já sai ordenado do jeito que a tela precisa mostrar.
    const revisao = {
      tabela_acima_ml: todasLinhas
        .filter((l) => l.tags.includes("tabela_acima_ml"))
        .sort((a, b) => (a.folga ?? 0) - (b.folga ?? 0)),

      tabela_acima_original: todasLinhas
        .filter((l) => l.tags.includes("tabela_acima_original"))
        .sort(
          (a, b) =>
            b.precoTabela - (b.precoOriginal ?? 0) -
            (a.precoTabela - (a.precoOriginal ?? 0))
        ),

      // do menor para o maior: quem faltou menos aparece primeiro
      quase: todasLinhas
        .filter((l) => l.tags.includes("quase"))
        .sort((a, b) => Math.abs(a.folga ?? 0) - Math.abs(b.folga ?? 0)),

      // maior sobra primeiro, e com redução de tarifa na frente do empate
      folga: todasLinhas
        .filter((l) => l.tags.includes("folga"))
        .sort((a, b) => {
          const red =
            Number(b.tipoCampanha === "Com Redução") -
            Number(a.tipoCampanha === "Com Redução");
          return red !== 0 ? red : (b.folga ?? 0) - (a.folga ?? 0);
        }),

      /*
       * As linhas que o sistema NÃO tocou, e por quê.
       *
       * Sem este balde, a nova regra é invisível: a planilha volta com
       * itens sem alteração e não há onde ver quais foram nem a razão.
       * Quem conferir precisa poder auditar a omissão do mesmo jeito que
       * audita uma decisão.
       */
      nao_alteradas: todasLinhas
        .filter(
          (l) =>
            l.tags.includes("participando") ||
            l.tags.includes("sem_acao_disponivel")
        )
        .sort((a, b) => (a.folga ?? 0) - (b.folga ?? 0)),
    };

    return NextResponse.json({
      id,
      gravacao,
      erroGravacao,
      resumoBase,
      // De onde veio a base — a tela mostra, para ninguém processar uma
      // semana inteira com a versão errada sem perceber.
      origemBase,
      regra: { modo, margemMinima, comoUsar, toleranciaPct, custosUsados, custosIncompletos },
      arquivos,
      resumo: {
        lidos: todasLinhas.length,
        participam,
        fora: todasLinhas.length - participam,
        pendencias,
        recalculados: todasLinhas.filter((l) => l.recalculado).length,
        revisar: new Set(
          todasLinhas.filter((l) => l.tags.length).map((l) => l.mlb)
        ).size,
      },
      revisao,
      linhas: todasLinhas,
    });
  } catch (e: unknown) {
    /*
     * "Erro desconhecido" escondia a causa real.
     *
     * O supabase-js lança objeto simples, não Error — então
     * `e instanceof Error` era falso e a mensagem se perdia. Aqui o que
     * não for Error é serializado, para a tela mostrar algo em que dê para
     * agir em vez de um beco sem saída.
     */
    let msg: string;
    if (e instanceof Error) {
      msg = e.message;
    } else if (e && typeof e === "object") {
      const o = e as Record<string, unknown>;
      msg =
        [o.message, o.code && `(código ${o.code})`, o.details, o.hint]
          .filter(Boolean)
          .join(" ") || JSON.stringify(o).slice(0, 300);
    } else {
      msg = String(e);
    }
    console.error("Falha ao processar promoções:", e);
    return NextResponse.json({ erro: msg }, { status: 400 });
  }
}
