import "server-only";
import ExcelJS from "exceljs";
import type { DadosAnaliseSku, LinhaSku } from "./analise-sku";

/**
 * A análise de SKU em Excel, no recorte que a tela está mostrando.
 *
 * ── Duas abas, porque são duas perguntas ──
 *
 * "Por mês" responde quando o produto vendeu; "Por canal" responde onde.
 * Numa aba só, as colunas de mês e de canal ficariam lado a lado somando
 * a mesma receita duas vezes — e alguém somaria a linha inteira.
 *
 * ── Receita e unidades juntas, não alternadas ──
 *
 * Na tela um botão troca a métrica, porque lá o espaço é a limitação.
 * Aqui as duas cabem: cada período traz as duas colunas. Quem abre a
 * planilha para trabalhar precisa das duas ao mesmo tempo — é comparando
 * que se descobre o SKU que lidera em unidades e some em receita.
 *
 * ── Vazio é vazio ──
 *
 * Célula em branco significa que o SKU não vendeu naquele mês ou canal.
 * Zero escrito diria a mesma coisa e ocuparia a tabela inteira: com 554
 * SKUs e 10 canais, a maioria das células é ausência.
 */

const DIN = "#,##0.00";
const INT = "#,##0";
const PCT = '0.00"%"';

const ESCURO = "FF1F2937";
const ZEBRA = "FFFAFAFA";

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

const rotuloMes = (m: string) =>
  `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

const br = (iso: string) =>
  `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Colunas de identificação, iguais nas duas abas. */
const IDENT = [
  { nome: "Curva", largura: 7 },
  { nome: "SKU", largura: 16 },
  { nome: "Título", largura: 44 },
  { nome: "Receita total", largura: 14, formato: DIN },
  { nome: "Unidades", largura: 10, formato: INT },
  { nome: "Preço médio", largura: 12, formato: DIN },
  { nome: "Participação", largura: 12, formato: PCT },
  { nome: "Acumulado", largura: 11, formato: PCT },
];

function montarAba(
  wb: ExcelJS.Workbook,
  nome: string,
  linhas: LinhaSku[],
  colunas: { chave: string; rotulo: string }[],
  celulaDe: (l: LinhaSku, chave: string) => { receita: number; unidades: number } | undefined
) {
  const ws = wb.addWorksheet(nome, {
    views: [{ state: "frozen", xSplit: IDENT.length, ySplit: 2 }],
  });

  const l1 = ws.getRow(1);
  const l2 = ws.getRow(2);

  IDENT.forEach((c, i) => {
    ws.mergeCells(1, i + 1, 2, i + 1);
    l1.getCell(i + 1).value = c.nome;
    l1.getCell(i + 1).alignment = { vertical: "middle", wrapText: true };
    ws.getColumn(i + 1).width = c.largura;
  });

  colunas.forEach((c, s) => {
    const base = IDENT.length + s * 2 + 1;
    ws.mergeCells(1, base, 1, base + 1);
    const topo = l1.getCell(base);
    topo.value = c.rotulo;
    topo.alignment = { horizontal: "center", vertical: "middle" };

    l2.getCell(base).value = "Receita";
    l2.getCell(base + 1).value = "Un.";
    l2.getCell(base).alignment = { horizontal: "right" };
    l2.getCell(base + 1).alignment = { horizontal: "right" };
    ws.getColumn(base).width = 13;
    ws.getColumn(base + 1).width = 7;
  });

  for (const linha of [l1, l2]) {
    linha.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    linha.eachCell({ includeEmpty: false }, (cel) => {
      cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ESCURO } };
      cel.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
    });
  }
  l1.height = 22;
  l2.height = 16;

  linhas.forEach((l, idx) => {
    const r = ws.getRow(idx + 3);
    r.getCell(1).value = l.curva;
    r.getCell(2).value = l.sku;
    r.getCell(3).value = l.titulo || null;
    r.getCell(4).value = l.receita;
    r.getCell(5).value = l.unidades;
    if (l.precoMedio != null) r.getCell(6).value = l.precoMedio;
    r.getCell(7).value = l.participacao;
    r.getCell(8).value = l.acumulado;
    IDENT.forEach((c, i) => {
      if (c.formato) r.getCell(i + 1).numFmt = c.formato;
    });

    colunas.forEach((c, s) => {
      const base = IDENT.length + s * 2 + 1;
      const cel = celulaDe(l, c.chave);
      // Sem venda no mês ou canal, a célula fica vazia. Zero diria o
      // mesmo e cobriria a planilha: a maioria das combinações é ausência.
      if (cel && cel.receita > 0) r.getCell(base).value = cel.receita;
      if (cel && cel.unidades > 0) r.getCell(base + 1).value = cel.unidades;
      r.getCell(base).numFmt = DIN;
      r.getCell(base + 1).numFmt = INT;
    });

    r.font = { size: 10 };
    if (idx % 2 === 1) {
      const ultima = IDENT.length + colunas.length * 2;
      for (let c = 1; c <= ultima; c++) {
        r.getCell(c).fill = {
          type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA },
        };
      }
    }
  });

  // Bordas separando um bloco do seguinte.
  const ultimaLinha = linhas.length + 2;
  colunas.forEach((_, s) => {
    const base = IDENT.length + s * 2 + 1;
    for (let r = 1; r <= ultimaLinha; r++) {
      const cel = ws.getRow(r).getCell(base);
      cel.border = { ...cel.border, left: { style: "thin", color: { argb: "FFBFC4CB" } } };
    }
  });

  ws.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2, column: IDENT.length },
  };
}

export async function montarPlanilhaSkus(
  dados: DadosAnaliseSku,
  nomeCanal: string | null
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma";

  const { linhas, meses, canais, periodo, totais, concentracao } = dados;

  montarAba(
    wb, "Por mês", linhas,
    meses.map((m) => ({ chave: m, rotulo: rotuloMes(m) })),
    (l, chave) => l.porMes[chave]
  );

  montarAba(
    wb, "Por canal", linhas,
    canais.map((c) => ({ chave: c.id, rotulo: c.nome })),
    (l, chave) => l.porCanal[chave]
  );

  /* ── A folha que diz o que este arquivo é ── */

  const leia = wb.addWorksheet("Leia-me");
  leia.getColumn(1).width = 100;

  const texto: [string, boolean][] = [
    ["Análise de SKU", true],
    ["", false],
    [`Período: ${br(periodo.inicio)} a ${br(periodo.fim)}`, false],
    [`Canal: ${nomeCanal ?? "todos"}`, false],
    [
      `${totais.skus} SKUs · ${totais.unidades} unidades · R$ ${totais.receita.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      false,
    ],
    ["", false],
    ["Duas abas, duas perguntas", true],
    ["\"Por mês\" responde quando o produto vendeu; \"Por canal\" responde onde.", false],
    ["Estão separadas porque somam a mesma receita de formas diferentes — numa", false],
    ["aba só, alguém somaria a linha inteira e contaria tudo duas vezes.", false],
    ["", false],
    ["Célula vazia", true],
    ["O SKU não vendeu naquele mês ou canal. Zero escrito diria a mesma coisa e", false],
    ["cobriria a planilha: com centenas de SKUs e dez canais, a maioria das", false],
    ["combinações é ausência.", false],
    ["", false],
    ["Curva ABC", true],
    [`A = até 80% da receita  ·  B = até 95%  ·  C = a cauda.`, false],
    ["", false],
    ["Ela é calculada DENTRO deste recorte, não fixada no cadastro do produto.", false],
    ["Exportando só um canal, a curva é a daquele canal — e o mesmo SKU pode ser", false],
    ["A num e C noutro. É essa diferença que diz o papel dele em cada lugar.", false],
    ["", false],
    [`Neste recorte, ${concentracao.metade} SKUs fazem metade da receita e ${concentracao.oitenta} fazem 80%.`, false],
    ["", false],
    ["O que NÃO está aqui", true],
    ["Margem. Este arquivo é volume e receita. Margem depende do custo cadastrado", false],
    ["por SKU e vive em Financeiro — juntar as duas deixaria metade das linhas", false],
    ["vazia por um motivo que nada tem a ver com desempenho de venda.", false],
    ["", false],
    ["Cancelamentos já estão fora: só pedido válido entra.", false],
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
