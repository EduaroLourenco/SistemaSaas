import ExcelJS from "exceljs";
import { ROTULO_ACAO, type LinhaOportunidade, type Referencias } from "@/lib/dados/trafego-oportunidades";

/**
 * "O que fazer" do tráfego pago, em planilha.
 *
 * ── Por que a planilha e não só a tela ──
 *
 * A decisão de verba não é tomada na tela: é levada para quem aprova, e
 * cruzada com o que já foi gasto no mês. Para isso o arquivo precisa de
 * cada número numa coluna própria, ordenável e somável.
 *
 * ── Os cortes vão no cabeçalho ──
 *
 * A classificação depende da MEDIANA do recorte, e a mediana muda com o
 * filtro. Um arquivo salvo sem os cortes escritos é um arquivo que ninguém
 * pode reconferir três semanas depois: "entrar no ads" deixaria de ter
 * referência. Então o período, o filtro aplicado e os três cortes ficam nas
 * primeiras linhas.
 *
 * ── Ausência fica VAZIA, não zero ──
 *
 * Conversão de anúncio sem visita medida, ACOS de anúncio sem mídia: zero
 * diria "converte 0%" e "gasta 0 por venda", e as duas afirmações são
 * falsas. Vazio é o que permite ordenar e tirar média no Excel sem contar
 * quem não tem o dado. Mesma regra da exportação do "Por que caiu".
 */

type Contexto = {
  janela: string;
  recorte: string;
  /** O filtro da tela, já em texto. Vazio quando não há. */
  filtro: string;
};

const moeda = '"R$" #,##0.00';
const porcento = '0.0"%"';
const dataBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso);

type Col = {
  titulo: string;
  largura: number;
  valor: (l: LinhaOportunidade) => string | number | null;
  fmt?: string;
};

const COLUNAS: Col[] = [
  { titulo: "O que fazer", largura: 20, valor: (l) => ROTULO_ACAO[l.acao] },
  { titulo: "Por quê", largura: 56, valor: (l) => l.motivo || null },
  { titulo: "SKU", largura: 14, valor: (l) => l.sku || null },
  { titulo: "Código", largura: 16, valor: (l) => l.mlb },
  { titulo: "Produto", largura: 44, valor: (l) => l.titulo || null },
  { titulo: "Conta", largura: 26, valor: (l) => l.conta },
  { titulo: "Tipo de anúncio", largura: 14, valor: (l) => l.tipo },
  /* Catálogo entra porque muda a leitura de "gastou e não vendeu": a venda
     pode ter saído pelo anúncio vencedor. */
  { titulo: "Catálogo", largura: 14, valor: (l) => l.catalogo || null },
  { titulo: "Visitas", largura: 10, valor: (l) => l.visitas, fmt: "#,##0" },
  { titulo: "Conversão", largura: 11, valor: (l) => l.conversao, fmt: porcento },
  { titulo: "Unidades", largura: 10, valor: (l) => l.unidades, fmt: "#,##0" },
  { titulo: "Faturou", largura: 14, valor: (l) => l.receitaReal || null, fmt: moeda },
  { titulo: "Margem", largura: 11, valor: (l) => l.margemPct, fmt: porcento },
  { titulo: "Margem R$", largura: 14, valor: (l) => l.margem, fmt: moeda },
  { titulo: "Investido", largura: 13, valor: (l) => l.investimento || null, fmt: moeda },
  { titulo: "Receita ads", largura: 14, valor: (l) => l.receitaAtribuida || null, fmt: moeda },
  { titulo: "ACOS", largura: 10, valor: (l) => l.acos, fmt: porcento },
  { titulo: "ROAS", largura: 9, valor: (l) => l.roas, fmt: "#,##0.00" },
  { titulo: "Sobra após mídia", largura: 16, valor: (l) => l.sobraAposMidia, fmt: moeda },
  { titulo: "Estoque", largura: 10, valor: (l) => l.estoque, fmt: "#,##0" },
];

/** Linha do cabeçalho onde começa a tabela. Acima dela, o contexto. */
const LINHA_TITULOS = 6;

export function planilhaOportunidades(
  linhas: LinhaOportunidade[],
  referencias: Referencias | null,
  contexto: Contexto
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gerizo";
  const ws = wb.addWorksheet("O que fazer", {
    views: [{ state: "frozen", xSplit: 2, ySplit: LINHA_TITULOS, showGridLines: false }],
  });
  ws.columns = COLUNAS.map((c) => ({ width: c.largura }));

  const cortes = referencias
    ? [
        `conversão mediana ${referencias.conversaoMediana != null ? referencias.conversaoMediana.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "sem base"}`,
        `já bem visto acima de ${referencias.visitasTeto ?? "—"} visitas`,
        `piso de ${referencias.visitasMinimas} visitas para a taxa valer`,
        `${referencias.comVisitaSuficiente} anúncios acima do piso`,
      ].join(" · ")
    : "sem referências de corte nesta janela";

  const notas = [
    "Tráfego pago · O que fazer",
    `Janela do relatório: ${dataBr(contexto.janela.split("|")[0] ?? "")} a ${dataBr(contexto.janela.split("|")[1] ?? "")} · ${contexto.recorte} · ${linhas.length} anúncios`,
    contexto.filtro ? `Filtro aplicado: ${contexto.filtro}` : "Sem filtro: todos os anúncios da janela",
    `Cortes da classificação: ${cortes}`,
    "Célula vazia é ausência de dado, não zero. Catálogo preenchido: a venda pode sair pelo anúncio vencedor.",
  ];
  notas.forEach((texto, i) => {
    ws.mergeCells(i + 1, 1, i + 1, COLUNAS.length);
    const c = ws.getCell(i + 1, 1);
    c.value = texto;
    c.font = { name: "Aptos", size: i === 0 ? 17 : 10, bold: i === 0, color: { argb: i === 0 ? "FF173D35" : "FF52615D" } };
    c.alignment = { vertical: "middle", wrapText: true };
    ws.getRow(i + 1).height = i === 0 ? 30 : 18;
  });

  ws.getRow(LINHA_TITULOS).values = COLUNAS.map((c) => c.titulo);
  const cabecalho = ws.getRow(LINHA_TITULOS);
  cabecalho.height = 28;
  for (let c = 1; c <= COLUNAS.length; c++) {
    const cell = cabecalho.getCell(c);
    cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FF173D35" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F1ED" } };
    cell.alignment = { vertical: "middle", horizontal: c <= 2 ? "left" : "center", wrapText: true };
  }

  for (const l of linhas) {
    const row = ws.addRow(COLUNAS.map((c) => c.valor(l)));
    row.height = Math.max(26, Math.ceil((l.motivo?.length ?? 0) / 52) * 13 + 10);
    row.eachCell({ includeEmpty: true }, (cell, i) => {
      const col = COLUNAS[i - 1];
      cell.font = { name: "Aptos", size: 10, color: { argb: "FF233B33" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.number % 2 ? "FFFFFFFF" : "FFF4F7F5" } };
      cell.alignment = {
        vertical: "middle",
        wrapText: i <= 2 || i === 5,
        horizontal: typeof cell.value === "number" ? "right" : "left",
      };
      if (col?.fmt) cell.numFmt = col.fmt;
      /* Só a primeira coluna ganha peso: é por ela que se lê a lista, e
         negritar a linha inteira tira o destaque de todas. */
      if (i === 1) cell.font = { ...cell.font, bold: true };
    });
  }

  ws.autoFilter = {
    from: { row: LINHA_TITULOS, column: 1 },
    to: { row: Math.max(LINHA_TITULOS, ws.rowCount), column: COLUNAS.length },
  };
  return wb;
}
