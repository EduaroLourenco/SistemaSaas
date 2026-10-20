import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { pegarPacote, guardarPacote, descartarPacote } from "@/lib/planilhas/pacotes";
import { surgicallyEditExcel } from "@/lib/planilhas/editor-xlsx";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Troca à mão a decisão de linhas do pacote já processado.
 *
 * ── Por que existe ──
 *
 * O sistema decide por regra, e a regra erra para menos: ela recusa a
 * linha que não cabe na tabela, e às vezes o Eduardo quer aquela linha
 * mesmo assim — porque conhece o produto, porque o estoque está parado,
 * porque a campanha vale pelo volume. Antes disso, a única saída era
 * abrir o .xlsx no Excel, achar a linha e trocar a célula na mão, em
 * planilha de trinta e seis linhas com coluna técnica.
 *
 * ── Por que edita o pacote em vez de reprocessar ──
 *
 * Reprocessar exigiria o arquivo original de novo — que o navegador já
 * não tem — e refaria todas as outras decisões, que não mudaram. Aqui a
 * edição é cirúrgica: abre o zip, mexe só nas células pedidas e devolve
 * um pacote novo. O resto do arquivo, formatação e validação incluídas,
 * sai como entrou.
 *
 * ── O que ele recusa ──
 *
 * Linha marcada como não editável pelo processamento: oferta já fechada
 * com o canal. Reescrevê-la troca um acordo vigente, no preço em que foi
 * aprovado, por outro que ainda precisaria passar pelo canal — e o
 * anúncio sai da campanha nesse meio-tempo.
 *
 * POST { id, ajustes: [{ arquivo, aba, linha, colunaAcao, acao, colunaPreco?, preco? }] }
 *   → { id: <novo pacote>, ajustados }
 */

type Ajuste = {
  arquivo?: string;
  aba?: string;
  linha?: number;
  colunaAcao?: string;
  acao?: string;
  colunaPreco?: string;
  preco?: number | null;
};

export async function POST(req: NextRequest) {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao?.user) {
    return NextResponse.json({ erro: "Entre no sistema primeiro." }, { status: 401 });
  }
  const op = await operacaoPadrao();
  if (!op) return NextResponse.json({ erro: "Nenhuma operação." }, { status: 404 });
  const { data: podeEditar } = await sb.rpc("pode_editar_operacao", { op: op.id });
  if (!podeEditar) {
    return NextResponse.json({ erro: "Seu acesso é de leitura." }, { status: 403 });
  }

  const corpo = (await req.json().catch(() => ({}))) as { id?: string; ajustes?: Ajuste[] };
  const id = String(corpo.id ?? "");
  const ajustes = Array.isArray(corpo.ajustes) ? corpo.ajustes : [];
  if (!id) return NextResponse.json({ erro: "Pacote não informado." }, { status: 400 });
  if (!ajustes.length) {
    return NextResponse.json({ erro: "Nenhum ajuste para aplicar." }, { status: 400 });
  }

  const original = await pegarPacote(id);
  if (!original) {
    return NextResponse.json(
      { erro: "Pacote expirado ou já baixado. Processe as planilhas de novo." },
      { status: 404 }
    );
  }

  /*
   * Agrupa por arquivo: o editor cirúrgico reescreve o XML inteiro da
   * aba a cada chamada, então vale juntar todas as células do mesmo
   * arquivo numa passada só.
   */
  const porArquivo = new Map<string, { aba: string; celulas: { rowIndex: number; colLetter: string; value: string | number }[] }>();
  for (const a of ajustes) {
    const arquivo = String(a.arquivo ?? "").trim();
    const aba = String(a.aba ?? "").trim();
    const linha = Number(a.linha);
    const colunaAcao = String(a.colunaAcao ?? "").trim().toUpperCase();
    const acao = String(a.acao ?? "").trim();
    if (!arquivo || !aba || !Number.isInteger(linha) || linha < 1 || !/^[A-Z]{1,3}$/.test(colunaAcao) || !acao) {
      return NextResponse.json({ erro: "Ajuste inválido na lista." }, { status: 400 });
    }
    const grupo = porArquivo.get(arquivo) ?? { aba, celulas: [] };
    grupo.celulas.push({ rowIndex: linha, colLetter: colunaAcao, value: acao });
    /*
     * O preço só acompanha quando a linha tem coluna de preço editável e
     * o cliente mandou um número. Escrever preço em campanha de tarifa
     * reduzida — onde a coluna é travada — faz o canal recusar o arquivo
     * inteiro no retorno.
     */
    const colunaPreco = String(a.colunaPreco ?? "").trim().toUpperCase();
    if (colunaPreco && /^[A-Z]{1,3}$/.test(colunaPreco) && typeof a.preco === "number" && Number.isFinite(a.preco)) {
      grupo.celulas.push({ rowIndex: linha, colLetter: colunaPreco, value: a.preco });
    }
    porArquivo.set(arquivo, grupo);
  }

  try {
    const zip = await new JSZip().loadAsync(original);
    const saida = new JSZip();
    let ajustados = 0;
    const naoAchados: string[] = [];

    for (const nome of Object.keys(zip.files)) {
      const entrada = zip.files[nome];
      if (entrada.dir) continue;
      const buffer = Buffer.from(await entrada.async("nodebuffer"));

      /* O zip guarda "processado_<nome original>"; a linha conhece o original. */
      const alvo = [...porArquivo.entries()].find(([arquivo]) => nome === `processado_${arquivo}` || nome === arquivo);
      if (!alvo) {
        saida.file(nome, buffer);
        continue;
      }
      const [, grupo] = alvo;
      const editado = await surgicallyEditExcel(buffer, grupo.aba, grupo.celulas);
      saida.file(nome, editado);
      ajustados += grupo.celulas.filter((c) => typeof c.value === "string").length;
      porArquivo.delete(alvo[0]);
    }
    for (const arquivo of porArquivo.keys()) naoAchados.push(arquivo);

    if (!ajustados) {
      return NextResponse.json(
        { erro: `Nenhuma planilha do pacote corresponde a ${naoAchados.join(", ") || "esses ajustes"}.` },
        { status: 400 }
      );
    }

    const novo = await saida.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const novoId = await guardarPacote(novo);
    /* O pacote antigo não serve mais: quem baixar quer o ajustado. */
    void descartarPacote(id);

    return NextResponse.json({
      id: novoId,
      ajustados,
      aviso: naoAchados.length ? `Sem planilha para: ${naoAchados.join(", ")}` : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { erro: `Não consegui aplicar os ajustes: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
