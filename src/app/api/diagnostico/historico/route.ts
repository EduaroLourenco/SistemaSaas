import { NextRequest } from "next/server";
import { meliGet, vendedor } from "@/lib/meli/cliente";
import { comMeli, contaDaQuery } from "@/lib/meli/rota";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Descobre até onde a API tem histórico, sondando de verdade.
 *
 * Cada endpoint do canal tem uma retenção diferente, e a documentação nem
 * sempre diz qual. Em vez de chutar, isto pergunta: faz uma consulta de um
 * dia em janelas cada vez mais antigas e vê a partir de quando para de vir
 * resposta útil.
 *
 * Roda sob demanda, não em rotina — são poucas chamadas, mas não é algo
 * para ficar repetindo.
 *
 * GET /api/diagnostico/historico?conta=principal
 */

/** Meses atrás que serão sondados. */
const SONDAS = [1, 3, 6, 12, 18, 24, 36];

function mesesAtras(n: number) {
  const hoje = new Date();
  const d = new Date(
    Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - n, 15)
  );
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const conta = contaDaQuery(new URL(req.url));

  return comMeli(async () => {
    const v = await vendedor(conta);

    type Sonda = {
      mesesAtras: number;
      data: string;
      pedidos: { ok: boolean; total: number | null; erro?: string };
      visitas: { ok: boolean; total: number | null; erro?: string };
    };

    const sondas: Sonda[] = [];

    for (const meses of SONDAS) {
      const dia = mesesAtras(meses);

      // Pedidos: pergunta só o total, sem baixar as linhas.
      let pedidos: Sonda["pedidos"];
      try {
        const qs = new URLSearchParams({
          seller: String(v.id),
          offset: "0",
          limit: "1",
          "order.date_created.from": `${dia}T00:00:00.000-03:00`,
          "order.date_created.to": `${dia}T23:59:59.999-03:00`,
        });
        const r = await meliGet<{ paging?: { total?: number } }>(
          `/orders/search?${qs}`,
          conta
        );
        pedidos = { ok: true, total: r.paging?.total ?? 0 };
      } catch (e) {
        pedidos = {
          ok: false,
          total: null,
          erro: e instanceof Error ? e.message : "falhou",
        };
      }

      // Visitas: mesma ideia, janela de um dia.
      let visitas: Sonda["visitas"];
      try {
        const qs = new URLSearchParams({
          date_from: dia,
          date_to: dia,
          limit: "1",
        });
        const r = await meliGet<{ total_visits?: number }>(
          `/users/${encodeURIComponent(String(v.id))}/items_visits?${qs}`,
          conta
        );
        visitas = { ok: true, total: r.total_visits ?? 0 };
      } catch (e) {
        visitas = {
          ok: false,
          total: null,
          erro: e instanceof Error ? e.message : "falhou",
        };
      }

      sondas.push({ mesesAtras: meses, data: dia, pedidos, visitas });
    }

    // A leitura em uma frase, para não obrigar a interpretar a tabela.
    const pedidoMaisAntigo = [...sondas]
      .reverse()
      .find((s) => s.pedidos.ok && (s.pedidos.total ?? 0) > 0);
    const visitaMaisAntiga = [...sondas]
      .reverse()
      .find((s) => s.visitas.ok && (s.visitas.total ?? 0) > 0);

    return {
      vendedor: { id: v.id, apelido: v.nickname },
      leitura: {
        pedidos: pedidoMaisAntigo
          ? `Achei pedidos até ${pedidoMaisAntigo.mesesAtras} meses atrás (${pedidoMaisAntigo.data}).`
          : "Não achei pedido em nenhuma das janelas sondadas — ou não houve venda nesses dias, ou a retenção é menor que 1 mês.",
        visitas: visitaMaisAntiga
          ? `Achei visitas até ${visitaMaisAntiga.mesesAtras} meses atrás (${visitaMaisAntiga.data}).`
          : "Não achei visita em nenhuma janela — a retenção de visitas costuma ser bem menor que a de pedidos.",
        preco:
          "Preço da vitrine não tem histórico na API: só o valor de agora. O histórico é construído pelo retrato semanal, daqui para frente.",
      },
      // Uma sonda de um dia só. Dia sem venda dá zero mesmo com retenção ok,
      // então zero não prova ausência — mas um número > 0 prova presença.
      aviso:
        "Cada sonda olha UM dia. Total zero pode ser dia sem venda, não falta de histórico. Valor acima de zero é prova de que aquele período está acessível.",
      sondas,
    };
  }, conta);
}
