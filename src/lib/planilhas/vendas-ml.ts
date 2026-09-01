import { abrirPlanilha } from "./abrir";

/**
 * Leitor do relatório "Vendas BR" do próprio Mercado Livre.
 *
 * ── Por que este arquivo existe, se já lemos a listagem do hub ──
 *
 * Porque a comissão do hub cobre 39,5% dos pedidos e a deste cobre 99,1%.
 *
 * Os dois números não se contradizem — medem pontas diferentes da mesma
 * conta. O Meli informa a tarifa CHEIA e o bônus de campanha em colunas
 * separadas; o hub informa só o líquido. Conferido pedido a pedido:
 *
 *   217,10 − 132,15 =  84,95      (o hub trouxe 84,95)
 *   233,32 − 101,41 = 131,91      (o hub trouxe 131,91)
 *    24,05 −  11,55 =  12,50
 *    95,63 −  49,89 =  45,74
 *
 * Guardar as duas pontas é o que permite responder "quanto a campanha
 * economizou de tarifa", em reais — pergunta que hoje não tem resposta.
 *
 * ── Dado pessoal ──
 *
 * O arquivo traz nome, CPF, endereço completo e telefone do comprador.
 * Este leitor NÃO lê nenhum deles: a lista de colunas aceitas é explícita
 * e fechada, por posição verificada contra o cabeçalho.
 *
 * É lista de permissão e não de exclusão de propósito — numa lista de
 * exclusão basta o Meli acrescentar uma coluna para dado pessoal entrar
 * sozinho, sem ninguém decidir isso.
 *
 * ── O cabeçalho não está na primeira linha ──
 *
 * As cinco primeiras são texto de apresentação do relatório. O cabeçalho
 * real está na linha 6, e é achado procurando a coluna "N.º de venda" em
 * vez de fixar o número: exportação de relatório muda de layout, e um 6
 * escrito no código quebra em silêncio quando isso acontece.
 */

export type VendaMeli = {
  /** N.º de venda — casa com `pedidos.codigo_externo`. */
  codigoExterno: string;
  mlb: string;
  sku: string;
  tipoAnuncio: string;
  unidades: number;

  receitaProdutos: number;
  /** Tarifa de venda cheia, antes do bônus. Sempre positiva aqui. */
  tarifaBruta: number | null;
  /** Bônus/desconto sobre a tarifa. */
  descontoTarifa: number;
  /** O que de fato ficou com o canal: bruta − desconto. */
  tarifaLiquida: number | null;
  /** Juro do parcelamento repassado ao canal. Positivo. */
  juros: number;
  /** Frete que sobrou para o vendedor: tarifas de envio − receita de envio. */
  freteVendedor: number | null;
  /** Total a receber, como o relatório fecha. */
  totalReceber: number | null;
};

export type LeituraVendasMeli = {
  vendas: VendaMeli[];
  linhasLidas: number;
  ignoradas: number;
  comTarifa: number;
  comDesconto: number;
  comJuros: number;
  /** Quantos fecham a identidade contábil do relatório. */
  conferem: number;
  colunasDescartadas: number;
};

/**
 * As colunas aceitas, pelo rótulo exato do relatório.
 *
 * Cada uma é procurada no cabeçalho; o que não está aqui nunca é lido,
 * mesmo que o Meli mude a ordem das colunas entre exportações.
 */
const ACEITAS = {
  venda: "n.º de venda",
  unidades: "unidades",
  receitaProdutos: "receita por produtos",
  acrescimoPreco: "receita por acréscimo no preço",
  taxaParcelamento: "taxa de parcelamento equivalente ao acréscimo",
  tarifaVenda: "tarifa de venda e impostos",
  receitaEnvio: "receita por envio",
  tarifaEnvio: "tarifas de envio",
  custoMedidas: "custo de envio com base nas medidas",
  custoDiferencas: "custo por diferenças nas medidas",
  descontos: "descontos e bônus",
  cancelamentos: "cancelamentos e reembolsos",
  total: "total (brl)",
  sku: "sku",
  anuncio: "# de anúncio",
  tipoAnuncio: "tipo de anúncio",
} as const;

type Campo = keyof typeof ACEITAS;

function texto(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text) return o.text;
    if (o.result != null) return String(o.result);
    return "";
  }
  return String(v);
}

/**
 * Número no formato do relatório.
 *
 * Os valores vêm com ponto decimal ("-4.3", "1887.8"), mas a exportação
 * em português pode trazer vírgula. A regra é a mesma da listagem de
 * pedidos: vírgula presente significa decimal brasileiro.
 */
function numero(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const bruto = texto(v).replace(/R\$\s?/g, "").replace(/\s/g, "").trim();
  if (!bruto || bruto === "-") return 0;

  let normal: string;
  if (bruto.includes(",")) {
    normal = bruto.replace(/\./g, "").replace(",", ".");
  } else {
    const pontos = (bruto.match(/\./g) ?? []).length;
    normal = pontos === 1 ? bruto : bruto.replace(/\./g, "");
  }

  const n = parseFloat(normal);
  return Number.isFinite(n) ? n : 0;
}

export async function lerVendasMeli(buffer: Buffer): Promise<LeituraVendasMeli> {
  const wb = await abrirPlanilha(buffer);
  const ws =
    wb.worksheets.find((w) => /vendas/i.test(w.name)) ?? wb.worksheets[0];
  if (!ws) throw new Error("A planilha não tem aba de vendas.");

  /* ── Acha o cabeçalho pela coluna que sempre existe ── */

  let linhaCabecalho = 0;
  for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
    for (let c = 1; c <= ws.columnCount; c++) {
      if (texto(ws.getRow(r).getCell(c).value).trim().toLowerCase().startsWith("n.º de venda")) {
        linhaCabecalho = r;
        break;
      }
    }
    if (linhaCabecalho) break;
  }
  if (!linhaCabecalho) {
    throw new Error(
      'Não encontrei a linha de cabeçalho — nenhuma coluna "N.º de venda". ' +
        "Este não parece ser o relatório de vendas do Mercado Livre."
    );
  }

  /* ── Mapeia só as colunas aceitas ── */

  const col = new Map<Campo, number>();
  let descartadas = 0;

  for (let c = 1; c <= ws.columnCount; c++) {
    const h = texto(ws.getRow(linhaCabecalho).getCell(c).value).trim().toLowerCase();
    if (!h) continue;

    let casou = false;
    for (const [campo, marca] of Object.entries(ACEITAS) as [Campo, string][]) {
      // A primeira coluna que casa vence: "Unidades" aparece três vezes no
      // relatório (venda, envio 1, envio 2) e só a primeira é a da venda.
      if (h.startsWith(marca) && !col.has(campo)) {
        col.set(campo, c);
        casou = true;
        break;
      }
    }
    if (!casou) descartadas += 1;
  }

  for (const obrigatoria of ["venda", "tarifaVenda", "anuncio"] as Campo[]) {
    if (!col.has(obrigatoria)) {
      throw new Error(
        `O relatório não tem a coluna "${ACEITAS[obrigatoria]}". ` +
          "Exporte novamente incluindo as colunas de tarifas."
      );
    }
  }

  /* ── Lê ── */

  const vendas: VendaMeli[] = [];
  let linhasLidas = 0;
  let ignoradas = 0;
  let comTarifa = 0;
  let comDesconto = 0;
  let comJuros = 0;
  let conferem = 0;

  const pega = (r: number, campo: Campo) => {
    const c = col.get(campo);
    return c ? ws.getRow(r).getCell(c).value : null;
  };

  for (let r = linhaCabecalho + 1; r <= ws.rowCount; r++) {
    const codigo = texto(pega(r, "venda")).trim();
    if (!codigo || !/^\d/.test(codigo)) continue;
    linhasLidas += 1;

    const mlb = texto(pega(r, "anuncio")).trim();
    if (!mlb) {
      ignoradas += 1;
      continue;
    }

    // O relatório traz tarifas e custos como NEGATIVO e receitas como
    // positivo. Aqui tudo vira positivo: o sinal é convenção de extrato,
    // e propagá-lo faria cada tela lembrar de inverter.
    const receitaProdutos = numero(pega(r, "receitaProdutos"));
    const acrescimo = numero(pega(r, "acrescimoPreco"));
    const taxaParcelamento = numero(pega(r, "taxaParcelamento"));
    const tarifaVenda = numero(pega(r, "tarifaVenda"));
    const receitaEnvio = numero(pega(r, "receitaEnvio"));
    const tarifaEnvio = numero(pega(r, "tarifaEnvio"));
    const custoMedidas = numero(pega(r, "custoMedidas"));
    const custoDiferencas = numero(pega(r, "custoDiferencas"));
    const descontos = numero(pega(r, "descontos"));
    const cancelamentos = numero(pega(r, "cancelamentos"));
    const total = numero(pega(r, "total"));

    const tarifaBruta = tarifaVenda !== 0 ? Math.abs(tarifaVenda) : null;
    const descontoTarifa = Math.abs(descontos);

    /*
     * A líquida é a que o hub informa, e é a que vira custo.
     *
     * Nunca abaixo de zero: bônus maior que a tarifa existe em campanha
     * agressiva, e uma "tarifa negativa" viraria receita na conta de
     * margem — o canal pagando para você vender.
     */
    const tarifaLiquida =
      tarifaBruta == null ? null : Math.max(0, Number((tarifaBruta - descontoTarifa).toFixed(2)));

    // O frete que sobra para o vendedor: o que o canal cobrou de envio
    // menos o que o comprador pagou por ele.
    const envioTotal = Math.abs(tarifaEnvio) + Math.abs(custoMedidas) + Math.abs(custoDiferencas);
    const freteVendedor =
      envioTotal > 0 ? Math.max(0, Number((envioTotal - Math.abs(receitaEnvio)).toFixed(2))) : null;

    if (tarifaBruta != null) comTarifa += 1;
    if (descontoTarifa > 0) comDesconto += 1;
    if (taxaParcelamento !== 0) comJuros += 1;

    // A identidade do relatório: tudo somado tem que dar o total a
    // receber. Onde não fecha, a tarifa foi faturada em outro mês — o
    // próprio arquivo diz isso numa coluna. Conta-se para relatar, não
    // para recusar.
    const soma =
      receitaProdutos + acrescimo + taxaParcelamento + tarifaVenda +
      receitaEnvio + tarifaEnvio + custoMedidas + custoDiferencas +
      descontos + cancelamentos;
    if (Math.abs(soma - total) < 0.02) conferem += 1;

    vendas.push({
      codigoExterno: codigo,
      mlb,
      sku: texto(pega(r, "sku")).trim(),
      tipoAnuncio: texto(pega(r, "tipoAnuncio")).trim(),
      unidades: Math.max(1, Math.round(numero(pega(r, "unidades")))),
      receitaProdutos,
      tarifaBruta,
      descontoTarifa,
      tarifaLiquida,
      juros: Math.abs(taxaParcelamento),
      freteVendedor,
      totalReceber: total !== 0 ? total : null,
    });
  }

  return {
    vendas,
    linhasLidas,
    ignoradas,
    comTarifa,
    comDesconto,
    comJuros,
    conferem,
    colunasDescartadas: descartadas,
  };
}
