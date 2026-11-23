/**
 * Para onde foi (ou de onde veio) a diferença de receita do período.
 *
 * Cada produto entra numa parte só, e as partes somam a diferença inteira:
 *  - "estoque": o produto ficou sem estoque ou com o anúncio que vendia
 *    pausado — a diferença dele vai inteira para cá, porque visita e
 *    conversão de anúncio parado não explicam nada;
 *  - os demais repartem a própria diferença em visitas × conversão × preço
 *    (a conta sem resto do queda.ts). Sem dado de visita, o volume vai para
 *    "unidades". Produto que zerou (ou que não vendia e passou a vender)
 *    vai para "zerou"/"novos": sem um dos lados não há visita × conversão.
 *
 * Puro: sem banco, testado em scripts/testar-gatilhos.mjs.
 */

export type ChavePonte = "estoque" | "zerou" | "novos" | "visitas" | "conversao" | "unidades" | "preco";

export type LinhaPonte = {
  sku: string;
  delta: number;
  antes: { receita: number };
  agora: { receita: number };
  diasSemEstoque: number;
  causa: string;
  efeito: { visitas: number | null; conversao: number | null; unidades: number | null; preco: number };
};

export type Ponte = {
  antes: number;
  agora: number;
  partes: { chave: ChavePonte; valor: number; produtos: number }[];
  /** Quantos produtos fazem 80% da perda (ou do ganho), entre os que perderam (ganharam). */
  concentracao: { produtos: number; de: number } | null;
};

export function montarPonte(linhas: LinhaPonte[], antes: number, agora: number, parados: Record<string, unknown[]> = {}): Ponte {
  const soma: Record<ChavePonte, { valor: number; produtos: Set<string> }> = {
    estoque: { valor: 0, produtos: new Set() },
    zerou: { valor: 0, produtos: new Set() },
    novos: { valor: 0, produtos: new Set() },
    visitas: { valor: 0, produtos: new Set() },
    conversao: { valor: 0, produtos: new Set() },
    unidades: { valor: 0, produtos: new Set() },
    preco: { valor: 0, produtos: new Set() },
  };
  const por = (k: ChavePonte, sku: string, v: number | null) => {
    if (!v) return;
    soma[k].valor += v;
    if (Math.abs(v) >= 1) soma[k].produtos.add(sku);
  };
  for (const l of linhas) {
    const parou = l.delta < 0 && (l.diasSemEstoque > 0 || l.causa === "pausado" || !!parados[l.sku.toUpperCase()]?.length);
    if (parou) { por("estoque", l.sku, l.delta); continue; }
    if (l.agora.receita <= 0 && l.antes.receita > 0) { por("zerou", l.sku, l.delta); continue; }
    if (l.antes.receita <= 0 && l.agora.receita > 0) { por("novos", l.sku, l.delta); continue; }
    por("visitas", l.sku, l.efeito.visitas);
    por("conversao", l.sku, l.efeito.conversao);
    por("unidades", l.sku, l.efeito.unidades);
    por("preco", l.sku, l.efeito.preco);
  }
  const partes = (Object.keys(soma) as ChavePonte[])
    .map((chave) => ({ chave, valor: Math.round(soma[chave].valor), produtos: soma[chave].produtos.size }))
    .filter((p) => p.valor !== 0)
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));

  const caiu = agora < antes;
  const lado = linhas.map((l) => l.delta).filter((d) => (caiu ? d < 0 : d > 0)).map(Math.abs).sort((a, b) => b - a);
  const total = lado.reduce((s, v) => s + v, 0);
  let acc = 0, n = 0;
  for (const v of lado) { if (acc >= total * 0.8) break; acc += v; n++; }
  return { antes, agora, partes, concentracao: lado.length ? { produtos: n, de: lado.length } : null };
}
