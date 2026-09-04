import "server-only";
import ExcelJS from "exceljs";
import type { AnuncioComOfertas, Oferta } from "./comparar-ofertas";

/**
 * As ofertas recusadas, para decidir quais aceitar mesmo assim.
 *
 * ── Por que esta planilha existe ──
 *
 * O motor recusa o que fura o piso, e está certo na regra geral. Mas a
 * regra não sabe que um SKU parado há três semanas vale entrar com margem
 * menor, nem que outro é âncora de tráfego. Essa decisão é de quem opera,
 * e ela precisa dos números na mão.
 *
 * ── A comissão é a informação que faltava ──
 *
 * O canal comunica o rebate como fatia da tarifa. Clássico paga 11,5% e
 * premium 16,5%; a redução SUBTRAI daí. Um premium com 4% de rebate paga
 * 12,5% — abaixo do clássico sem redução.
 *
 * Isso muda a decisão e não estava em lugar nenhum: a tela mostrava "4%
 * de redução" e deixava a subtração para a cabeça de quem lê, com duas
 * bases diferentes dependendo do tipo do anúncio.
 *
 * ── Agrupado por SKU, e por quê ──
 *
 * O mesmo produto aparece em quatro anúncios — dois clássicos e dois
 * premium — e cada um recebe ofertas diferentes. Decidir anúncio a
 * anúncio produz um sortimento incoerente: o clássico entra na promoção e
 * o premium do mesmo colchão fica fora, competindo com ele mesmo.
 *
 * As linhas vêm ordenadas por SKU e, dentro dele, pelo que falta para o
 * piso — a de cima é a que exige menos concessão.
 *
 * ── A coluna vazia é de propósito ──
 *
 * "Entrar?" tem lista de sim/não e nasce em branco. A planilha é para
 * decidir, e um valor pré-preenchido seria uma recomendação disfarçada
 * de campo editável.
 */

const DIN = "#,##0.00";
const PCT = '0.00"%"';

const ESCURO = "FF1F2937";
const ZEBRA = "FFFAFAFA";
const VERDE = "FFE7F5EC";
const VERMELHO = "FFFDECEC";

type Coluna = {
  nome: string;
  largura: number;
  formato?: string;
  valor: (o: Oferta, a: AnuncioComOfertas) => string | number | null;
};

const COLUNAS: Coluna[] = [
  { nome: "SKU", largura: 15, valor: (_, a) => a.sku || null },
  { nome: "Título", largura: 38, valor: (_, a) => a.titulo || null },
  { nome: "MLB", largura: 16, valor: (_, a) => a.mlb },
  { nome: "Tipo", largura: 10, valor: (_, a) => a.tipo },
  { nome: "Campanha", largura: 26, valor: (o) => o.campanha },
  {
    nome: "Preço ofertado",
    largura: 14,
    formato: DIN,
    // O preço do canal, que é o que vai valer se a oferta for aceita.
    valor: (o) => o.precoCanal ?? o.precoOferta,
  },
  { nome: "Preço de tabela", largura: 14, formato: DIN, valor: (o) => o.precoTabela },
  { nome: "Piso", largura: 12, formato: DIN, valor: (o) => o.pisoEfetivo ?? o.precoPiso },
  {
    nome: "Falta p/ o piso",
    largura: 13,
    formato: DIN,
    /*
     * Positivo é quanto o preço teria que subir para encostar no piso.
     * `folgaAtePiso` guarda o sinal contrário — negativo quando fura —, e
     * invertê-lo aqui deixa a coluna legível sem precisar de nota: o
     * número é o tamanho da concessão.
     */
    valor: (o) => (o.folgaAtePiso != null ? Number((-o.folgaAtePiso).toFixed(2)) : null),
  },
  {
    nome: "Redução de tarifa",
    largura: 15,
    formato: PCT,
    valor: (o) => o.reducaoPercentual,
  },
  {
    nome: "Comissão cheia",
    largura: 13,
    formato: PCT,
    valor: (_, a) => a.comissaoTabela,
  },
  {
    nome: "Comissão com redução",
    largura: 17,
    formato: PCT,
    valor: (o) => o.comissaoResultante,
  },
  { nome: "Motivo da recusa", largura: 34, valor: (o) => o.motivo || null },
  { nome: "Entrar?", largura: 10, valor: () => null },
];

const r2 = (v: number) => Number(v.toFixed(2));

export async function montarPlanilhaRecusadas(
  anuncios: AnuncioComOfertas[]
): Promise<{ buffer: Buffer; linhas: number; skus: number }> {
  /* ── Só as recusadas, e só de anúncios que têm alguma ── */

  type Par = { a: AnuncioComOfertas; o: Oferta };
  const pares: Par[] = [];
  for (const a of anuncios) {
    for (const o of a.ofertas) {
      if (!o.participa) pares.push({ a, o });
    }
  }

  /*
   * Ordem: SKU, depois o que falta menos para o piso.
   *
   * Sem o segundo critério, a primeira linha de cada SKU seria arbitrária
   * — e é justamente a que se lê primeiro para decidir.
   */
  pares.sort((x, y) => {
    const s = (x.a.sku || "zzz").localeCompare(y.a.sku || "zzz", "pt-BR");
    if (s !== 0) return s;
    const fx = x.o.folgaAtePiso ?? -Infinity;
    const fy = y.o.folgaAtePiso ?? -Infinity;
    return fy - fx;
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma";

  const ws = wb.addWorksheet("Recusadas", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const cab = ws.getRow(1);
  COLUNAS.forEach((c, i) => {
    const cel = cab.getCell(i + 1);
    cel.value = c.nome;
    cel.alignment = { vertical: "middle", wrapText: true };
    ws.getColumn(i + 1).width = c.largura;
  });
  cab.height = 26;
  cab.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  cab.eachCell({ includeEmpty: false }, (cel) => {
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ESCURO } };
    cel.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
  });

  let skuAnterior = "";
  let alterna = false;

  pares.forEach(({ a, o }, idx) => {
    const r = ws.getRow(idx + 2);

    // A faixa alterna por SKU, não por linha: o olho precisa ver onde um
    // produto acaba e o outro começa, que é a unidade da decisão.
    if (a.sku !== skuAnterior) {
      alterna = !alterna;
      skuAnterior = a.sku;
    }

    COLUNAS.forEach((c, i) => {
      const cel = r.getCell(i + 1);
      const v = c.valor(o, a);
      if (v != null && v !== "") cel.value = v;
      if (c.formato) cel.numFmt = c.formato;
      if (alterna) {
        cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      }
    });

    /*
     * Só a coluna "Falta p/ o piso" recebe cor.
     *
     * Pintar a linha inteira faria a planilha parecer um semáforo e
     * competiria com a leitura dos números. Aqui a cor responde uma
     * pergunta só: a concessão é pequena ou grande?
     */
    const falta = o.folgaAtePiso != null ? -o.folgaAtePiso : null;
    if (falta != null) {
      const celFalta = r.getCell(9);
      const base = o.pisoEfetivo ?? o.precoPiso ?? 0;
      const proporcao = base > 0 ? falta / base : 1;
      celFalta.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: proporcao <= 0.03 ? VERDE : proporcao > 0.1 ? VERMELHO : ZEBRA },
      };
    }

    r.font = { size: 10 };
  });

  /* A coluna de decisão aceita só sim ou não. */
  if (pares.length) {
    for (let linha = 2; linha <= pares.length + 1; linha++) {
      ws.getCell(linha, COLUNAS.length).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"sim,não"'],
      };
    }
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUNAS.length },
  };

  /* ── Leia-me ── */

  const skus = new Set(pares.map((p) => p.a.sku || p.a.mlb)).size;
  const comReducao = pares.filter((p) => (p.o.reducaoPercentual ?? 0) > 0).length;
  const perto = pares.filter((p) => {
    const falta = p.o.folgaAtePiso != null ? -p.o.folgaAtePiso : null;
    const base = p.o.pisoEfetivo ?? p.o.precoPiso ?? 0;
    return falta != null && base > 0 && falta / base <= 0.03;
  }).length;

  const leia = wb.addWorksheet("Leia-me");
  leia.getColumn(1).width = 96;

  const texto: [string, boolean][] = [
    ["Ofertas recusadas — para decidir quais aceitar mesmo assim", true],
    ["", false],
    [`${pares.length} ofertas de ${skus} SKUs. ${comReducao} têm redução de tarifa.`, false],
    [`${perto} estão a menos de 3% do piso — são as de concessão mais barata.`, false],
    ["", false],
    ["A comissão", true],
    ["O canal comunica o rebate como fatia da tarifa, e ela SUBTRAI da alíquota cheia:", false],
    ["", false],
    ["   clássico   11,5% − redução", false],
    ["   premium    16,5% − redução", false],
    ["", false],
    ["Um premium com 4% de rebate paga 12,5% — abaixo de um clássico sem redução.", false],
    ["É por isso que a comissão aparece nas duas colunas: a cheia e a que sobra.", false],
    ["", false],
    ["Onde o anúncio tem tarifa negociada, a cheia é a dele e não o padrão do tipo.", false],
    ["", false],
    ["Falta p/ o piso", true],
    ["Quanto o preço ofertado teria que SUBIR para encostar no piso. É o tamanho da", false],
    ["concessão que aceitar essa oferta custa.", false],
    ["", false],
    ["A célula fica verde até 3% do piso, vermelha acima de 10%. A cor está só nessa", false],
    ["coluna: pintar a linha inteira viraria semáforo e competiria com os números.", false],
    ["", false],
    ["Piso e tabela vazios", true],
    ["Aparecem quando o MLB não está na aba Base MLB da Fórmula base — o motor não", false],
    ["tem preço de referência para ele. A coluna Motivo diz isso. Nesses casos não há", false],
    ["como avaliar a concessão: complete a Fórmula base e processe de novo.", false],
    ["", false],
    ["Agrupamento", true],
    ["Ordenado por SKU e, dentro dele, pelo que falta menos para o piso — a primeira", false],
    ["linha de cada produto é a de decisão mais fácil.", false],
    ["", false],
    ["O mesmo produto costuma ter quatro anúncios: dois clássicos e dois premium.", false],
    ["Decidir anúncio a anúncio produz sortimento incoerente — o clássico entra na", false],
    ["promoção e o premium do mesmo colchão fica fora, competindo com ele mesmo.", false],
    ["", false],
    ["A coluna Entrar?", true],
    ["Nasce em branco, com lista de sim/não. A planilha é para decidir; valor", false],
    ["pré-preenchido seria recomendação disfarçada de campo editável.", false],
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
    linhas: pares.length,
    skus,
  };
}
