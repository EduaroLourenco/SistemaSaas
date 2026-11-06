import { analisar, type Anuncio, type AnuncioAnalisado } from "./analise";

export const FILAS = [
  { id: "todos", nome: "Todos" },
  { id: "estoque", nome: "Sem estoque" },
  { id: "abaixo_tabela", nome: "Abaixo da tabela" },
  { id: "nao_fecha", nome: "Baixa conversão" },
  { id: "converte_bem", nome: "Poucas visitas" },
  { id: "acima_tabela", nome: "Acima da tabela" },
  { id: "sem_historico", nome: "Sem histórico" },
  { id: "sem_tabela", nome: "Sem referência" },
] as const;
export type FilaAnuncios = typeof FILAS[number]["id"];

export function prepararAnuncios(anuncios: Anuncio[], semanas: string[]) {
  const noRecorte = new Set(semanas);
  const medidos = anuncios.filter(a => a.semanas.some(s => noRecorte.has(s.semana)));
  const ids = new Set(medidos.map(a => a.mlb));
  // Ausência de coleta não entra como zero nas médias que classificam a carteira.
  const calculados = analisar(medidos, semanas).itens;
  const ausentes = anuncios.filter(a => !ids.has(a.mlb)).map(a => ({
    ...analisar([{ ...a, semanas: [] }], semanas).itens[0], lentes: ["todos"] as AnuncioAnalisado["lentes"], motivos: {},
  }));
  return [...calculados, ...ausentes];
}

export function pertenceFila(a: AnuncioAnalisado, fila: FilaAnuncios): boolean {
  if (fila === "todos") return true;
  if (fila === "estoque") return a.status === "ativo" && a.estoque === 0;
  if (fila === "sem_historico") return a.semanas.length === 0;
  if (fila === "sem_tabela") return !(a.precoReferencia || a.metricas.precoIdeal);
  return a.status === "ativo" && a.semanas.length > 0 && a.lentes.includes(fila);
}

export function sinalAnuncio(a: AnuncioAnalisado): { texto: string; tom: "down" | "warn" | "neutral" | "up" } {
  if (a.status !== "ativo") return { texto: a.status === "pausado" ? "Pausado" : "Finalizado", tom: "neutral" };
  if (a.estoque === 0) return { texto: "Sem estoque", tom: "down" };
  if (!a.semanas.length) return { texto: "Sem histórico", tom: "neutral" };
  if (a.lentes.includes("abaixo_tabela")) return { texto: "Abaixo da tabela", tom: "warn" };
  if (a.lentes.includes("nao_fecha")) return { texto: "Baixa conversão", tom: "warn" };
  if (a.lentes.includes("converte_bem")) return { texto: "Poucas visitas", tom: "up" };
  if (a.lentes.includes("acima_tabela")) return { texto: "Acima da tabela", tom: "neutral" };
  if (!(a.precoReferencia || a.metricas.precoIdeal)) return { texto: "Sem referência", tom: "neutral" };
  return { texto: "Com histórico", tom: "neutral" };
}

export function resumoAnuncios(itens: AnuncioAnalisado[]) {
  const medidos = itens.filter(a => a.semanas.length > 0);
  const receita = medidos.reduce((s,a) => s+a.metricas.receita,0);
  const vendas = medidos.reduce((s,a) => s+a.metricas.vendas,0);
  const visitas = medidos.reduce((s,a) => s+a.metricas.visitas,0);
  const comVisita = medidos.reduce((s,a) => s+a.semanas.reduce((t,w) => t+(w.vendasComVisita ?? w.vendas),0),0);
  return { receita, vendas, visitas, medidos: medidos.length, conversao: visitas > 0 ? comVisita/visitas*100 : null };
}
