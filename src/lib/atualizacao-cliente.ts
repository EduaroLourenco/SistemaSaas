export type EtapaAtualizacao = {
  id: string;
  fonte: string;
  estado: "aguardando" | "atualizando" | "concluida" | "falhou" | "interrompida";
  detalhe?: string;
  avisos?: string[];
};
export type EstadoAtualizacao = {
  rodando: boolean;
  iniciou: boolean;
  empresa?: string;
  etapas: EtapaAtualizacao[];
  erro?: string;
};
export const estadoInicial: EstadoAtualizacao = { rodando: false, iniciou: false, etapas: [] };

/** Uma execução por aba, compartilhada pelo cabeçalho e por Fontes de dados. */
export function criarAtualizador(requisitar: typeof fetch = (...args) => fetch(...args)) {
  let estado = estadoInicial;
  let execucao: Promise<void> | null = null;
  const ouvintes = new Set<() => void>();
  const publicar = (novo: Partial<EstadoAtualizacao>) => {
    estado = { ...estado, ...novo };
    ouvintes.forEach((f) => f());
  };
  const mudarEtapa = (id: string, mudar: Partial<EtapaAtualizacao>) => {
    publicar({ etapas: estado.etapas.map((e) => e.id === id ? { ...e, ...mudar } : e) });
  };

  async function rodar() {
    publicar({ ...estadoInicial, rodando: true, iniciou: true, empresa: undefined, erro: undefined });
    try {
      const resp = await requisitar("/api/atualizar", { cache: "no-store" });
      const plano = await resp.json().catch(() => null);
      if (!resp.ok || !plano?.operacao?.id || !Array.isArray(plano.etapas)) {
        throw new Error(plano?.erro ?? "Não foi possível consultar as fontes. Tente novamente.");
      }
      publicar({ empresa: plano.operacao.nome, etapas: plano.etapas.map((e: { id: string; fonte: string }) => ({ ...e, estado: "aguardando" })) });
      let interromper = false;
      for (const e of estado.etapas) {
        mudarEtapa(e.id, { estado: "atualizando" });
        try {
          let pagina = 0;
          const avisos = new Set<string>();
          while (true) {
          const resposta = await requisitar("/api/atualizar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operacaoId: plano.operacao.id, etapa: e.id, pagina }),
          });
          const r = await resposta.json().catch(() => null);
          if (!resposta.ok || !r) {
            const detalhe = r?.erro ?? "Não foi possível confirmar esta etapa. Tente novamente ao final.";
            mudarEtapa(e.id, { estado: "falhou", detalhe });
            // Troca de empresa, sessão expirada ou permissão revogada: não seguir gravando.
            if ([401, 403, 409].includes(resposta.status)) {
              publicar({ erro: detalhe, etapas: estado.etapas.map((x) => x.estado === "aguardando" ? { ...x, estado: "interrompida" } : x) });
              interromper = true;
            }
            break;
          } else {
            (r.avisos ?? []).forEach((a: string) => avisos.add(a));
            const continua = Number.isInteger(r.continuacao) && r.continuacao > pagina && r.continuacao <= 10000;
            mudarEtapa(e.id, { estado: continua ? "atualizando" : "concluida", detalhe: r.detalhe, avisos: [...avisos] });
            if (!continua) break;
            pagina = r.continuacao;
          }
          }
        } catch {
          mudarEtapa(e.id, { estado: "falhou", detalhe: "A conexão caiu. Não foi possível confirmar esta etapa." });
        }
        if (interromper) break;
      }
    } catch (e) {
      publicar({ erro: e instanceof Error ? e.message : "Não foi possível conectar ao servidor." });
    } finally {
      publicar({ rodando: false });
    }
  }

  return {
    ler: () => estado,
    assinar: (ouvinte: () => void) => { ouvintes.add(ouvinte); return () => { ouvintes.delete(ouvinte); }; },
    executar: () => {
      if (!execucao) execucao = rodar().finally(() => { execucao = null; });
      return execucao;
    },
  };
}

export const atualizador = criarAtualizador();
