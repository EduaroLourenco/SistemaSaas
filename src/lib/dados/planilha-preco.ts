import "server-only";
import ExcelJS from "exceljs";
import type { DadosPerformancePreco, LinhaPreco } from "./performance-preco";

/**
 * Preço × volume × receita, para decidir se baixar compensa.
 *
 * ── A pergunta e o número que a responde ──
 *
 * "Baixo o preço para ganhar volume?" só se responde por RECEITA POR DIA.
 * Mais unidades a um preço menor compensa quando o produto preço × volume
 * sobe, e ele nem sempre sobe: metade das unidades a dois terços do preço
 * perde receita.
 *
 * Por isso cada faixa traz un/dia E receita/dia lado a lado, e o resumo
 * marca as duas faixas vencedoras separadamente — a de mais volume e a de
 * mais receita. Elas quase nunca são a mesma, e mostrar só uma responde
 * metade da pergunta.
 *
 * ── Duas abas, porque são dois momentos ──
 *
 * "Resumo" é uma linha por SKU: onde está hoje, onde estaria no melhor
 * preço, e quanto isso vale. É a aba de decidir.
 *
 * "Escada de preço" é uma linha por faixa: o histórico inteiro de cada
 * SKU. É a aba de conferir a decisão antes de tomá-la — quantos dias,
 * quantas unidades, se o número tem lastro.
 *
 * ── A elasticidade ──
 *
 * Variação do volume sobre variação do preço, entre o preço de agora e o
 * de melhor receita. Acima de 1 em módulo, o volume reage mais que o
 * preço e baixar tende a compensar; abaixo, não.
 *
 * Vem com sinal negativo quando se comporta como esperado — preço sobe,
 * volume desce. Sinal positivo é anomalia, e vale olhar antes de agir:
 * costuma ser campanha, ruptura de estoque ou sazonalidade.
 */

const DIN = "#,##0.00";
const INT = "#,##0";
const PCT = '0.00"%"';
const NUM2 = "0.00";

const ESCURO = "FF1F2937";
const ZEBRA = "FFFAFAFA";
const VERDE = "FFE7F5EC";
const AMARELO = "FFFFF7E0";

const r2 = (v: number) => Number(v.toFixed(2));

/** O ganho da mudança em reais por dia, ou nulo se não dá para saber. */
function ganhoReais(l: LinhaPreco): number | null {
  const atual = l.faixas.find((f) => f.atual);
  if (!l.melhorReceita || !atual) return null;
  return r2(l.melhorReceita.receitaDia - atual.receitaDia);
}

/** Onde o preço de agora está em relação à faixa de melhor receita. */
function recomendacao(l: LinhaPreco): string {
  if (!l.melhorReceita) return "sem evidência";
  const atual = l.faixas.find((f) => f.atual);
  if (!atual) return "preço fora das faixas medidas";
  if (atual.preco === l.melhorReceita.preco) return "já está no melhor";

  const diff = ((l.melhorReceita.preco - atual.preco) / atual.preco) * 100;
  if (Math.abs(diff) < 2) return "já está no melhor";
  return diff < 0 ? "testar baixar" : "testar subir";
}

export async function montarPlanilhaPreco(
  dados: DadosPerformancePreco,
  nomeCanal: string | null
): Promise<{ buffer: Buffer; skus: number; faixas: number }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma";

  // Só quem tem faixa qualificada entra: sem duas faixas comparáveis não
  // há decisão de preço a tomar, e a linha só ocuparia espaço.
  /*
   * Ordenado pelo ganho em REAIS por dia, não em porcentagem.
   *
   * 60% num SKU que faz R$ 50 por dia vale R$ 30; 20% num que faz R$
   * 3.000 vale R$ 600. A porcentagem sozinha coloca o primeiro no topo da
   * lista e faz a pessoa começar pelo teste que menos importa.
   */
  const comEvidencia = dados.linhas
    .filter((l) => l.melhorReceita)
    .sort((a, b) => (ganhoReais(b) ?? 0) - (ganhoReais(a) ?? 0));

  /* ══ Resumo ══ */

  const resumo = wb.addWorksheet("Resumo", {
    views: [{ state: "frozen", ySplit: 1, xSplit: 1 }],
  });

  const COLS_RESUMO = [
    { n: "SKU", w: 15 },
    { n: "Título", w: 34 },
    { n: "Curva", w: 7 },
    { n: "Un. no período", w: 12, f: INT },
    { n: "Receita no período", w: 15, f: DIN },
    { n: "Preço agora", w: 13, f: DIN },
    { n: "Un/dia agora", w: 11, f: NUM2 },
    { n: "Receita/dia agora", w: 15, f: DIN },
    { n: "Mais volume: preço", w: 15, f: DIN },
    { n: "Un/dia nele", w: 11, f: NUM2 },
    { n: "Mais receita: preço", w: 16, f: DIN },
    { n: "Un/dia nele", w: 11, f: NUM2 },
    { n: "Receita/dia nele", w: 15, f: DIN },
    { n: "Ganho R$/dia", w: 13, f: DIN },
    { n: "Ganho de receita/dia", w: 17, f: PCT },
    { n: "Elasticidade", w: 12, f: NUM2 },
    { n: "O que testar", w: 22 },
  ];

  const cab = resumo.getRow(1);
  COLS_RESUMO.forEach((c, i) => {
    const cel = cab.getCell(i + 1);
    cel.value = c.n;
    cel.alignment = { vertical: "middle", wrapText: true };
    resumo.getColumn(i + 1).width = c.w;
  });
  cab.height = 30;
  cab.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  cab.eachCell({ includeEmpty: false }, (cel) => {
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ESCURO } };
  });

  comEvidencia.forEach((l, idx) => {
    const r = resumo.getRow(idx + 2);
    const atual = l.faixas.find((f) => f.atual) ?? null;
    const rec = recomendacao(l);

    const valores: (string | number | null)[] = [
      l.sku,
      l.titulo || null,
      l.curva,
      l.unidades,
      l.receita,
      l.precoUltimo,
      atual?.unDia ?? null,
      atual?.receitaDia ?? null,
      l.melhor?.preco ?? null,
      l.melhor?.unDia ?? null,
      l.melhorReceita?.preco ?? null,
      l.melhorReceita?.unDia ?? null,
      l.melhorReceita?.receitaDia ?? null,
      ganhoReais(l),
      l.ganhoReceitaDia,
      l.elasticidade,
      rec,
    ];

    valores.forEach((v, i) => {
      const cel = r.getCell(i + 1);
      if (v != null && v !== "") cel.value = v;
      const f = COLS_RESUMO[i].f;
      if (f) cel.numFmt = f;
      if (idx % 2 === 1) {
        cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      }
    });

    /*
     * Só a coluna do ganho recebe cor, e só quando ele é grande.
     *
     * Um ganho de 3% está dentro do ruído de duas faixas medidas em
     * semanas diferentes; pintá-lo daria a mesma urgência de um de 60%.
     */
    if (l.ganhoReceitaDia != null && l.ganhoReceitaDia >= 15) {
      r.getCell(15).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: l.ganhoReceitaDia >= 40 ? VERDE : AMARELO },
      };
    }

    r.font = { size: 10 };
  });

  resumo.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLS_RESUMO.length },
  };

  /* ══ Escada de preço ══ */

  const escada = wb.addWorksheet("Escada de preço", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const COLS_ESCADA = [
    { n: "SKU", w: 15 },
    { n: "Título", w: 32 },
    { n: "Curva", w: 7 },
    { n: "Preço", w: 13, f: DIN },
    { n: "Unidades", w: 10, f: INT },
    { n: "Dias vendendo", w: 12, f: INT },
    { n: "Un/dia", w: 10, f: NUM2 },
    { n: "Receita", w: 14, f: DIN },
    { n: "Receita/dia", w: 14, f: DIN },
    { n: "Marca", w: 20 },
  ];

  const cabE = escada.getRow(1);
  COLS_ESCADA.forEach((c, i) => {
    const cel = cabE.getCell(i + 1);
    cel.value = c.n;
    cel.alignment = { vertical: "middle", wrapText: true };
    escada.getColumn(i + 1).width = c.w;
  });
  cabE.height = 26;
  cabE.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  cabE.eachCell({ includeEmpty: false }, (cel) => {
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ESCURO } };
  });

  let linha = 2;
  let alterna = false;
  let faixasEscritas = 0;

  for (const l of comEvidencia) {
    alterna = !alterna;
    // Do mais caro para o mais barato: é a ordem em que se pensa em
    // baixar preço, e deixa a escada legível de cima para baixo.
    const ordenadas = [...l.faixas].sort((a, b) => b.preco - a.preco);

    for (const f of ordenadas) {
      const r = escada.getRow(linha++);
      faixasEscritas += 1;

      const marcas: string[] = [];
      if (f.atual) marcas.push("preço agora");
      if (f.melhor) marcas.push("mais volume");
      if (l.melhorReceita && f.preco === l.melhorReceita.preco) {
        marcas.push("mais receita");
      }
      const semLastro = f.dias < 3 || f.unidades < 3;

      const valores: (string | number | null)[] = [
        l.sku,
        l.titulo || null,
        l.curva,
        f.preco,
        f.unidades,
        f.dias,
        f.unDia,
        f.receita,
        f.receitaDia,
        marcas.length ? marcas.join(" · ") : semLastro ? "pouco dado" : null,
      ];

      valores.forEach((v, i) => {
        const cel = r.getCell(i + 1);
        if (v != null && v !== "") cel.value = v;
        const fmt = COLS_ESCADA[i].f;
        if (fmt) cel.numFmt = fmt;
        if (alterna) {
          cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
        }
        // Faixa sem lastro fica cinza claro: ela aparece porque houve
        // venda ali, mas não deve orientar decisão nenhuma.
        if (semLastro) cel.font = { size: 10, color: { argb: "FF9CA3AF" } };
        else cel.font = { size: 10 };
      });
    }
  }

  escada.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLS_ESCADA.length },
  };

  /* ══ Leia-me ══ */

  const baixar = comEvidencia.filter((l) => recomendacao(l) === "testar baixar");
  const subir = comEvidencia.filter((l) => recomendacao(l) === "testar subir");
  const noMelhor = comEvidencia.filter((l) => recomendacao(l) === "já está no melhor");

  const leia = wb.addWorksheet("Leia-me");
  leia.getColumn(1).width = 98;

  const texto: [string, boolean][] = [
    ["Preço × volume × receita", true],
    ["", false],
    [
      `${comEvidencia.length} SKUs com faixas comparáveis, de ${dados.linhas.length} com venda.`,
      false,
    ],
    [`Canal: ${nomeCanal ?? "todos"} · últimos ${dados.dias} dias (${dados.periodo.inicio} a ${dados.periodo.fim}).`, false],
    ["", false],
    [`   testar baixar      ${baixar.length}`, false],
    [`   testar subir       ${subir.length}`, false],
    [`   já está no melhor  ${noMelhor.length}`, false],
    ["", false],
    ["O número que decide", true],
    ["RECEITA POR DIA. Baixar o preço para ganhar volume só compensa se preço × volume", false],
    ["subir — e ele nem sempre sobe. Metade das unidades a dois terços do preço perde.", false],
    ["", false],
    ["Por isso há duas faixas vencedoras e elas quase nunca são a mesma:", false],
    ["", false],
    ["   MAIS VOLUME    o preço com mais unidades por dia — costuma ser o mais barato", false],
    ["   MAIS RECEITA   o preço com mais receita por dia — costuma ficar acima dele", false],
    ["", false],
    ["Ganho R$/dia e ganho %", true],
    ["Quanto a faixa de mais receita renderia a mais que a faixa em que o preço está", false],
    ["hoje — em reais e em porcentagem.", false],
    ["", false],
    ["A ordenação é pelo ganho em REAIS. Sessenta por cento num SKU que faz R$ 50 por", false],
    ["dia vale R$ 30; vinte por cento num que faz R$ 3.000 vale R$ 600. Ordenar pela", false],
    ["porcentagem colocaria o primeiro no topo e faria começar pelo teste que menos", false],
    ["importa.", false],
    ["", false],
    ["A célula fica amarela a partir de 15% e verde a partir de 40%. Abaixo de 15% não", false],
    ["recebe cor: está dentro do ruído de duas faixas medidas em semanas diferentes.", false],
    ["", false],
    ["Elasticidade", true],
    ["Variação % do volume dividida pela variação % do preço, entre o preço de agora e", false],
    ["o de melhor receita.", false],
    ["", false],
    ["   acima de 1 em módulo   o volume reage mais que o preço — baixar tende a compensar", false],
    ["   abaixo de 1            o volume reage pouco — baixar perde receita", false],
    ["", false],
    ["O sinal costuma ser negativo: preço sobe, volume desce. Sinal POSITIVO é anomalia", false],
    ["e vale olhar antes de agir — em geral é campanha, ruptura de estoque ou", false],
    ["sazonalidade, não resposta a preço.", false],
    ["", false],
    ["Escada de preço", true],
    ["Uma linha por faixa, do mais caro ao mais barato. É onde se confere se o número", false],
    ["do resumo tem lastro: quantos dias e quantas unidades sustentam cada faixa.", false],
    ["", false],
    ["Linhas em cinza têm menos de 3 dias ou 3 unidades. Aparecem porque houve venda", false],
    ["ali, mas não disputam o melhor preço e não devem orientar decisão.", false],
    ["", false],
    ["O que isto NÃO prova", true],
    ["Correlação. As faixas foram praticadas em semanas diferentes, e o preço mais", false],
    ["baixo costuma coincidir com campanha — que traz tráfego que venderia mais a", false],
    ["qualquer preço.", false],
    ["", false],
    ["Serve para escolher O QUE TESTAR e em que ordem, não como previsão. A coluna", false],
    ["chama-se \"o que testar\" por isso.", false],
    ["", false],
    ["Margem não entra aqui: esta análise é de preço, volume e receita.", false],
  ];

  texto.forEach(([t, negrito], i) => {
    const cel = leia.getCell(i + 1, 1);
    cel.value = t;
    cel.font = negrito
      ? { bold: true, size: 11 }
      : { size: 10, color: { argb: "FF374151" } };
  });

  return {
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
    skus: comEvidencia.length,
    faixas: faixasEscritas,
  };
}
