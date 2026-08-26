import { abrirPlanilha } from "./abrir";

/**
 * Leitor da aba DIÁRIO da planilha de acompanhamento.
 *
 * O formato: uma linha por dia, e blocos de colunas lado a lado, um por
 * canal. A linha 4 traz o nome do bloco, a 5 os cabeçalhos, e os dados
 * começam na 6.
 *
 * Os blocos não têm todos o mesmo tamanho. Mercado Livre, Amazon e Magalu
 * trazem visitas e mídia; Madeira, Zema, Casas Bahia, VTEX e Outros só
 * trazem receita e pedidos. Por isso o mapeamento é por CABEÇALHO e não
 * por posição — contar colunas quebraria no dia em que alguém inserir uma.
 */

export type LinhaCanalDia = {
  canal: string;
  conta: string;
  data: string;
  visitas: number | null;
  pedidos: number;
  receita: number;
  investimentoAds: number | null;
  pedidosCancelados: number;
  valorCancelado: number;
  meta: number | null;
};

export type LeituraKpis = {
  linhas: LinhaCanalDia[];
  inicio: string | null;
  fim: string | null;
  diasLidos: number;
  canaisEncontrados: string[];
  ignorados: string[];
};

/**
 * Blocos da planilha e o canal/conta a que correspondem no banco.
 *
 * "Cotia" é como a planilha chama a conta que hoje se chama São Paulo. O
 * nome antigo continua aceito de propósito: planilha velha não deixa de
 * existir porque o nome mudou.
 */
const BLOCOS: { padrao: RegExp; canal: string; conta: string }[] = [
  { padrao: /mercado\s*livre\s*\(?\s*(cotia|s[ãa]o\s*paulo)/i, canal: "Mercado Livre", conta: "São Paulo — pronta entrega" },
  { padrao: /mercado\s*livre\s*\(?\s*2[ªa]?\s*conta/i,          canal: "Mercado Livre", conta: "2ª conta — venda a prazo" },
  { padrao: /^amazon/i,          canal: "Amazon",             conta: "Conta principal" },
  { padrao: /^magalu/i,          canal: "Magalu",             conta: "Conta principal" },
  { padrao: /madeira/i,          canal: "Madeira Madeira",    conta: "Conta principal" },
  { padrao: /^zema/i,            canal: "Zema",               conta: "Conta principal" },
  { padrao: /casas\s*bahia/i,    canal: "Casas Bahia",        conta: "Conta principal" },
  { padrao: /^vtex/i,            canal: "Loja própria (VTEX)", conta: "Conta principal" },
  { padrao: /^outros/i,          canal: "Outros",             conta: "Conta principal" },
];

/** Blocos deliberadamente fora: 2P/Full não é canal que a operação acompanhe. */
const IGNORAR = [/2p\s*\/?\s*full/i];

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

function numero(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "object") {
    const o = v as { result?: unknown };
    if (o.result != null) return numero(o.result);
  }
  const s = String(v)
    .replace(/R\$\s?/g, "")
    .replace(/%/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Data da célula: vem como Date do Excel, mas texto também aparece. */
function data(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = texto(v).trim().replace(/^"|"$/g, "");
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return null;
}

/** Qual métrica é este cabeçalho, dentro de um bloco de canal. */
function metrica(cabecalho: string): keyof LinhaCanalDia | null {
  const h = cabecalho.toLowerCase().replace(/\s+/g, " ").trim();
  if (/valor cancelado/.test(h)) return "valorCancelado";
  if (/cancelad/.test(h)) return "pedidosCancelados";
  if (/visitas/.test(h)) return "visitas";
  if (/receita/.test(h)) return "receita";
  if (/pedidos/.test(h)) return "pedidos";
  if (/inv\.?\s*ads/.test(h)) return "investimentoAds";
  if (/^meta/.test(h)) return "meta";
  return null; // conversão, TACOS e ticket são derivados — o banco recalcula
}

export async function lerKpisDiarios(buffer: Buffer): Promise<LeituraKpis> {
  const wb = await abrirPlanilha(buffer);
  const ws =
    wb.getWorksheet("DIÁRIO") ??
    wb.worksheets.find((w) => /di[áa]rio/i.test(w.name));
  if (!ws) throw new Error('A planilha não tem a aba "DIÁRIO".');

  // Percorre a linha 4 acumulando o bloco corrente e, na 5, a métrica.
  const colunas: { col: number; bloco: (typeof BLOCOS)[number]; campo: keyof LinhaCanalDia }[] = [];
  const ignorados = new Set<string>();
  const encontrados = new Set<string>();
  let atual: (typeof BLOCOS)[number] | null = null;
  let atualIgnorado = false;

  for (let c = 1; c <= ws.columnCount; c++) {
    const grupo = texto(ws.getRow(4).getCell(c).value).replace(/\s+/g, " ").trim();
    if (grupo && !grupo.startsWith("{")) {
      const achado = BLOCOS.find((b) => b.padrao.test(grupo));
      atualIgnorado = IGNORAR.some((p) => p.test(grupo));
      if (atualIgnorado) {
        ignorados.add(grupo);
        atual = null;
      } else if (achado) {
        atual = achado;
        encontrados.add(`${achado.canal} · ${achado.conta}`);
      } else {
        atual = null;
      }
    }
    if (!atual) continue;

    const campo = metrica(texto(ws.getRow(5).getCell(c).value));
    if (campo) colunas.push({ col: c, bloco: atual, campo });
  }

  const linhas: LinhaCanalDia[] = [];
  const datas: string[] = [];

  for (let r = 6; r <= ws.rowCount; r++) {
    const dia = data(ws.getRow(r).getCell(1).value);
    if (!dia) continue;
    datas.push(dia);

    // Uma linha por canal neste dia.
    const porBloco = new Map<(typeof BLOCOS)[number], LinhaCanalDia>();
    for (const { col, bloco, campo } of colunas) {
      let linha = porBloco.get(bloco);
      if (!linha) {
        linha = {
          canal: bloco.canal,
          conta: bloco.conta,
          data: dia,
          visitas: null,
          pedidos: 0,
          receita: 0,
          investimentoAds: null,
          pedidosCancelados: 0,
          valorCancelado: 0,
          meta: null,
        };
        porBloco.set(bloco, linha);
      }
      const valor = numero(ws.getRow(r).getCell(col).value);
      (linha[campo] as number) = valor;
    }

    for (const linha of porBloco.values()) {
      // Dia sem nenhum movimento não vira linha: o banco guardaria zeros
      // que se confundem com "vendeu zero", e a tela mostraria queda onde
      // houve apenas ausência de dado.
      const houve =
        linha.receita > 0 ||
        linha.pedidos > 0 ||
        (linha.visitas ?? 0) > 0 ||
        (linha.investimentoAds ?? 0) > 0;
      if (houve) linhas.push(linha);
    }
  }

  datas.sort();
  return {
    linhas,
    inicio: datas[0] ?? null,
    fim: datas[datas.length - 1] ?? null,
    diasLidos: new Set(datas).size,
    canaisEncontrados: [...encontrados].sort(),
    ignorados: [...ignorados],
  };
}
