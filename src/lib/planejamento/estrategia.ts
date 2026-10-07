export const FOCOS = [
  "Vender mais",
  "Melhorar rentabilidade",
  "Melhorar conversão",
  "Lançar produto",
  "Reativar clientes",
  "Aumentar recompra",
  "Fortalecer a marca",
  "Outro",
] as const;
export const INDICADORES = {
  receita: "Vendas de produtos (R$)",
  pedidos: "Pedidos com os produtos selecionados",
  unidades: "Unidades vendidas",
  conversao: "Conversão (%)",
  roas: "ROAS (vezes)",
  margem: "Margem (%)",
  clientes: "Clientes reativados",
  personalizado: "Outro indicador",
} as const;
export const EXECUCOES = [
  "Não iniciada",
  "Em execução",
  "Executada",
  "Não realizada",
] as const;
export const DECISOES = ["Repetir", "Ajustar", "Não repetir"] as const;
export type Execucao = {
  destino: string;
  situacao: (typeof EXECUCOES)[number];
  inicio: string;
  fim: string;
  mudancas: string;
  evidencia: string;
};
export type Estrategia = {
  foco: string;
  hipotese: string;
  indicador: "" | keyof typeof INDICADORES;
  indicadorPersonalizado: string;
  alvo: number | null;
  anuncios: string[];
  execucoes: Execucao[];
  medicao: { valor: number | null; fonte: string; data: string };
  fechamento: {
    funcionou: string;
    problemas: string;
    proximoPasso: string;
    decisao: string;
  };
};
export function estrategiaVazia(): Estrategia {
  return {
    foco: "",
    hipotese: "",
    indicador: "",
    indicadorPersonalizado: "",
    alvo: null,
    anuncios: [],
    execucoes: [],
    medicao: { valor: null, fonte: "", data: "" },
    fechamento: { funcionou: "", problemas: "", proximoPasso: "", decisao: "" },
  };
}
/** Registros anteriores à estratégia permanecem editáveis. */
export function estrategiaDe(item: {
  detalhes: { estrategia?: Estrategia };
}): Estrategia {
  const base = estrategiaVazia(),
    atual = item.detalhes.estrategia;
  return {
    ...base,
    ...atual,
    medicao: { ...base.medicao, ...atual?.medicao },
    fechamento: { ...base.fechamento, ...atual?.fechamento },
  };
}
export function execucaoVazia(destino: string): Execucao {
  return {
    destino,
    situacao: "Não iniciada",
    inicio: "",
    fim: "",
    mudancas: "",
    evidencia: "",
  };
}
export function validarEstrategia(
  v: unknown,
  dataValida: (s: unknown) => boolean,
): string | null {
  if (v === undefined) return null;
  if (!v || typeof v !== "object" || Array.isArray(v))
    return "Estratégia inválida.";
  const e = v as Estrategia;
  const texto = (x: unknown, max = 10000): x is string =>
    typeof x === "string" && x.length <= max;
  const numero = (x: unknown): x is number =>
    typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 1e12;
  const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
  if (
    !texto(e.foco, 80) ||
    (e.foco && !FOCOS.includes(e.foco as (typeof FOCOS)[number])) ||
    !texto(e.hipotese) ||
    !texto(e.indicadorPersonalizado, 120)
  )
    return "Confira o objetivo e a hipótese.";
  if (e.indicador !== "" && !Object.hasOwn(INDICADORES, e.indicador))
    return "Indicador inválido.";
  if (
    e.alvo !== null &&
    (!numero(e.alvo) || (e.indicador !== "margem" && e.alvo < 0))
  )
    return "Meta numérica inválida.";
  if ((e.alvo !== null || e.medicao?.valor !== null) && !e.indicador)
    return "Escolha o indicador da meta e do resultado.";
  if (e.indicador === "personalizado" && !e.indicadorPersonalizado.trim())
    return "Dê um nome ao indicador.";
  if (
    !Array.isArray(e.anuncios) ||
    e.anuncios.length > 500 ||
    e.anuncios.some((a) => typeof a !== "string" || !uuid.test(a))
  )
    return "Seleção de anúncios inválida.";
  if (
    !Array.isArray(e.execucoes) ||
    e.execucoes.length > 100 ||
    new Set(e.execucoes.map((x) => x?.destino)).size !== e.execucoes.length
  )
    return "Registros de execução inválidos.";
  for (const x of e.execucoes) {
    if (
      !x ||
      !texto(x.destino, 50) ||
      !(
        x.destino === "geral" || /^(canal|conta):[\da-f-]{36}$/i.test(x.destino)
      ) ||
      !EXECUCOES.includes(x.situacao) ||
      !texto(x.mudancas) ||
      !texto(x.evidencia, 2000)
    )
      return "Confira a execução por canal.";
    if (
      !texto(x.inicio, 10) ||
      !texto(x.fim, 10) ||
      (x.inicio && !dataValida(x.inicio)) ||
      (x.fim && (!dataValida(x.fim) || !x.inicio || x.fim < x.inicio))
    )
      return "Confira as datas reais da execução.";
    if (["Em execução", "Executada"].includes(x.situacao) && !x.inicio)
      return "Informe quando a execução começou.";
    if (x.situacao === "Executada" && !x.fim)
      return "Informe quando a execução terminou.";
    if (x.evidencia && !/^https?:\/\//i.test(x.evidencia))
      return "O link da evidência deve começar com https:// ou http://.";
  }
  const m = e.medicao,
    f = e.fechamento;
  if (
    !m ||
    !texto(m.fonte, 2000) ||
    !texto(m.data, 10) ||
    (m.data && !dataValida(m.data)) ||
    (m.valor !== null &&
      (!numero(m.valor) || (e.indicador !== "margem" && m.valor < 0)))
  )
    return "Confira o resultado informado.";
  if (m.valor !== null && (!m.fonte.trim() || !m.data))
    return "Informe a fonte e a data do resultado manual.";
  if (
    !f ||
    !texto(f.funcionou) ||
    !texto(f.problemas) ||
    !texto(f.proximoPasso) ||
    !texto(f.decisao, 40) ||
    (f.decisao && !DECISOES.includes(f.decisao as (typeof DECISOES)[number]))
  )
    return "Confira o aprendizado da campanha.";
  return null;
}
