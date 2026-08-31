import JSZip from "jszip";
import { montarPacote } from "@/lib/dados/pacote-analise";

export const runtime = "nodejs";
// Monta o pacote inteiro sob demanda; a operação tem milhares de linhas.
export const maxDuration = 120;

/**
 * O pacote completo, num zip.
 *
 * Um CSV só não serve: pedido, item, anúncio e KPI têm formatos
 * diferentes, e achatá-los num arquivo obrigaria a repetir o pedido em
 * cada item — o que multiplica a receita na primeira soma que alguém
 * fizer.
 */
export async function GET() {
  try {
    const arquivos = await montarPacote();

    const zip = new JSZip();
    for (const a of arquivos) {
      // O BOM entra só nos CSV: sem ele o Excel abre em ANSI e todo
      // acento vira símbolo. Leitores de máquina ignoram o BOM.
      const bom = a.nome.endsWith(".csv") ? "\uFEFF" : "";
      zip.file(a.nome, bom + a.conteudo);
    }

    const conteudo = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    const carimbo = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(conteudo), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="operacao-${carimbo}.zip"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return Response.json(
      { erro: e instanceof Error ? e.message : "Falha ao montar o pacote." },
      { status: 500 }
    );
  }
}
