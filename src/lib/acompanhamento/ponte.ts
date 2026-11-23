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
  titulo?: string;
  delta: number;
  antes: { receita: number; unidades?: number; visitas?: number | null };
  agora: { receita: number; unidades?: number; visitas?: number | null };
  diasSemEstoque: number;
  causa: string;
  efeito: { visitas: number | null; conversao: number | null; unidades: number | null; preco: number };
};

export type Ponte = {
  antes: number;
  agora: number;
  /** `top`: os produtos que mais pesaram na parte, no mesmo sentido dela (até 3). */
  partes: { chave: ChavePonte; valor: number; produtos: number; top: { sku: string; titulo: string; valor: number }[] }[];
  /** Quantos produtos fazem 80% da perda (ou do ganho), entre os que perderam (ganharam). */
  concentracao: { produtos: number; de: number } | null;
  /*
   * As bases de cada parte, para a tela mostrar antes → agora sem se
   * contradizer: visitas, conversão e preço só dos produtos que venderam nos
   * dois períodos (os mesmos da repartição); receita de cada grupo à parte.
   * O total do canal mistura os que pararam e os que entraram, e aí a
   * conversão do total pode cair enquanto a dos produtos que seguiram subiu.
   */
  seguiram: { antes: LadoPonte; agora: LadoPonte; produtos: number };
  grupos: Partial<Record<"estoque" | "zerou" | "novos", { antes: number; agora: number }>>;
};
export type LadoPonte = { receita: number; unidades: number; visitas: number | null; conversao: number | null; precoVendido: number | null };

export function montarPonte(linhas: LinhaPonte[], antes: number, agora: number, parados: Record<string, unknown[]> = {}): Ponte {
  const porItem: Record<string, Map<string, { titulo: string; valor: number }>> = {};
  const soma: Record<ChavePonte, { valor: number; produtos: Set<string> }> = {
    estoque: { valor: 0, produtos: new Set() },
    zerou: { valor: 0, produtos: new Set() },
    novos: { valor: 0, produtos: new Set() },
    visitas: { valor: 0, produtos: new Set() },
    conversao: { valor: 0, produtos: new Set() },
    unidades: { valor: 0, produtos: new Set() },
    preco: { valor: 0, produtos: new Set() },
  };
  let atual: LinhaPonte | null = null;
  const grupos: Ponte["grupos"] = {};
  const novoAcc = () => ({ receita: 0, unidades: 0, visitas: 0, unVis: 0, temVis: false, cesta: 0 });
  const seg = { antes: novoAcc(), agora: novoAcc(), produtos: 0 };
  const noGrupo = (k: "estoque" | "zerou" | "novos", l: LinhaPonte) => {
    const g = (grupos[k] ??= { antes: 0, agora: 0 });
    g.antes += l.antes.receita;
    g.agora += l.agora.receita;
  };
  const por = (k: ChavePonte, sku: string, v: number | null) => {
    if (!v) return;
    soma[k].valor += v;
    const m = (porItem[k] ??= new Map());
    const x = m.get(sku) ?? { titulo: atual?.titulo ?? sku, valor: 0 };
    x.valor += v;
    m.set(sku, x);
    if (Math.abs(v) >= 1) soma[k].produtos.add(sku);
  };
  for (const l of linhas) {
    atual = l;
    const parou = l.delta < 0 && (l.diasSemEstoque > 0 || l.causa === "pausado" || !!parados[l.sku.toUpperCase()]?.length);
    if (parou) { por("estoque", l.sku, l.delta); noGrupo("estoque", l); continue; }
    if (l.agora.receita <= 0 && l.antes.receita > 0) { por("zerou", l.sku, l.delta); noGrupo("zerou", l); continue; }
    if (l.antes.receita <= 0 && l.agora.receita > 0) { por("novos", l.sku, l.delta); noGrupo("novos", l); continue; }
    if (l.antes.receita <= 0 && l.agora.receita <= 0) continue;
    seg.produtos++;
    for (const k of ["antes", "agora"] as const) {
      const a = seg[k], x = l[k];
      a.receita += x.receita;
      a.unidades += x.unidades ?? 0;
      if (x.visitas != null) { a.visitas += x.visitas; a.unVis += x.unidades ?? 0; a.temVis = true; }
    }
    // Preço de antes na cesta de agora: a mudança de preço sem a mudança de mistura (o mesmo que a repartição mede).
    if (l.antes.unidades) seg.antes.cesta += (l.agora.unidades ?? 0) * (l.antes.receita / l.antes.unidades);
    por("visitas", l.sku, l.efeito.visitas);
    por("conversao", l.sku, l.efeito.conversao);
    por("unidades", l.sku, l.efeito.unidades);
    por("preco", l.sku, l.efeito.preco);
  }
  const partes = (Object.keys(soma) as ChavePonte[])
    .map((chave) => {
      const valor = Math.round(soma[chave].valor);
      const top = [...(porItem[chave] ?? new Map()).entries()]
        .map(([sku, x]) => ({ sku, titulo: x.titulo, valor: Math.round(x.valor) }))
        .filter((x) => (valor < 0 ? x.valor < 0 : x.valor > 0))
        .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))
        .slice(0, 3);
      return { chave, valor, produtos: soma[chave].produtos.size, top };
    })
    .filter((p) => p.valor !== 0)
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));

  const caiu = agora < antes;
  const lado = linhas.map((l) => l.delta).filter((d) => (caiu ? d < 0 : d > 0)).map(Math.abs).sort((a, b) => b - a);
  const total = lado.reduce((s, v) => s + v, 0);
  let acc = 0, n = 0;
  for (const v of lado) { if (acc >= total * 0.8) break; acc += v; n++; }
  const fechar = (a: ReturnType<typeof novoAcc>): LadoPonte => ({
    receita: Math.round(a.receita), unidades: a.unidades,
    visitas: a.temVis ? a.visitas : null,
    conversao: a.temVis && a.visitas ? (a.unVis * 100) / a.visitas : null,
    precoVendido: a.unidades ? a.receita / a.unidades : null,
  });
  const antesSeg = fechar(seg.antes);
  antesSeg.precoVendido = seg.agora.unidades ? seg.antes.cesta / seg.agora.unidades : null;
  for (const g of Object.values(grupos)) { g.antes = Math.round(g.antes); g.agora = Math.round(g.agora); }
  return {
    antes, agora, partes, concentracao: lado.length ? { produtos: n, de: lado.length } : null,
    seguiram: { antes: antesSeg, agora: fechar(seg.agora), produtos: seg.produtos }, grupos,
  };
}
