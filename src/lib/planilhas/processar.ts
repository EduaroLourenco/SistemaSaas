/* eslint-disable */
import ExcelJS from "exceljs";
import { precoPiso, precoComExtra, processItem, FormulaBaseData } from "./motor-promocoes";
import { surgicallyEditExcel } from "./editor-xlsx";
import { ReportItem } from "./relatorio-gerencial";

/**
 * Processamento de uma planilha da Central de Promoções.
 *
 * Portado de `src/app/api/processar/route.ts` do projeto anterior. O laço de
 * decisão é o MESMO, item por item: detecta a aba e a linha de cabeçalho,
 * descobre os rótulos de ação pela validação de dados da célula, chama
 * `processItem` e monta a lista de células a reescrever.
 *
 * Duas diferenças, ambas deliberadas:
 *   · a Fórmula base vem por parâmetro, não de um arquivo fixo em disco;
 *   · não grava no banco aqui — quem persiste é a rota, que sabe em qual
 *     operação está. Assim esta função continua pura e testável.
 */

function getColLetter(colIdx: number): string {
  let letter = "";
  let temp = colIdx;
  while (temp > 0) {
    const remainder = (temp - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    temp = Math.floor((temp - remainder) / 26);
  }
  return letter;
}

function extractText(val: any): string {
  if (val == null) return "";
  if (typeof val === "object") {
    if (val.richText) return val.richText.map((t: any) => t.text).join("");
    if (val.text) return val.text;
    if (val.result) return String(val.result);
    return JSON.stringify(val);
  }
  return String(val);
}

/**
 * Acha a coluna cujo cabeçalho casa.
 *
 * `exatos` casa o rótulo inteiro e tem prioridade; `contem` é o plano B,
 * por substring. As duas listas são separadas de propósito: com uma lista
 * só aceitando substring, o termo "ação" escolhia "Avaliação do desconto"
 * — que é uma FÓRMULA — em vez de "O que você quer fazer com este
 * anúncio?", e nas campanhas sem redução de tarifa a decisão ia parar na
 * coluna errada.
 *
 * Fora da função de processar porque serve a dois usos: localizar a
 * coluna e pontuar qual linha é o cabeçalho.
 */
function localizar(
  linha: unknown[],
  exatos: string[],
  contem: string[] = []
): number {
  const norm = (v: unknown) => extractText(v).toLowerCase().trim();

  const exato = linha.findIndex((v) => exatos.includes(norm(v)));
  if (exato !== -1) return exato;

  if (!contem.length) return -1;
  return linha.findIndex((v) => contem.some((termo) => norm(v).includes(termo)));
}

/**
 * Cenários de revisão. Um item pode carregar mais de um.
 *
 *  tabela_acima_ml       o preço de tabela é maior que o que o canal propôs
 *  tabela_acima_original o preço de tabela é maior que o preço já publicado
 *  quase                 recusado por pouco — diferença de até R$ 100
 *  folga                 aprovado, e ainda haveria espaço para descontar mais
 */
export type Tag = "tabela_acima_ml" | "tabela_acima_original" | "quase" | "folga";

export type LinhaProcessada = {
  /**
   * Identidade da linha: arquivo + número da linha na planilha.
   * O MLB não serve — o mesmo anúncio aparece em várias linhas da mesma
   * campanha, com preços diferentes.
   */
  id: string;
  /** Número da linha na planilha de origem, para achar o item lá. */
  linha: number;
  arquivo: string;
  mlb: string;
  sku: string;
  titulo: string;
  campanha: string;
  tipoAnuncio: string;
  tipoCampanha: "Com Redução" | "Sem Redução";
  /** Preço cheio publicado hoje, sem promoção. */
  precoOriginal: number | null;
  /** O preço final que o canal propôs na planilha. */
  precoPropostoML: number | null;
  /** O preço que efetivamente vai para a planilha de volta. */
  precoOferta: number | null;
  /** O preço que a Fórmula base diz que preserva a margem. */
  precoTabela: number;
  /**
   * Piso: o menor preço ofertável sem furar a margem (tabela − 5%).
   *
   * O canal recusa desconto abaixo de 5%, então a tabela cheia nunca é
   * ofertável na prática — o piso é o ponto de partida real.
   */
  precoPiso: number;
  /**
   * Piso com o desconto extra aplicado, quando há.
   *
   * Nulo nas campanhas COM redução de tarifa: ali o preço é do canal, e
   * não há preço nosso para descontar. Mostrar um número nesse caso
   * sugeriria uma alavanca que não existe.
   */
  precoComExtra: number | null;
  reducaoTarifa: string;
  desconto: number | null;
  /**
   * Distância entre o proposto pelo canal e o preço de tabela.
   * Positiva = sobra (dá para descontar mais).
   * Negativa = falta (o proposto está abaixo do que a margem aguenta).
   */
  folga: number | null;
  decisao: string;
  aprovado: boolean;
  recalculado: boolean;
  motivo: string;
  tags: Tag[];
};

export type ResultadoPlanilha = {
  arquivo: string;
  campanha: string;
  buffer: Buffer;
  linhas: LinhaProcessada[];
  itensRelatorio: ReportItem[];
};

export async function processarPlanilha(
  buffer: Buffer,
  nomeArquivo: string,
  formulaData: FormulaBaseData,
  descontoExtra = 0
): Promise<ResultadoPlanilha> {
  const campanhaBase = nomeArquivo.replace(/\.xlsx$/i, "");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  let targetWorksheet: ExcelJS.Worksheet | null = null;
  let headerRowIndex = 0;

  /*
   * As quatro colunas sem as quais a planilha não é processável. Ficam
   * numa constante porque servem a dois usos: pontuar qual linha é o
   * cabeçalho, e recusar o arquivo quando nenhuma linha as tem.
   */
  const OBRIGATORIAS = [
    { exatos: ["sku"], contem: ["sku"] },
    {
      exatos: ["item_id", "mlb", "número do anúncio", "código do anúncio"],
      contem: ["item_id", "número do anúncio", "código do anúncio"],
    },
    {
      // "precio final" e "recibes": o Meli exporta rótulos em espanhol
      // mesmo em conta portuguesa, e o nome técnico é o que não muda.
      exatos: ["final_price", "preço final", "precio final"],
      contem: ["preço final", "precio final"],
    },
    {
      exatos: ["action", "o que você quer fazer com este anúncio?", "ação"],
      contem: ["o que você quer fazer"],
    },
  ];

  for (const worksheet of workbook.worksheets) {
    const foundHeaders: number[] = [];
    for (let i = 1; i <= Math.min(100, worksheet.rowCount); i++) {
      const rowValues = worksheet.getRow(i).values as any[];
      if (
        rowValues &&
        rowValues.some((v) => {
          const text = extractText(v).toLowerCase();
          return (
            text === "item_id" ||
            text === "sku" ||
            text === "número do anúncio" ||
            text === "código do anúncio"
          );
        })
      ) {
        foundHeaders.push(i);
      }
    }

    if (foundHeaders.length > 0) {
      /*
       * A linha de cabeçalho é a que RESOLVE MAIS colunas obrigatórias,
       * não a mais profunda.
       *
       * A planilha do Meli repete o cabeçalho em três alturas: nomes
       * técnicos em cima (ITEM_ID, FINAL_PRICE) e rótulos traduzidos
       * embaixo. Pegar a mais profunda funcionou até o Meli exportar a
       * coluna 9 como "Precio final" — em espanhol, numa conta em
       * português. O leitor não achava "preço final", e a planilha inteira
       * era recusada por "faltam colunas obrigatórias" enquanto a coluna
       * estava lá, com outro nome.
       *
       * Os nomes técnicos não mudam com o idioma da conta. Pontuando cada
       * candidata, a linha técnica ganha sozinha quando os rótulos vêm
       * traduzidos, e a lógica antiga continua valendo no empate — que é o
       * caso do cabeçalho mesclado que motivou a regra original.
       */
      let melhor = { linha: 0, pontos: -1 };
      for (const candidata of foundHeaders) {
        const vals = worksheet.getRow(candidata).values as any[];
        const pontos = OBRIGATORIAS.reduce(
          (s, alvo) => s + (localizar(vals, alvo.exatos, alvo.contem) === -1 ? 0 : 1),
          0
        );
        // >= e não >: no empate fica a mais profunda, como antes.
        if (pontos >= melhor.pontos) melhor = { linha: candidata, pontos };
      }

      headerRowIndex = melhor.linha;
      targetWorksheet = worksheet;
      break;
    }
  }

  if (!targetWorksheet || headerRowIndex === 0) {
    throw new Error(
      `${nomeArquivo}: não encontrei a coluna ITEM_ID, SKU ou Código do anúncio.`
    );
  }

  const headerRow = targetWorksheet.getRow(headerRowIndex).values as any[];

  /**
   * Localiza uma coluna pelo cabeçalho.
   *
   * Duas listas SEPARADAS de propósito: `exatos` casa o rótulo inteiro e tem
   * prioridade; `contem` é o plano B, por substring.
   *
   * O projeto anterior usava uma lista só, aceitando substring para todos os
   * termos. Com o termo "ação" isso escolhia a coluna "Avaliação do desconto"
   * — que é uma FÓRMULA — em vez de "O que você quer fazer com este anúncio?".
   * Nas campanhas sem redução de tarifa a decisão ia parar na coluna errada e
   * a coluna certa ficava vazia. Por isso "ação" nunca entra em `contem`.
   */
  const findCol = (exatos: string[], contem: string[] = []) =>
    localizar(headerRow, exatos, contem);

  const skuColIndex = findCol(["sku"], ["sku"]);
  const mlbColIndex = findCol(
    ["item_id", "mlb", "número do anúncio", "código do anúncio"],
    ["item_id", "número do anúncio", "código do anúncio"]
  );
  const originalPriceColIndex = findCol(
    ["original_price", "preço original"],
    ["preço original"]
  );
  const finalPriceColIndex = findCol(
    ["final_price", "preço final", "precio final"],
    ["preço final", "precio final"]
  );
  const saleFeeColIndex = findCol(
    ["sale_fee", "redução nas suas tarifas de venda"],
    ["redução nas suas tarifas", "tarifa de venda"]
  );
  const actionColIndex = findCol(
    ["action", "o que você quer fazer com este anúncio?", "ação"],
    ["o que você quer fazer"]
  );
  const dateColIndex = findCol(["date", "data", "vigência"], ["vigência"]);
  const tituloColIndex = findCol(
    ["title", "título do anúncio", "titulo do anuncio"],
    ["título do anúncio"]
  );
  const tipoAnuncioColIndex = findCol(
    ["tipo de anúncio", "listing_type", "tipo de anuncio"],
    ["tipo de anúncio", "listing_type"]
  );

  if (
    skuColIndex === -1 ||
    mlbColIndex === -1 ||
    finalPriceColIndex === -1 ||
    actionColIndex === -1
  ) {
    throw new Error(
      `${nomeArquivo}: faltam colunas obrigatórias — SKU, código do anúncio, preço final e ação.`
    );
  }

  let localCampanha = campanhaBase;

  // Os rótulos da coluna de ação mudam por campanha ("Participar" ou
  // "Aplicar proposta"). Vêm da validação de dados da própria célula.
  let positiveAction = "Participar";
  let negativeAction = "Não participar";

  const firstDataRow = targetWorksheet.getRow(headerRowIndex + 1);
  const actionValidation = firstDataRow.getCell(actionColIndex).dataValidation;

  if (actionValidation?.formulae?.[0]) {
    const options = String(actionValidation.formulae[0]).replace(/['"]/g, "").split(",");
    if (options.length >= 2) {
      positiveAction = options[0].trim();
      negativeAction = options[1].trim();
    }
  }

  const linhas: LinhaProcessada[] = [];
  const itensRelatorio: ReportItem[] = [];
  const xmlUpdates: { rowIndex: number; colLetter: string; value: string | number }[] = [];

  let isDateExtracted = false;

  for (let i = headerRowIndex + 1; i <= targetWorksheet.rowCount; i++) {
    const row = targetWorksheet.getRow(i);

    const rawMlb = extractText(row.getCell(mlbColIndex).value).trim();
    const rawSku = extractText(row.getCell(skuColIndex).value).trim();

    // os dados começam na primeira linha cujo código casa com ^MLB\d+$
    if (!/^MLB\d+$/i.test(rawMlb)) continue;

    if (!isDateExtracted && dateColIndex !== -1) {
      const dataCampanha = extractText(row.getCell(dateColIndex).value).trim();
      if (dataCampanha && dataCampanha !== "Vigência") {
        localCampanha = `${localCampanha} | ${dataCampanha}`;
      }
      isDateExtracted = true;
    }

    // Os rótulos são lidos POR LINHA, não uma vez para a planilha inteira.
    // Uma mesma exportação mistura campanhas de tipos diferentes: umas pedem
    // "Aplicar proposta / Não aplicar", outras "Participar / Não participar".
    // O projeto anterior travava no primeiro rótulo encontrado e escrevia o
    // texto errado nas linhas do outro tipo — o canal recusa esse valor.
    let acaoPositiva = positiveAction;
    let acaoNegativa = negativeAction;

    const rowValidation = row.getCell(actionColIndex).dataValidation;
    if (rowValidation?.formulae?.[0]) {
      const options = String(rowValidation.formulae[0]).replace(/['"]/g, "").split(",");
      if (options.length >= 2) {
        acaoPositiva = options[0].trim();
        acaoNegativa = options[1].trim();
      }
    }

    const fpStr = extractText(row.getCell(finalPriceColIndex).value).replace(",", ".");
    const finalPrice = fpStr ? parseFloat(fpStr) : null;

    const sfStr =
      saleFeeColIndex !== -1
        ? extractText(row.getCell(saleFeeColIndex).value).replace(",", ".")
        : "";
    const saleFee = sfStr ? parseFloat(sfStr) : null;

    const opStr =
      originalPriceColIndex !== -1
        ? extractText(row.getCell(originalPriceColIndex).value).replace(",", ".")
        : "";
    const originalPrice = opStr ? parseFloat(opStr) : null;

    const tipoAnuncio =
      tipoAnuncioColIndex !== -1
        ? extractText(row.getCell(tipoAnuncioColIndex).value).trim()
        : "N/A";

    const result = processItem(
      rawMlb,
      rawSku,
      saleFee,
      finalPrice,
      originalPrice,
      formulaData,
      acaoPositiva,
      acaoNegativa,
      descontoExtra
    );

    // A coluna de ação sempre é reescrita.
    xmlUpdates.push({
      rowIndex: i,
      colLetter: getColLetter(actionColIndex),
      value: result.action,
    });

    // Só o caso sem redução de tarifa recalcula o preço final.
    if (result.newPrice !== null) {
      xmlUpdates.push({
        rowIndex: i,
        colLetter: getColLetter(finalPriceColIndex),
        value: result.newPrice,
      });
    }

    const tabela = result.tabelaCalculada || 0;
    const diferencaRS = finalPrice !== null ? finalPrice - tabela : null;
    const diferencaPerc =
      finalPrice !== null && tabela > 0 ? (finalPrice - tabela) / tabela : null;

    // Compara com o rótulo positivo DESTA linha, não com uma lista fixa.
    const aprovado = result.action === acaoPositiva;
    const tipoCampanha: "Com Redução" | "Sem Redução" =
      saleFee !== null && saleFee > 0 ? "Com Redução" : "Sem Redução";

    itensRelatorio.push({
      campanha: localCampanha,
      mlb: rawMlb,
      sku: rawSku,
      tipoCampanha,
      precoOriginal: originalPrice,
      precoOfertadoML: finalPrice,
      tarifaReduzida: saleFee,
      precoTabela: tabela,
      diferencaRS,
      diferencaPerc,
      status: aprovado ? "Aprovado" : "Reprovado",
      motivo: result.pendencia || "OK",
    });

    const precoFinalAplicado =
      result.newPrice !== null ? result.newPrice : finalPrice || 0;

    // Folga = quanto o preço proposto pelo canal está acima do preço de
    // tabela. Positiva sobra margem, negativa a margem não fecha.
    const folga =
      finalPrice !== null && tabela > 0 ? +(finalPrice - tabela).toFixed(2) : null;

    const tags: Tag[] = [];

    if (finalPrice !== null && tabela > 0 && tabela > finalPrice) {
      tags.push("tabela_acima_ml");
    }
    if (originalPrice && tabela > 0 && tabela > originalPrice) {
      tags.push("tabela_acima_original");
    }
    // Recusado por pouco: faltou até R$ 100 para o preço proposto alcançar
    // a tabela. Vale um segundo olhar antes de deixar a campanha passar.
    if (!aprovado && folga !== null && folga < 0 && Math.abs(folga) <= 100) {
      tags.push("quase");
    }
    // Aprovado com sobra: dava para descontar mais e a margem ainda fecharia.
    if (aprovado && folga !== null && folga > 0) {
      tags.push("folga");
    }

    linhas.push({
      id: `${nomeArquivo}#${i}`,
      linha: i,
      arquivo: nomeArquivo,
      mlb: rawMlb,
      sku: rawSku,
      titulo: tituloColIndex !== -1
        ? extractText(row.getCell(tituloColIndex).value).trim()
        : "",
      campanha: localCampanha,
      tipoAnuncio,
      tipoCampanha,
      precoOriginal: originalPrice,
      precoPropostoML: finalPrice,
      precoOferta: precoFinalAplicado,
      precoTabela: tabela,
      precoPiso: tabela > 0 ? precoPiso(tabela) : 0,
      // Só faz sentido onde existe preço nosso para descontar.
      precoComExtra:
        tabela > 0 && descontoExtra > 0 && tipoCampanha === "Sem Redução"
          ? precoComExtra(tabela, descontoExtra)
          : null,
      reducaoTarifa: sfStr || "Não",
      desconto:
        originalPrice && originalPrice > 0
          ? ((originalPrice - precoFinalAplicado) / originalPrice) * 100
          : null,
      folga,
      decisao: result.action,
      aprovado,
      recalculado: result.newPrice !== null,
      motivo: result.pendencia || "",
      tags,
    });
  }

  // Edição cirúrgica: mexe só nas células decididas, preservando fórmulas,
  // formatação e as demais abas do arquivo original do canal.
  const bufferSaida = await surgicallyEditExcel(buffer, targetWorksheet.name, xmlUpdates);

  return {
    arquivo: nomeArquivo,
    campanha: localCampanha,
    buffer: bufferSaida,
    linhas,
    itensRelatorio,
  };
}
