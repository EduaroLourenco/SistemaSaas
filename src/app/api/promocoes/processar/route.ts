import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { lerFormulaBase, resumoFormulaBase } from "@/lib/planilhas/formula-base";
import { carregarFormulaBase } from "@/lib/dados/formula-base";
import { processarPlanilha, type LinhaProcessada } from "@/lib/planilhas/processar";
import { generateReport, type ReportItem } from "@/lib/planilhas/relatorio-gerencial";
import { guardarPacote } from "@/lib/planilhas/pacotes";
import { gravarProcessamento } from "@/lib/dados/gravar-promocoes";
import { clienteServidor } from "@/lib/supabase/servidor";

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
      if (!guardada) {
        return NextResponse.json(
          {
            erro:
              "Não há Fórmula base guardada. Envie o arquivo desta vez — " +
              "nas próximas ele fica opcional.",
          },
          { status: 400 }
        );
      }
      formulaData = guardada.dados;
      origemBase = `base guardada, vigente desde ${guardada.vigenteDe}`;
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
      gravacao = await gravarProcessamento({
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
    };

    return NextResponse.json({
      id,
      gravacao,
      erroGravacao,
      resumoBase,
      // De onde veio a base — a tela mostra, para ninguém processar uma
      // semana inteira com a versão errada sem perceber.
      origemBase,
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
