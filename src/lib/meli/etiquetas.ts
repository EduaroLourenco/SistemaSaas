import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { meliArquivo } from "./cliente";

/**
 * Etiquetas do Mercado Livre prontas para separar.
 *
 * O Meli devolve, por envio: a etiqueta (10×15), o DANFE simplificado (10×15)
 * e uma página A4 de resumo com o SKU. Quem separa precisava ir até o fim do
 * PDF procurar o envio para saber o produto. Aqui o SKU, o produto e a
 * quantidade são escritos no quadro em branco do próprio DANFE, a A4 sai, e
 * entra na frente uma lista de separação somada por SKU, também em 10×15
 * (a impressora é a térmica de etiqueta).
 *
 * Pede um envio por vez de propósito: assim cada página sabe de qual envio é,
 * sem ler o texto do PDF.
 *
 * ATENÇÃO: baixar a etiqueta marca o envio como impresso no painel do Meli.
 */

export type EnvioParaEtiqueta = {
  envio: number;
  pedido: number;
  comprador: string | null;
  itens: { titulo: string; sku: string | null; quantidade: number }[];
};

export type ResultadoEtiquetas = {
  pdf: Uint8Array;
  falhas: { envio: number; pedido: number; motivo: string }[];
};

const L = 283.46; // 10 cm
const A = 425.2; // 15 cm
const preto = rgb(0, 0, 0);

/** Helvetica padrão só desenha WinAnsi: tira o que ela não conhece. */
const limpo = (t: string) => t.normalize("NFC").replace(/[^\x20-\x7E -ÿ]/g, "").trim();

/** Quebra o texto em linhas que cabem na largura. */
function linhas(t: string, fonte: PDFFont, tam: number, largura: number, max: number): string[] {
  const out: string[] = [];
  let atual = "";
  for (const p of limpo(t).split(/\s+/)) {
    const teste = atual ? `${atual} ${p}` : p;
    if (fonte.widthOfTextAtSize(teste, tam) <= largura) atual = teste;
    else {
      if (atual) out.push(atual);
      atual = p;
    }
    if (out.length === max) break;
  }
  if (atual && out.length < max) out.push(atual);
  return out;
}

/**
 * Escreve os itens do envio no quadro em branco do DANFE simplificado.
 * O quadro fica entre "DANFE SIMPLIFICADO" e "DADOS ADICIONAIS": de ~105 a
 * ~225 pt a partir do pé da página. Medido no PDF real de 17/11/2026.
 */
function carimbar(pag: PDFPage, e: EnvioParaEtiqueta, negrito: PDFFont, normal: PDFFont, topo = 220) {
  const x = 14;
  const largura = pag.getWidth() - 2 * x;
  let y = topo;
  const itens = e.itens.length > 3 ? e.itens.slice(0, 3) : e.itens;
  const tamSku = itens.length === 1 ? 22 : 15;
  for (const i of itens) {
    const sku = limpo(i.sku ?? "SEM SKU");
    pag.drawText(`${i.quantidade}x  ${sku}`, { x, y: y - tamSku, size: tamSku, font: negrito, color: preto });
    y -= tamSku + 4;
    for (const l of linhas(i.titulo, normal, 9, largura, 2)) {
      pag.drawText(l, { x, y: y - 9, size: 9, font: normal, color: preto });
      y -= 11;
    }
    y -= 4;
  }
  if (e.itens.length > 3) pag.drawText(`+ ${e.itens.length - 3} itens: ver lista de separação`, { x, y: y - 9, size: 9, font: negrito, color: preto });
}

/** Lista de separação somada por SKU, em páginas 10×15. */
function listaDeSeparacao(doc: PDFDocument, envios: EnvioParaEtiqueta[], negrito: PDFFont, normal: PDFFont) {
  const soma = new Map<string, { sku: string; titulo: string; qtd: number }>();
  for (const e of envios)
    for (const i of e.itens) {
      const k = i.sku ?? `sem-sku:${i.titulo}`;
      const o = soma.get(k) ?? { sku: i.sku ?? "SEM SKU", titulo: i.titulo, qtd: 0 };
      o.qtd += i.quantidade;
      soma.set(k, o);
    }
  const linhasLista = [...soma.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  const totalUn = linhasLista.reduce((s, l) => s + l.qtd, 0);

  // A lista vai na frente das etiquetas, na ordem em que as páginas dela nascem.
  let n = 0;
  let y = 0;
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const nova = () => {
    const pag = doc.insertPage(n++, [L, A]);
    y = A - 18;
    pag.drawText("LISTA DE SEPARAÇÃO", { x: 14, y: y - 12, size: 12, font: negrito, color: preto });
    y -= 18;
    pag.drawText(limpo(`${envios.length} envios · ${totalUn} unidades · ${quando}`), { x: 14, y: y - 9, size: 9, font: normal, color: preto });
    y -= 20;
    return pag;
  };
  let p = nova();
  for (const l of linhasLista) {
    const tit = linhas(l.titulo, normal, 8, L - 28, 2);
    if (y - (16 + tit.length * 10) < 14) p = nova();
    p.drawText(`${l.qtd}x  ${limpo(l.sku)}`, { x: 14, y: y - 13, size: 13, font: negrito, color: preto });
    y -= 16;
    for (const t of tit) {
      p.drawText(t, { x: 14, y: y - 8, size: 8, font: normal, color: preto });
      y -= 10;
    }
    p.drawLine({ start: { x: 14, y: y - 3 }, end: { x: L - 14, y: y - 3 }, thickness: 0.5, color: preto });
    y -= 8;
  }
}

export async function montarEtiquetas(contaId: string, envios: EnvioParaEtiqueta[]): Promise<ResultadoEtiquetas> {
  const doc = await PDFDocument.create();
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const falhas: ResultadoEtiquetas["falhas"] = [];
  const impressos: EnvioParaEtiqueta[] = [];

  for (const e of envios) {
    let bruto: Uint8Array;
    try {
      bruto = await meliArquivo(`/shipment_labels?shipment_ids=${e.envio}&response_type=pdf`, contaId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "falha ao baixar";
      falhas.push({ envio: e.envio, pedido: e.pedido, motivo: /NOT_PRINTABLE_STATUS/.test(msg) ? motivoLegivel(msg) : msg });
      continue;
    }
    const origem = await PDFDocument.load(bruto);
    // A4 = resumo do Meli: sai, a lista nossa substitui.
    const idx = origem.getPages().map((p, i) => (p.getWidth() < 400 ? i : -1)).filter((i) => i >= 0);
    const paginas = await doc.copyPages(origem, idx);
    paginas.forEach((p) => doc.addPage(p));
    if (paginas.length >= 2) carimbar(paginas[paginas.length - 1], e, negrito, normal);
    else {
      // Sem DANFE (nota não registrada no Meli): uma folha só com os itens, logo após a etiqueta.
      const folha = doc.addPage([L, A]);
      folha.drawText(limpo(`Envio ${e.envio} · ${e.comprador ?? ""}`), { x: 14, y: A - 30, size: 10, font: negrito, color: preto });
      carimbar(folha, e, negrito, normal, A - 44);
    }
    impressos.push(e);
  }

  if (impressos.length) listaDeSeparacao(doc, impressos, negrito, normal);
  return { pdf: await doc.save(), falhas };
}

function motivoLegivel(msg: string) {
  const st = msg.match(/status is (\w+)/)?.[1] ?? "";
  const nomes: Record<string, string> = {
    invoice_pending: "falta emitir a nota",
    picked_up: "já foi coletado",
    shipped: "já foi enviado",
    delivered: "já foi entregue",
    cancelled: "foi cancelado",
  };
  return `O Meli não libera a etiqueta: ${nomes[st] ?? st}.`;
}
