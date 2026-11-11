import type { Bloco } from "@/lib/atualizacao-blocos";

export type EtapaAtualizacao = {
  id: string;
  bloco: Bloco;
  fonte: string;
  estado: "aguardando" | "atualizando" | "concluida" | "falhou";
  detalhe?: string;
  avisos?: string[];
  fim?: string;
};
export type PedidoAtualizacao = {
  id: string;
  blocos: Bloco[];
  etapas: EtapaAtualizacao[];
  criadoEm: string;
  ativo: boolean;
};
export type EstadoAtualizacao = {
  carregado: boolean;
  enviando: boolean;
  empresa?: string;
  ultima: Partial<Record<Bloco, { em: string; falhou: boolean }>>;
  pedido: PedidoAtualizacao | null;
  erro?: string;
};
export const estadoInicial: EstadoAtualizacao = { carregado: false, enviando: false, ultima: {}, pedido: null };

/**
 * O navegador só PEDE e OLHA. Quem atualiza é o servidor (a fila em
 * `/api/cron/fila`), então fechar a aba ou bloquear o celular não para
 * nada: ao voltar, a leitura mostra o que já rodou.
 */
export function criarAtualizador(requisitar: typeof fetch = (...args) => fetch(...args)) {
  let estado = estadoInicial;
  let relogio: ReturnType<typeof setTimeout> | null = null;
  const ouvintes = new Set<() => void>();
  const aoTerminar = new Set<() => void>();
  const publicar = (novo: Partial<EstadoAtualizacao>) => {
    estado = { ...estado, ...novo };
    ouvintes.forEach((f) => f());
  };

  async function ler() {
    try {
      const r = await requisitar("/api/atualizar", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) throw new Error(j?.erro ?? "Não foi possível ler a atualização.");
      const antes = estado.pedido?.ativo;
      publicar({ carregado: true, empresa: j.operacao?.nome, ultima: j.ultima ?? {}, pedido: j.pedido ?? null, erro: undefined });
      if (antes && !j.pedido?.ativo) aoTerminar.forEach((f) => f());
    } catch (e) {
      publicar({ carregado: true, erro: e instanceof Error ? e.message : "Sem conexão." });
    }
    agendar();
  }

  // Enquanto há pedido andando, relê a cada 4s; parado, não gasta nada.
  function agendar() {
    if (relogio) clearTimeout(relogio);
    relogio = estado.pedido?.ativo ? setTimeout(ler, 4000) : null;
  }

  async function pedir(blocos: Bloco[]) {
    publicar({ enviando: true, erro: undefined });
    try {
      const r = await requisitar("/api/atualizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocos }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.pedido) throw new Error(j?.erro ?? "Não foi possível pedir a atualização.");
      publicar({ pedido: j.pedido });
      agendar();
    } catch (e) {
      publicar({ erro: e instanceof Error ? e.message : "Sem conexão." });
    } finally {
      publicar({ enviando: false });
    }
  }

  return {
    ler: () => estado,
    assinar: (ouvinte: () => void) => { ouvintes.add(ouvinte); return () => { ouvintes.delete(ouvinte); }; },
    /** Primeira leitura de quem monta a tela; as seguintes ficam por conta do relógio. */
    carregar: () => { if (!estado.carregado) void ler(); },
    recarregar: () => void ler(),
    pedir,
    aoTerminar: (f: () => void) => { aoTerminar.add(f); return () => { aoTerminar.delete(f); }; },
  };
}

export const atualizador = criarAtualizador();
