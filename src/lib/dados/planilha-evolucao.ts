import "server-only";
import ExcelJS from "exceljs";
import type { SemanaAnuncio } from "./evolucao-anuncio";

/**
 * A evolução semanal em Excel, com as semanas como blocos de colunas.
 *
 * ── Por que pivotado ──
 *
 * O CSV plano trazia uma linha por anúncio POR semana. Para responder
 * "esse anúncio caiu?" era preciso caçar seis linhas espalhadas e
 * compará-las de cabeça. Com 464 anúncios e seis semanas, são 2.784
 * linhas para ler de olho.
 *
 * Aqui cada anúncio é UMA linha, e a semana anda para o lado. A queda
 * aparece lendo da esquerda para a direita, que é como se lê.
 *
 * ── O cabeçalho tem duas alturas ──
 *
 *   ┌─────────────────┬──────── Semana 34 ───────┬──────── Semana 35 ───────┐
 *   │ SKU  MLB  Conta │ Visitas  Vendas  Receita │ Visitas  Vendas  Receita │
 *
 * A primeira linha é a semana, mesclada sobre o bloco; a segunda são as
 * métricas, repetidas embaixo de cada semana.
 *
 * ── O que NÃO se repete por semana ──
 *
 * A tarifa de tabela vem do catálogo e é a de hoje — o mesmo número em
 * todas as semanas. Repeti-la seis vezes daria a impressão de que ela
 * variou. Fica no bloco de identificação, uma vez só.
 *
 * ── Célula vazia ──
 *
 * Vazio é vazio, nunca zero. Uma semana sem visitas informadas e uma
 * semana com zero visita são fatos diferentes, e escrever 0 nas duas
 * apagaria a diferença justo onde ela decide se o anúncio morreu ou se
 * o dado não chegou.
 */

type Metrica = {
  nome: string;
  largura: number;
  formato: string;
  valor: (l: SemanaAnuncio) => number | null;
};

/*
 * O formato de porcentagem do Excel multiplicaria por cem: os valores já
 * vêm em pontos percentuais (0,88 significa 0,88%), então a conversão
 * viraria 88%. Daí o sufixo literal.
 */
const PCT = '0.00"%"';
const DIN = "#,##0.00";
const INT = "#,##0";

/*
 * Onde a semana existe no relatório, zero é zero — e vai escrito.
 *
 * A primeira versão trocava 0 por vazio nessas quatro. O resultado
 * mentia dos dois lados: um anúncio com 180 visitas e nenhuma venda saía
 * com "Vendas" em branco e "Conv. 0,00%" ao lado, dizendo ao mesmo tempo
 * que não houve dado e que houve dado igual a nada.
 *
 * O banco confirma que a distinção é real e está preservada: nenhuma das
 * 2.361 linhas semanais tem visitas ou vendas nulas, e 352 têm zero
 * visita de verdade. Vazio aqui só acontece quando a semana inteira
 * falta — o anúncio não estava no relatório daquela semana.
 *
 * Preço e Retido continuam podendo ser vazios: dependem de pedido
 * casado e de o canal ter informado a comissão.
 */
const METRICAS: Metrica[] = [
  { nome: "Visitas", largura: 9, formato: INT, valor: (l) => l.visitas },
  { nome: "Vendas", largura: 8, formato: INT, valor: (l) => l.vendas },
  { nome: "Unidades", largura: 9, formato: INT, valor: (l) => l.unidades },
  { nome: "Conv. %", largura: 8, formato: PCT, valor: (l) => l.conversao },
  { nome: "Receita", largura: 12, formato: DIN, valor: (l) => l.receita },
  { nome: "Preço", largura: 11, formato: DIN, valor: (l) => l.precoPraticado },
  { nome: "Retido %", largura: 9, formato: PCT, valor: (l) => l.tarifaCobrada },
  { nome: "Retido R$", largura: 11, formato: DIN, valor: (l) => l.comissaoReais },
];

const IDENT = [
  { nome: "SKU", largura: 14 },
  { nome: "MLB", largura: 16 },
  { nome: "Título", largura: 44 },
  { nome: "Tipo", largura: 11 },
  { nome: "Conta", largura: 20 },
  { nome: "Tarifa tabela %", largura: 14 },
];

const ESCURO = "FF1F2937";
const CLARO = "FFF3F4F6";
const ZEBRA = "FFFAFAFA";

function rotulo(inicio: string, fim: string, semanaIso: number): string {
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return `Semana ${semanaIso}  ·  ${dm(inicio)} a ${dm(fim)}`;
}

export async function montarPlanilhaEvolucao(
  linhas: SemanaAnuncio[],
  semanas: string[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma";

  const ws = wb.addWorksheet("Evolução", {
    // Congela o bloco de identificação e as duas linhas de cabeçalho: a
    // semana 40 fica ilegível se o SKU já saiu da tela à esquerda.
    views: [{ state: "frozen", xSplit: IDENT.length, ySplit: 2 }],
  });

  /* ── Agrupa: uma linha por anúncio, um bloco de colunas por semana ── */

  type Agrupado = {
    ident: SemanaAnuncio;
    porSemana: Map<string, SemanaAnuncio>;
    receita: number;
  };
  const porMlb = new Map<string, Agrupado>();

  for (const l of linhas) {
    const at =
      porMlb.get(l.mlb) ?? { ident: l, porSemana: new Map(), receita: 0 };
    at.porSemana.set(l.inicio, l);
    at.receita += l.receita;
    // A identificação vem da semana mais recente: título e tipo mudam, e
    // o que interessa é como o anúncio está agora.
    if (l.inicio >= at.ident.inicio) at.ident = l;
    porMlb.set(l.mlb, at);
  }

  // Maior faturamento primeiro: quem abre o arquivo quer ver o que pesa.
  const anuncios = [...porMlb.values()].sort((a, b) => b.receita - a.receita);

  /* ── Cabeçalho de duas alturas ── */

  const l1 = ws.getRow(1);
  const l2 = ws.getRow(2);

  IDENT.forEach((c, i) => {
    ws.mergeCells(1, i + 1, 2, i + 1);
    const cel = l1.getCell(i + 1);
    cel.value = c.nome;
    cel.alignment = { vertical: "middle" };
    ws.getColumn(i + 1).width = c.largura;
  });

  semanas.forEach((inicio, s) => {
    const base = IDENT.length + s * METRICAS.length + 1;
    const amostra = linhas.find((l) => l.inicio === inicio);

    ws.mergeCells(1, base, 1, base + METRICAS.length - 1);
    const topo = l1.getCell(base);
    topo.value = amostra ? rotulo(inicio, amostra.fim, amostra.semanaIso) : inicio;
    topo.alignment = { horizontal: "center", vertical: "middle" };

    METRICAS.forEach((m, i) => {
      const cel = l2.getCell(base + i);
      cel.value = m.nome;
      cel.alignment = { horizontal: "right" };
      ws.getColumn(base + i).width = m.largura;
    });
  });

  for (const linha of [l1, l2]) {
    linha.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    linha.eachCell({ includeEmpty: false }, (cel) => {
      cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ESCURO } };
      cel.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
    });
  }
  l1.height = 22;
  l2.height = 18;

  /* ── Corpo ── */

  anuncios.forEach((a, idx) => {
    const r = ws.getRow(idx + 3);
    const id = a.ident;

    r.getCell(1).value = id.sku || null;
    r.getCell(2).value = id.mlb;
    r.getCell(3).value = id.titulo;
    r.getCell(4).value = id.tipo;
    r.getCell(5).value = id.conta;
    if (id.tarifaTabela != null) r.getCell(6).value = id.tarifaTabela;
    r.getCell(6).numFmt = PCT;

    semanas.forEach((inicio, s) => {
      const base = IDENT.length + s * METRICAS.length + 1;
      const l = a.porSemana.get(inicio);

      METRICAS.forEach((m, i) => {
        const cel = r.getCell(base + i);
        // Sem a linha da semana não há o que escrever: ou o anúncio não
        // existia, ou não houve movimento registrado. Zero seria mentira.
        const v = l ? m.valor(l) : null;
        if (v != null) cel.value = v;
        cel.numFmt = m.formato;
      });
    });

    r.font = { size: 10 };
    // Zebra por linha: com 50 colunas, o olho perde a linha na volta.
    if (idx % 2 === 1) {
      const ultima = IDENT.length + semanas.length * METRICAS.length;
      for (let c = 1; c <= ultima; c++) {
        r.getCell(c).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: ZEBRA },
        };
      }
    }
  });

  // Bordas verticais separando um bloco de semana do seguinte: sem elas,
  // 48 colunas de número viram uma parede só.
  const ultimaLinha = anuncios.length + 2;
  semanas.forEach((_, s) => {
    const base = IDENT.length + s * METRICAS.length + 1;
    for (let r = 1; r <= ultimaLinha; r++) {
      const cel = ws.getRow(r).getCell(base);
      cel.border = {
        ...cel.border,
        left: { style: "thin", color: { argb: "FFBFC4CB" } },
      };
    }
  });

  ws.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2, column: IDENT.length },
  };

  /* ── A folha que diz o que os números são ── */

  const leia = wb.addWorksheet("Leia-me");
  leia.getColumn(1).width = 100;

  const texto: [string, boolean][] = [
    ["Evolução semanal por anúncio", true],
    ["", false],
    ["Uma linha por anúncio. As semanas andam para o lado, em blocos.", false],
    ["Ordenado pelo faturamento do período, do maior para o menor.", false],
    ["", false],
    ["Célula vazia", true],
    ["Vazio significa sem informação, nunca zero — e zero significa zero.", false],
    ["", false],
    ["Nas colunas de Visitas, Vendas, Unidades e Receita, a célula só fica vazia", false],
    ["quando o anúncio não apareceu no relatório daquela semana. Se ele apareceu e", false],
    ["não teve movimento, vem 0 escrito: um anúncio com 180 visitas e nenhuma venda", false],
    ["é um fato, e apagá-lo esconderia justamente o anúncio que precisa de atenção.", false],
    ["", false],
    ["Preço e Retido podem ficar vazios mesmo com a semana presente: dependem de", false],
    ["pedido casado e de o canal ter informado a comissão.", false],
    ["", false],
    ["Tarifa tabela %", true],
    ["A alíquota do catálogo — 11,5% no clássico, 16,5% no premium. É a de hoje e", false],
    ["não varia por semana, por isso aparece uma vez só, no bloco da esquerda.", false],
    ["", false],
    ["Retido % e Retido R$", true],
    ["O que o canal ficou. Onde ele informa a comissão, é o número dele. Onde não", false],
    ["informa, vem de: total − frete do vendedor − juros − valor a receber.", false],
    ["", false],
    ["Essa reconstrução acerta ~97% dentro da faixa de 1% a 15% do total, medida", false],
    ["contra os pedidos com comissão informada. Fora dessa faixa a conta captura", false],
    ["outra coisa — frete, tipicamente — e a célula fica vazia em vez de trazer um", false],
    ["número inventado.", false],
    ["", false],
    ["Retido costuma ficar abaixo da Tarifa tabela: campanha com redução de tarifa", false],
    ["cobra menos, e a diferença entre as duas é o que a campanha economizou.", false],
    ["", false],
    ["Vendas x Unidades", true],
    ["Vendas vem do relatório de desempenho do canal. Unidades vem dos seus", false],
    ["pedidos. Divergem quando um pedido leva mais de uma unidade do anúncio — ou", false],
    ["quando os pedidos daquela semana ainda não foram importados. Vendas com um", false],
    ["número e Unidades em 0 é sinal do segundo caso.", false],
  ];

  texto.forEach(([t, negrito], i) => {
    const cel = leia.getCell(i + 1, 1);
    cel.value = t;
    cel.font = negrito
      ? { bold: true, size: 11 }
      : { size: 10, color: { argb: "FF374151" } };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
