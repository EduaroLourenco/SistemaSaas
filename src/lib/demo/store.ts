export type DemoState = {
  custos: Record<string, Record<string, unknown>>;
  comissoes: unknown[];
  planejamento: { itens: unknown[] | null; grupos: unknown[] | null; tipos: unknown[] | null };
  regras: unknown[] | null;
  promocoes: { fila: unknown[] | null; processamentos: unknown[]; historico: unknown[]; campanhas: unknown[]; piso?: { usarComoPiso: boolean; toleranciaPct: number }; folgas?: Record<string, number> };
  exclusoes: string[];
  metas: Record<string, unknown>;
  enviosImpressos: string[];
  faixasFrete?: unknown[];
  despesasCanal?: unknown[];
};

const CHAVE = "gerizo-demo-real-v1";
export const EVENTO_DEMO = "gerizo:demo-dados";
let memoria: DemoState | null = null;
const inicial = (): DemoState => ({ custos: {}, comissoes: [], planejamento: { itens: null, grupos: null, tipos: null }, regras: null, promocoes: { fila: null, processamentos: [], historico: [], campanhas: [] }, exclusoes: [], metas: {}, enviosImpressos: [] });

/** Só o cenário fictício desta aba. Nunca recebe sessão, conta ou dados reais. */
export function getDemoState(): DemoState {
  if (typeof window === "undefined") return inicial();
  if (!memoria) {
    try {
      const salvo = JSON.parse(sessionStorage.getItem(CHAVE) ?? "null");
      memoria = salvo && typeof salvo === "object" ? { ...inicial(), ...salvo } : inicial();
    } catch { memoria = inicial(); }
  }
  return memoria!;
}

export function updateDemoState(atualizar: (estado: DemoState) => DemoState | void, notificar = false): DemoState {
  if (typeof window === "undefined") throw new Error("A simulação só altera dados no navegador.");
  const copia = structuredClone(getDemoState());
  memoria = atualizar(copia) ?? copia;
  try { sessionStorage.setItem(CHAVE, JSON.stringify(memoria)); } catch { /* memória mantém a simulação disponível */ }
  if (notificar) window.dispatchEvent(new Event(EVENTO_DEMO));
  return memoria;
}

export function resetDemoState() {
  if (typeof window === "undefined") return;
  memoria = inicial();
  try { sessionStorage.removeItem(CHAVE); } catch {}
  window.dispatchEvent(new Event(EVENTO_DEMO));
}
