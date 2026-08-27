import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { carregarBaseVendas } from "./vendas";
import { paginar } from "./paginar";

/**
 * Metas mensais por canal, confrontadas com o realizado.
 *
 * A tabela `metas` existe e está vazia: as 11 colunas "Meta (R$)" da
 * planilha de KPIs vieram em branco. O importador já lê essas colunas —
 * no dia em que forem preenchidas, esta tela acende sozinha.
 *
 * Enquanto isso ela mostra o realizado sem alvo, em vez de um alvo
 * inventado: meta vira linha de referência no gráfico, e ninguém
 * desconfia de uma linha de referência.
 */

export type MetaMes = {
  canalId: string;
  canal: string;
  cor: string;
  mes: number;
  meta: number;
  realizado: number;
  pedidos: number;
};

export type DadosMetas = {
  linhas: MetaMes[];
  canais: { id: string; nome: string; cor: string }[];
  ano: number;
  temMeta: boolean;
  vazio: boolean;
};

export async function carregarMetas(): Promise<DadosMetas> {
  const sb = await clienteServidor();
  const [base, metas] = await Promise.all([
    carregarBaseVendas(),
    paginar(() => sb.from("metas").select("canal_id,ano,mes,receita_meta")),
  ]);

  if (base.vazio) {
    return { linhas: [], canais: [], ano: base.ano, temMeta: false, vazio: true };
  }

  const { data: canaisBanco } = await sb.from("canais").select("id,nome");
  const nomePorId = new Map((canaisBanco ?? []).map((c) => [c.id as string, c.nome as string]));

  const porChave = new Map<string, number>();
  for (const m of metas) {
    if (Number(m.ano) !== base.ano) continue;
    const nome = nomePorId.get(m.canal_id as string);
    if (!nome) continue;
    porChave.set(`${nome}|${m.mes}`, Number(m.receita_meta) || 0);
  }

  const acc = new Map<string, MetaMes>();
  for (const l of base.linhas) {
    if (Number(l.data.slice(0, 4)) !== base.ano) continue;
    const mes = Number(l.data.slice(5, 7));
    const k = `${l.canalId}|${mes}`;
    const info = base.canais.find((c) => c.id === l.canalId);
    const g =
      acc.get(k) ?? {
        canalId: l.canalId,
        canal: l.canal,
        cor: info?.cor ?? "var(--s1)",
        mes,
        // A meta é buscada pelo NOME do canal: a linha de vendas guarda a
        // conta ("Mercado Livre — São Paulo") e a meta guarda o canal.
        meta: porChave.get(`${l.canal.split(" — ")[0]}|${mes}`) ?? 0,
        realizado: 0,
        pedidos: 0,
      };
    g.realizado += l.receita;
    g.pedidos += l.pedidos;
    acc.set(k, g);
  }

  const linhas = [...acc.values()].sort((a, b) => a.mes - b.mes || a.canal.localeCompare(b.canal));

  return {
    linhas,
    canais: base.canais,
    ano: base.ano,
    temMeta: linhas.some((l) => l.meta > 0),
    vazio: false,
  };
}
