/* eslint-disable */
import ExcelJS from "exceljs";
import { precoPiso, precoComExtra, processItem, norm, FormulaBaseData } from "./motor-promocoes";
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
export type Tag =
  | "tabela_acima_ml"
  | "tabela_acima_original"
  | "quase"
  | "folga"
  /** Oferta já fechada com o canal: analisada, mas não escrita. */
  | "participando"
  /** A célula de ação não oferece escolha: não há o que escrever nela. */
  | "sem_acao_disponivel";

/**
 * Estados em que a oferta JÁ ESTÁ FECHADA com o canal.
 *
 * Regra do Eduardo (16/09): só se altera a linha que ainda está em aberto —
 * aquela cuja coluna de ação oferece "Participar" ou "Aplicar proposta".
 * Anúncio que já consta como aceito ou negociado não é tocado.
 *
 * Por que isso importa: reescrever a ação ou o preço de uma oferta já
 * aceita troca um acordo que está no ar, e no preço em que foi aprovado,
 * por outro que ainda precisaria passar pelo canal. O anúncio sai da
 * campanha enquanto isso, e ninguém percebe até a venda cair.
 *
 * A lista é de TERMOS, comparados sem acento e sem caixa, por conter —
 * o canal escreve "Participando", "Aceita", "Oferta aceita", "Negociado
 * com o vendedor", e a exportação muda o rótulo de tempos em tempos. Casar
 * por igualdade exata deixaria passar a variação seguinte.
 */
const STATUS_FECHADO = [
  "participando",
  "aceit", // aceito, aceita, aceite
  "negociad", // negociado, negociada
  "aprovad", // aprovado, aprovada
  "vigente",
  "ativa",
  "ativo",
  "em campanha",
  "confirmad", // confirmado, confirmada
];

/**
 * Prefixos que NEGAM o termo seguinte.
 *
 * "Não participando" contém "participando" e seria lido como oferta
 * fechada — quando é exatamente o contrário: o anúncio está fora da
 * campanha e é justamente o que se quer processar. Casar por substring
 * sem olhar a negação inverte a regra no único caso em que ela mais
 * importa.
 */
const NEGACOES = ["nao ", "sem ", "fora "];

/**
 * A linha já está fechada com o canal?
 *
 * Status vazio ou desconhecido devolve `false` — a linha segue para
 * análise. É a escolha conservadora na direção certa: exportação antiga
 * não trazia a coluna de status, e bloquear por ausência faria o sistema
 * parar de processar planilhas que sempre funcionaram.
 */
export function ofertaJaFechada(status: string): boolean {
  const s = norm(status);
  if (!s) return false;
  // `norm` já tirou os acentos: "não" chega aqui como "nao".
  if (NEGACOES.some((n) => s.startsWith(n))) return false;
  return STATUS_FECHADO.some((termo) => s.includes(termo));
}

/**
 * A célula de ação aceita uma escolha positiva?
 *
 * Quando a validação da célula existe, ela lista o que o canal aceita ali.
 * Se nenhuma das opções for uma ação de entrar na campanha, escrever
 * naquela célula produz um valor que o canal recusa no retorno — e a
 * planilha inteira volta com erro por causa de uma linha.
 *
 * Sem validação nenhuma, devolve `true`: é o caso das exportações antigas,
 * que não traziam a lista e sempre foram processadas.
 */
export function acaoEditavel(opcoes: string[] | null): boolean {
  if (!opcoes || !opcoes.length) return true;
  return opcoes.some((o) => {
    const n = norm(o);
    return n.startsWith("participar") || n.startsWith("aplicar");
  });
}

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
  tipoCampanha: "Com Redução" | "Sem Redução" | "Campanha nossa";
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
  /*
   * O status da linha na campanha: "Participando" ou "Nova proposta".
   *
   * "status" sozinho não entra em `exatos`: a planilha tem outras colunas
   * cujo rótulo começa assim, e casar a errada faria o sistema pular linhas
   * que deveria processar. Coluna ausente é tolerada — exportações antigas
   * não a traziam, e aí todas as linhas são tratadas como antes.
   */
  const statusColIndex = findCol(
    ["status da promoção", "status da promocao", "promotion_status"],
    ["status da promo"]
  );

  /*
   * ── Campanha nossa ou do canal? ────────────────────────────────────
   *
   * Muda o que é ajustável, e por isso não pode ser adivinhado errado.
   *
   * Nas campanhas do CANAL o preço vem proposto e a decisão é binária. Nas
   * que NÓS criamos no painel do Mercado Livre, a porcentagem é nossa de
   * escolher e o preço final é consequência dela — então o sistema pode
   * mexer para cima também, não só para baixo.
   *
   * O reconhecimento é pelos nomes TÉCNICOS da primeira linha, que o canal
   * escreve em inglês em qualquer idioma de conta. Toda planilha proposta
   * pelo canal traz `PROMO_TYPE` e `CANDIDATE_ID` — são o identificador da
   * proposta dele. A nossa não tem nenhum dos dois, e usa `PROMOTION_NAME`
   * e `DATE_VALIDITY` onde as dele usam `PROMO_NAME` e `DATE`.
   *
   * `DISCOUNT_PERCENTAGE` sozinho NÃO serve de marca: "O melhor de todos os
   * dias" também o tem, e é campanha do canal.
   *
   * Assim continua valendo subir planilhas de tipos diferentes juntas, cada
   * uma lida com a sua lógica — que é como o sistema já funcionava.
   */
  const tecnicos = new Set<string>();
  for (const v of (targetWorksheet.getRow(1).values as any[]) ?? []) {
    const nome = extractText(v).trim().toUpperCase();
    if (nome) tecnicos.add(nome);
  }

  const descontoPctColIndex = (() => {
    const row1 = (targetWorksheet!.getRow(1).values as any[]) ?? [];
    for (let c = 1; c < row1.length; c++) {
      if (extractText(row1[c]).trim().toUpperCase() === "DISCOUNT_PERCENTAGE") return c;
    }
    return findCol(["discount_percentage"], []);
  })();

  const campanhaPropria =
    (tecnicos.has("PROMOTION_NAME") || tecnicos.has("DATE_VALIDITY")) &&
    !tecnicos.has("PROMO_TYPE") &&
    !tecnicos.has("CANDIDATE_ID") &&
    !tecnicos.has("SALE_FEE") &&
    descontoPctColIndex !== -1 &&
    originalPriceColIndex !== -1;

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

    /*
     * As opções que a célula de ação oferece NESTA linha.
     *
     * Guardadas para além dos rótulos: é a lista que diz se a linha ainda
     * aceita escolha. Uma oferta já fechada costuma vir sem validação ou
     * com opções que não incluem entrar na campanha.
     */
    let opcoesAcao: string[] | null = null;
    const rowValidation = row.getCell(actionColIndex).dataValidation;
    if (rowValidation?.formulae?.[0]) {
      const options = String(rowValidation.formulae[0]).replace(/['"]/g, "").split(",");
      opcoesAcao = options.map((o) => o.trim()).filter(Boolean);
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
      descontoExtra,
      undefined,
      campanhaPropria
    );

    /*
     * SÓ SE ESCREVE NA LINHA QUE AINDA ESTÁ EM ABERTO.
     *
     * Duas portas, e as duas precisam estar abertas:
     *
     *   1. O STATUS não pode indicar oferta fechada. Antes o guarda era
     *      só a igualdade com "participando", o que deixava passar
     *      "Aceita", "Negociado" e as variações que o canal usa.
     *   2. A CÉLULA DE AÇÃO precisa oferecer entrar na campanha. Se a
     *      validação lista outra coisa, escrever ali produz um valor que
     *      o canal recusa no retorno — e a planilha inteira volta com
     *      erro por causa de uma linha.
     *
     * Reescrever a ação ou o preço de uma oferta já aceita troca um acordo
     * que está no ar, e no preço em que foi aprovado, por outro que ainda
     * precisaria passar pelo canal. O anúncio sai da campanha enquanto
     * isso, e ninguém percebe até a venda cair.
     *
     * A linha continua sendo ANALISADA e aparece na lista com o que a
     * tabela diria. Só não é escrita — assim dá para ver quando uma oferta
     * em vigor ficou abaixo da margem, sem que o sistema a derrube
     * sozinho.
     */
    const statusPromo =
      statusColIndex !== -1
        ? extractText(row.getCell(statusColIndex).value).trim()
        : "";
    const jaFechada = ofertaJaFechada(statusPromo);
    const podeEscolher = acaoEditavel(opcoesAcao);
    const jaParticipando = jaFechada || !podeEscolher;
    const acaoAtual = extractText(row.getCell(actionColIndex).value).trim();

    if (!jaParticipando) {
      xmlUpdates.push({
        rowIndex: i,
        colLetter: getColLetter(actionColIndex),
        value: result.action,
      });

      /*
       * Na campanha NOSSA quem manda é a porcentagem: o canal recalcula o
       * preço final a partir dela, então escrever só o preço faria a
       * planilha voltar com o valor antigo, ou recusada por "não é possível
       * alterar o preço final". Os dois vão juntos — a porcentagem porque é
       * a alavanca, e o preço para a planilha mostrar o mesmo número que o
       * canal vai calcular.
       */
      if (campanhaPropria && result.newPercentage != null) {
        xmlUpdates.push({
          rowIndex: i,
          colLetter: getColLetter(descontoPctColIndex),
          value: result.newPercentage,
        });
      }

      // Só o caso sem redução de tarifa recalcula o preço final.
      if (result.newPrice !== null) {
        xmlUpdates.push({
          rowIndex: i,
          colLetter: getColLetter(finalPriceColIndex),
          value: result.newPrice,
        });
      }
    }

    const tabela = result.tabelaCalculada || 0;

    /*
     * O preço que de fato vai para o canal.
     *
     * Estava calculado vinte linhas abaixo, depois do relatório já ter
     * sido montado — e o relatório usava `finalPrice`, que é a PROPOSTA
     * lida da planilha de entrada, antes de qualquer decisão. Nas
     * campanhas sem redução de tarifa os dois números são diferentes: a
     * proposta é o desconto que o canal pede, e o aplicado é o preço de
     * tabela que a lógica escreve por cima.
     *
     * O resultado era uma linha dizendo "Aprovado" ao lado de um preço
     * abaixo do mínimo — um preço que nunca foi enviado a lugar nenhum.
     * Onde o canal já reduziu a tarifa não há preço novo, e o aplicado
     * cai na própria proposta, que é o certo.
     */
    const precoFinalAplicado =
      !jaParticipando && result.newPrice !== null
        ? result.newPrice
        : finalPrice || 0;

    const diferencaRS = tabela > 0 ? precoFinalAplicado - tabela : null;
    const diferencaPerc =
      tabela > 0 ? (precoFinalAplicado - tabela) / tabela : null;

    // Compara com o rótulo positivo DESTA linha, não com uma lista fixa.
    // Quem já participa continua dentro: a planilha volta com a ação
    // original, então conta como aprovado.
    const aprovado = jaParticipando ? true : result.action === acaoPositiva;
    const tipoCampanha: "Com Redução" | "Sem Redução" | "Campanha nossa" =
      campanhaPropria
        ? "Campanha nossa"
        : saleFee !== null && saleFee > 0
          ? "Com Redução"
          : "Sem Redução";

    itensRelatorio.push({
      campanha: localCampanha,
      mlb: rawMlb,
      sku: rawSku,
      tipoCampanha,
      precoOriginal: originalPrice,
      propostaML: finalPrice,
      precoAplicado: precoFinalAplicado,
      tarifaReduzida: saleFee,
      precoTabela: tabela,
      diferencaRS,
      diferencaPerc,
      status: jaParticipando ? "Mantido" : aprovado ? "Aprovado" : "Reprovado",
      motivo: jaFechada
        ? `Oferta já fechada com o canal (${statusPromo}) — linha não alterada`
        : !podeEscolher
          ? "A célula de ação não oferece entrar na campanha — linha não alterada"
          : result.pendencia || "OK",
    });

    // Folga = quanto o preço proposto pelo canal está acima do preço de
    // tabela. Positiva sobra margem, negativa a margem não fecha.
    const folga =
      finalPrice !== null && tabela > 0 ? +(finalPrice - tabela).toFixed(2) : null;

    const tags: Tag[] = [];
    // Duas razões distintas para não escrever, duas tags: a leitura da
    // lista de revisão precisa dizer QUAL foi.
    if (jaFechada) tags.push("participando");
    if (!podeEscolher) tags.push("sem_acao_disponivel");

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
      decisao: jaParticipando ? acaoAtual || acaoPositiva : result.action,
      aprovado,
      recalculado: !jaParticipando && result.newPrice !== null,
      motivo: jaFechada
        ? `Oferta já fechada com o canal (${statusPromo}) — linha não alterada`
        : !podeEscolher
          ? "A célula de ação não oferece entrar na campanha — linha não alterada"
          : result.pendencia || "",
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
