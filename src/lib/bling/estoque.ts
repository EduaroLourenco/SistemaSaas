import "server-only";
import { bling } from "./cliente";
import type { Integracao } from "@/lib/integracoes/cofre";
import { gravarEstoques, registrarFalhaEstoque } from "@/lib/estoques/gravar";
import { saldoBling, type LocalEstoque, type SaldoEstoque } from "@/lib/estoques/tipos";

type Deposito = { id: number; descricao: string; situacao: number; desconsiderarSaldo?: boolean };
type Produto = { id: number; codigo?: string; nome: string; tipo?: string; formato?: string };
type Saldo = { produto: { id: number }; saldoFisicoTotal?: number; saldoVirtualTotal?: number };
const TAMANHO = 50;

export async function estoqueBling(integ: Integracao, pagina = 0) {
  try {
    const depositos = new Map<number, Deposito>();
    for (const situacao of [1, 0]) {
      for (let p = 1; ; p++) {
        const r = await bling<{ data?: Deposito[] }>(integ, "/depositos", { pagina: p, limite: 100, situacao });
        for (const d of r.data ?? []) depositos.set(d.id, d);
        if ((r.data?.length ?? 0) < 100) break;
      }
    }
    const locais: LocalEstoque[] = [...depositos.values()].map((d) => ({ id: String(d.id), nome: d.descricao, tipo: "deposito_erp", ativo: d.situacao === 1 }));
    const r = await bling<{ data?: Produto[] }>(integ, "/produtos", { pagina: pagina + 1, limite: TAMANHO, criterio: 5, tipo: "T" });
    const produtos = (r.data ?? []).filter((p) => p.tipo === "P" && p.formato !== "V");
    const saldos: SaldoEstoque[] = [];
    for (const local of locais) {
      const porProduto = new Map<number, Saldo>();
      if (produtos.length) {
        // O padrão da API é saldo positivo. Consultar os três filtros inclui
        // explicitamente o zero e o negativo, sem inventar zero para ausentes.
        for (const filtroSaldoEstoque of [0, 1, 2]) {
          const s = await bling<{ data?: Saldo[] }>(integ, `/estoques/saldos/${local.id}`, {
            "idsProdutos[]": produtos.map((p) => p.id), filtroSaldoEstoque,
          });
          for (const x of s.data ?? []) porProduto.set(x.produto.id, x);
        }
      }
      for (const p of produtos) saldos.push(saldoBling(p, local, porProduto.get(p.id)));
    }
    const continuacao = (r.data?.length ?? 0) === TAMANHO ? pagina + 1 : undefined;
    const avisos = saldos.some((s) => s.disponivel == null) ? ["Alguns produtos não tiveram saldo retornado. Eles aparecem como não informado, sem substituir ausência por zero."] : [];
    await gravarEstoques(integ, "bling", "erp", saldos, locais, pagina, continuacao, avisos);
    return { detalhe: `${produtos.length} produtos · ${locais.length} depósitos · lote ${pagina + 1}`, avisos, continuacao };
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Falha ao consultar estoque do Bling.";
    await registrarFalhaEstoque(integ, "bling", erro);
    throw e;
  }
}
