import type { GrupoRecorte } from "@/lib/recorte";

type Numero = number | string | null;
export type CanalPrecos = { id: string; nome: string };
export type ContaPrecos = { id: string; nome: string; canal_id: string };
export type ProdutoPrecos = { id: string; sku: string; titulo: string };
export type AnuncioPrecos = {
  id: string; codigo_externo: string; sku_canal: string | null; titulo: string;
  produto_id: string | null; canal_id: string; conta_canal_id: string | null; status: string | null;
};
export type ItemPrecos = {
  id: string; sku: string | null; titulo: string | null; anuncio_id: string | null;
  codigo_externo: string | null; quantidade: Numero; preco_unitario: Numero; total: Numero;
  pedidos: { data: string; canal_id: string; conta_canal_id: string | null; cancelado: boolean } | null;
};
/** Somente leituras da API; preço cadastrado/importado não substitui vitrine. */
export type LeituraVitrine = { anuncio_id: string; data: string; preco: Numero };
export type ColunaPrecos = { id: string; nome: string; canalId: string; contaId?: string };
export type CurvaPrecos = "A" | "B" | "C";
export type CelulaPrecos = {
  vendido: number | null;
  unidades: number | null;
  curva: CurvaPrecos | null;
  vitrine: { min: number; max: number; de: string; ate: string; anuncios: number } | null;
};
export type LinhaPrecos = {
  chave: string; sku: string; titulo: string; codigos: string[];
  canais: Record<string, CelulaPrecos>;
};
export type DadosProdutosPrecos = {
  operacaoId: string; de: string; ate: string; hoje: string; skuFiltro: string;
  recorte: string[]; opcoes: GrupoRecorte[]; colunas: ColunaPrecos[]; linhas: LinhaPrecos[];
};

const skuNormal = (v: string | null | undefined) => (v ?? "").trim().toLocaleUpperCase("pt-BR");
const numero = (v: Numero | undefined) => v == null || v === "" || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v);
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const dataValida = (s?: string): s is string => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);

export function periodoProdutos(p: { de?: string; ate?: string }, hoje: string) {
  const ate = dataValida(p.ate) ? p.ate : hoje;
  const padrao = new Date(Date.parse(ate + "T12:00:00Z") - 29 * 86_400_000).toISOString().slice(0, 10);
  return { de: dataValida(p.de) && p.de <= ate ? p.de : padrao, ate };
}

export function montarProdutosPrecos(entrada: {
  operacaoId: string; de: string; ate: string; hoje: string; sku?: string; recorte?: string[];
  canais: CanalPrecos[]; contas: ContaPrecos[]; produtos: ProdutoPrecos[];
  anuncios: AnuncioPrecos[]; itens: ItemPrecos[]; leituras: LeituraVitrine[];
}): DadosProdutosPrecos {
  const canais = [...entrada.canais].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const colunas: ColunaPrecos[] = [];
  const opcoes: GrupoRecorte[] = [];
  for (const canal of canais) {
    colunas.push({ id: canal.id, nome: canal.nome, canalId: canal.id });
    const contas = entrada.contas.filter(c => c.canal_id === canal.id).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const opcoesCanal = [{ valor: canal.id, rotulo: contas.length > 1 ? `${canal.nome} — todas as contas` : canal.nome }];
    if (contas.length > 1) for (const conta of contas) {
      colunas.push({ id: `conta:${conta.id}`, nome: `${canal.nome} · ${conta.nome}`, canalId: canal.id, contaId: conta.id });
      opcoesCanal.push({ valor: `conta:${conta.id}`, rotulo: conta.nome });
    }
    opcoes.push({ rotulo: contas.length > 1 ? canal.nome : undefined, opcoes: opcoesCanal });
  }
  const colunasValidas = new Set(colunas.map(c => c.id));
  const destinos = (canal: string, conta: string | null) => [canal, `conta:${conta}`].filter(id => colunasValidas.has(id));
  const produtos = new Map(entrada.produtos.map(p => [p.id, p]));
  const anuncios = new Map(entrada.anuncios.map(a => [a.id, a]));
  const porCodigo = new Map(entrada.anuncios.map(a => [`${a.conta_canal_id}|${a.codigo_externo.toUpperCase()}`, a]));
  const leituras = new Map<string, { preco: number; data: string }>();
  for (const l of entrada.leituras) {
    const preco = numero(l.preco);
    if (preco != null && (!leituras.has(l.anuncio_id) || l.data > leituras.get(l.anuncio_id)!.data)) {
      leituras.set(l.anuncio_id, { preco, data: l.data });
    }
  }
  type Acc = { unidades: number; unidadesComPreco: number; receita: number; precos: { preco: number; data: string }[] };
  type Grupo = { chave: string; sku: string; titulo: string; codigos: Set<string>; canais: Map<string, Acc> };
  const grupos = new Map<string, Grupo>();
  const filtro = skuNormal(entrada.sku);
  const grupo = (sku: string, alternativa: string, titulo: string) => {
    const normal = skuNormal(sku);
    const chave = normal ? `sku:${normal}` : alternativa;
    let g = grupos.get(chave);
    if (!g) { g = { chave, sku: normal, titulo, codigos: new Set(), canais: new Map() }; grupos.set(chave, g); }
    if (!g.titulo && titulo) g.titulo = titulo;
    return g;
  };
  const celula = (g: Grupo, id: string) => {
    let c = g.canais.get(id);
    if (!c) { c = { unidades: 0, unidadesComPreco: 0, receita: 0, precos: [] }; g.canais.set(id, c); }
    return c;
  };
  // O cadastro mantém o SKU visível mesmo quando o recorte não contém vendas.
  for (const p of entrada.produtos) grupo(p.sku, `produto:${p.id}`, p.titulo);
  for (const a of entrada.anuncios) {
    if (!colunasValidas.has(a.canal_id)) continue;
    const g = grupo(a.sku_canal || produtos.get(a.produto_id ?? "")?.sku || "", `anuncio:${a.id}`, a.titulo);
    if (!g) continue;
    g.codigos.add(a.codigo_externo);
    const leitura = leituras.get(a.id);
    if (a.status !== "ativo" || !leitura) continue;
    for (const id of destinos(a.canal_id, a.conta_canal_id)) celula(g, id).precos.push(leitura);
  }
  for (const it of entrada.itens) {
    const p = it.pedidos;
    if (!p || p.cancelado || p.data < entrada.de || p.data > entrada.ate || !colunasValidas.has(p.canal_id)) continue;
    const candidato = anuncios.get(it.anuncio_id ?? "") ?? porCodigo.get(`${p.conta_canal_id}|${it.codigo_externo?.toUpperCase()}`);
    const anuncio = candidato?.canal_id === p.canal_id && candidato.conta_canal_id === p.conta_canal_id ? candidato : undefined;
    // SKU do item preserva variações. Não trocar o SKU vendido pelo SKU pai do anúncio.
    const sku = it.sku || anuncio?.sku_canal || produtos.get(anuncio?.produto_id ?? "")?.sku || "";
    const g = grupo(sku, anuncio ? `anuncio:${anuncio.id}` : `item:${p.conta_canal_id}|${it.codigo_externo || it.id}`, it.titulo || anuncio?.titulo || "Produto sem nome");
    if (!g) continue;
    if (it.codigo_externo) g.codigos.add(it.codigo_externo);
    const quantidade = numero(it.quantidade);
    if (quantidade == null || quantidade <= 0) continue;
    const unitario = numero(it.preco_unitario);
    const valor = numero(it.total) ?? (unitario == null ? null : unitario * quantidade);
    for (const id of destinos(p.canal_id, p.conta_canal_id)) {
      const c = celula(g, id);
      c.unidades += quantidade;
      if (valor != null) { c.receita += valor; c.unidadesComPreco += quantidade; }
    }
  }
  // A curva usa a receita original (não o preço médio arredondado) de TODOS
  // os produtos do canal/conta no período, antes de buscar ou filtrar um SKU.
  const curvas = new Map<string, Map<string, CurvaPrecos>>();
  for (const coluna of colunas) {
    const base = [...grupos.values()].flatMap(g => {
      const c = g.canais.get(coluna.id);
      const centavos = Math.round((c?.receita ?? 0) * 100);
      return c && centavos > 0 && c.unidadesComPreco === c.unidades
        ? [{ chave: g.chave, centavos }] : [];
    }).sort((a, b) => b.centavos - a.centavos || a.chave.localeCompare(b.chave, "pt-BR", { numeric: true }));
    const total = base.reduce((s, g) => s + g.centavos, 0);
    const classes = new Map<string, CurvaPrecos>();
    let acumulado = 0;
    for (const g of base) {
      // Inclui o produto que atinge o limite: um único SKU dominante é A.
      classes.set(g.chave, acumulado * 100 < total * 80 ? "A" : acumulado * 100 < total * 95 ? "B" : "C");
      acumulado += g.centavos;
    }
    curvas.set(coluna.id, classes);
  }
  const linhas = [...grupos.values()].filter(g => !filtro || g.sku === filtro).map(g => ({
    chave: g.chave, sku: g.sku, titulo: g.titulo, codigos: [...g.codigos],
    canais: Object.fromEntries([...g.canais].map(([id, c]) => [id, {
      unidades: c.unidades || null,
      vendido: c.unidades > 0 && c.unidadesComPreco === c.unidades ? r2(c.receita / c.unidades) : null,
      curva: curvas.get(id)?.get(g.chave) ?? null,
      vitrine: c.precos.length ? {
        min: Math.min(...c.precos.map(p => p.preco)), max: Math.max(...c.precos.map(p => p.preco)),
        de: c.precos.map(p => p.data).sort()[0], ate: c.precos.map(p => p.data).sort().at(-1)!, anuncios: c.precos.length,
      } : null,
    } satisfies CelulaPrecos])),
  })).sort((a, b) => a.sku.localeCompare(b.sku, "pt-BR", { numeric: true }) || a.titulo.localeCompare(b.titulo, "pt-BR"));
  return {
    operacaoId: entrada.operacaoId, de: entrada.de, ate: entrada.ate, hoje: entrada.hoje, skuFiltro: entrada.sku ?? "",
    colunas, opcoes, recorte: [...new Set(entrada.recorte ?? [])].filter(id => colunasValidas.has(id)), linhas,
  };
}

/** Só restringe as linhas; nunca recalcula a curva dos resultados filtrados. */
export function filtrarCurvaProdutos(linhas: LinhaPrecos[], curva: CurvaPrecos | "", canais: string[]) {
  return curva ? linhas.filter(l => canais.some(id => l.canais[id]?.curva === curva)) : linhas;
}

/** Exporta as mesmas colunas e o mesmo recorte da comparação, sem limitar à página. */
export function csvProdutosPrecos(linhas: LinhaPrecos[], colunas: ColunaPrecos[]) {
  const campo = (v: unknown) => {
    if (typeof v === "number") return String(v).replace(".", ",");
    const s = String(v ?? "Sem dado");
    return '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replaceAll('"', '""') + '"';
  };
  const linhasCsv: unknown[][] = [["SKU", "Produto", ...colunas.flatMap(c => [`${c.nome} — Curva ABC`, `${c.nome} — Vendido médio`, `${c.nome} — Vitrine`, `${c.nome} — Unidades`, `${c.nome} — Data da vitrine`])]];
  for (const l of linhas) linhasCsv.push([l.sku || "Sem SKU", l.titulo, ...colunas.flatMap(c => {
    const dado = l.canais[c.id], v = dado?.vitrine;
    return [dado?.curva, dado?.vendido, v ? v.min === v.max ? v.min : `${v.min.toFixed(2).replace('.', ',')} a ${v.max.toFixed(2).replace('.', ',')}` : null,
      dado?.unidades, v ? v.de === v.ate ? v.ate : `${v.de} a ${v.ate}` : null];
  })]);
  return '\uFEFF' + linhasCsv.map(l => l.map(campo).join(';')).join('\r\n');
}
