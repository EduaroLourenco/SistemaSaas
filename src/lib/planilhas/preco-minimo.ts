/**
 * Lê a "Tabela de preço mínimo" (Bom de Compras): um preço Clássico e um
 * Premium por SKU, na aba "Preço Mínimo".
 *
 * Recebe as abas já como linhas de valores — quem abre o arquivo é a rota
 * (ExcelJS) ou o script local (Excel, para o .xlsb que o ExcelJS não lê).
 * Assim a regra de leitura tem teste e é uma só.
 *
 * O cabeçalho é achado pelo nome, não pela posição: a planilha ganha
 * coluna (Shopee, Tray, Amazon) sem aviso, e "coluna E" quebraria calado.
 */

export type LinhaPrecoMinimo = { sku: string; tipo: "classico" | "premium"; preco: number };
/** `amarelas`: células pintadas de amarelo, como "linha:coluna" (0 = primeira de `linhas`). */
export type Aba = { nome: string; linhas: unknown[][]; amarelas?: Set<string> };

/** O texto de uma célula do ExcelJS: fórmula, rich text e link vêm como objeto. */
export function textoDaCelula(v: unknown): string {
  if (v == null) return "";
  if (typeof v !== "object") return String(v);
  const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown };
  if (o.richText) return o.richText.map((t) => t.text).join("");
  if ("result" in o) return textoDaCelula(o.result);
  if (o.text != null) return textoDaCelula(o.text);
  return "";
}

const norm = (v: unknown) =>
  textoDaCelula(v)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/** 59.9, "59,90", "R$ 1.234,56". Vazio, traço e zero viram nulo. */
export function numeroDaCelula(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
  if (v && typeof v === "object" && "result" in v) return numeroDaCelula((v as { result: unknown }).result);
  const s = textoDaCelula(v).replace(/R\$|\s/g, "");
  if (!s || s === "-") return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

type Cabecalho = { ic: number; cCod: number; cCla: number; cPre: number };

function cabecalhoDe(aba: Aba): Cabecalho | null {
  const ic = aba.linhas.findIndex((l) => l.some((c) => norm(c) === "codigo" || norm(c) === "sku"));
  if (ic < 0) return null;
  const cab = aba.linhas[ic].map(norm);
  const cCod = cab.findIndex((c) => c === "codigo" || c === "sku");
  const cCla = cab.findIndex((c) => c.includes("classico"));
  const cPre = cab.findIndex((c) => c.includes("premium"));
  return cCla < 0 && cPre < 0 ? null : { ic, cCod, cCla, cPre };
}

/* Códigos chegam com tabulação no fim — o Excel não mostra. */
const skuDa = (v: unknown) => {
  const s = textoDaCelula(v).replace(/\s+/g, " ").trim();
  return !s || s.includes(" ") ? null : s;
};

/**
 * A tabela: a aba "Preço Mínimo" é a base, e as células AMARELAS de outra
 * aba (a "Promoção Black 26") valem por cima.
 *
 * É como a Bom de Compras trabalha: o amarelo da aba Black é o preço que
 * ela conseguiu fechar para a campanha — abaixo do mínimo normal (GP243
 * Clássico 19,90 no mínimo, 14,90 no amarelo). Quem lê a planilha passa
 * as células pintadas em `amarelas` ("linha:coluna", contando de 0 nas
 * `linhas` da aba).
 */
export function lerPrecoMinimo(abas: Aba[]): {
  aba: string;
  linhas: LinhaPrecoMinimo[];
  semPreco: number;
  destaques: { aba: string; precos: number } | null;
} {
  const candidatas = [
    ...abas.filter((a) => /preco minimo/.test(norm(a.nome))),
    ...abas.filter((a) => !/preco minimo/.test(norm(a.nome))),
  ];
  const base = candidatas.find((a) => cabecalhoDe(a));
  if (!base) throw new Error('Não achei a tabela: falta uma aba com as colunas "Código" e "Meli - Classico" / "Meli - Premium".');
  const h = cabecalhoDe(base)!;

  const porChave = new Map<string, LinhaPrecoMinimo>();
  const vistos = new Set<string>();
  let semPreco = 0;
  for (const l of base.linhas.slice(h.ic + 1)) {
    const sku = skuDa(l[h.cCod]);
    if (!sku) continue;
    const cla = h.cCla < 0 ? null : numeroDaCelula(l[h.cCla]);
    const pre = h.cPre < 0 ? null : numeroDaCelula(l[h.cPre]);
    if (cla == null && pre == null) { semPreco++; continue; }
    const k = sku.toUpperCase();
    if (vistos.has(k)) continue;
    vistos.add(k);
    if (cla != null) porChave.set(`${k}|classico`, { sku, tipo: "classico", preco: cla });
    if (pre != null) porChave.set(`${k}|premium`, { sku, tipo: "premium", preco: pre });
  }

  let destaques: { aba: string; precos: number } | null = null;
  for (const aba of abas) {
    if (aba === base || !aba.amarelas?.size) continue;
    const d = cabecalhoDe(aba);
    if (!d) continue;
    let precos = 0;
    aba.linhas.forEach((l, r) => {
      if (r <= d.ic) return;
      const sku = skuDa(l[d.cCod]);
      if (!sku) return;
      for (const [col, tipo] of [[d.cCla, "classico"], [d.cPre, "premium"]] as const) {
        if (col < 0 || !aba.amarelas!.has(`${r}:${col}`)) continue;
        const preco = numeroDaCelula(l[col]);
        if (preco == null) continue;
        porChave.set(`${sku.toUpperCase()}|${tipo}`, { sku, tipo, preco });
        precos++;
      }
    });
    if (precos) { destaques = { aba: aba.nome, precos }; break; }
  }

  return { aba: base.nome, linhas: [...porChave.values()], semPreco, destaques };
}
