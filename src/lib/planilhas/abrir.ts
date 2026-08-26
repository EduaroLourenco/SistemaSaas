import ExcelJS from "exceljs";
import JSZip from "jszip";

/**
 * Abre um .xlsx que o ExcelJS sozinho não consegue abrir.
 *
 * A planilha de KPIs derruba o ExcelJS com `Cannot read properties of
 * undefined (reading 'anchors')` — é um defeito conhecido dele ao
 * reconciliar desenhos, gráficos e comentários. Como quem envia o arquivo
 * é o usuário, isso não é caso raro: qualquer planilha com um gráfico
 * colado quebraria a importação inteira, e a mensagem não diria por quê.
 *
 * A saída é remover do pacote tudo que não é dado antes de entregar.
 * Gráfico, imagem e comentário não interessam para importar número — e
 * como o arquivo original em disco não é tocado, nada se perde.
 */

/** Partes do pacote que só carregam apresentação. */
const DESCARTAVEL = /^xl\/(drawings|media|charts|comments)/;
/** Relacionamentos que apontam para elas. */
const REL_DESCARTAVEL = /(drawing|comments|vmlDrawing|chart)/i;

export async function abrirPlanilha(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();

  // O caminho direto primeiro: a maioria dos arquivos passa por aqui, e
  // desmontar o zip à toa custaria tempo em planilha grande.
  try {
    await wb.xlsx.load(buffer as never);
    return wb;
  } catch {
    // Cai para a limpeza abaixo.
  }

  const zip = await JSZip.loadAsync(buffer);

  for (const nome of Object.keys(zip.files)) {
    if (DESCARTAVEL.test(nome)) zip.remove(nome);
  }

  for (const nome of Object.keys(zip.files)) {
    const arquivo = zip.file(nome);
    if (!arquivo) continue;

    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(nome)) {
      const s = await arquivo.async("string");
      zip.file(
        nome,
        s.replace(/<(drawing|legacyDrawing|legacyDrawingHF)\b[^>]*\/>/g, "")
      );
    } else if (/\.rels$/.test(nome)) {
      const s = await arquivo.async("string");
      zip.file(
        nome,
        s.replace(/<Relationship\b[^>]*\/>/g, (m) =>
          REL_DESCARTAVEL.test(m) ? "" : m
        )
      );
    } else if (nome === "[Content_Types].xml") {
      const s = await arquivo.async("string");
      zip.file(
        nome,
        s.replace(/<Override\b[^>]*\/>/g, (m) =>
          REL_DESCARTAVEL.test(m) ? "" : m
        )
      );
    }
  }

  const limpo = new ExcelJS.Workbook();
  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  await limpo.xlsx.load(bytes as never);
  return limpo;
}
