import "server-only";
import { sincronizarMeli } from "@/lib/meli/sincronizar";
import { anunciante, gravarGastoDiario, sincronizarAds } from "@/lib/meli/ads";
import { capturarPrecosDeVenda } from "@/lib/meli/precos";
import { appConfigurado as meliConfigurado, contaConectada } from "@/lib/meli/cliente";
import { lojasVtex, vtexConectada } from "@/lib/vtex/cliente";
import { sincronizarVtex } from "@/lib/vtex/sincronizar";
import { integracaoDaOperacao, integracoesDoProvedor, registrarErro } from "@/lib/integracoes/cofre";
import { estoqueMeli } from "@/lib/meli/estoque";
import { estoqueBling } from "@/lib/bling/estoque";
import { PROVEDOR as BLING, appConfigurado as blingConfigurado } from "@/lib/bling/cliente";
import { sincronizarBling } from "@/lib/bling/sincronizar";
import { PROVEDOR as GA4, appConfigurado as ga4Configurado } from "@/lib/ga4/cliente";
import { sincronizarGa4 } from "@/lib/ga4/sincronizar";
import { atualizarEnvios } from "@/lib/dados/envios-meli";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { BLOCOS, type Bloco } from "@/lib/atualizacao-blocos";

export { BLOCOS, type Bloco };

export type ResultadoEtapa = { detalhe: string; avisos?: string[]; continuacao?: number };
export type Origem = "manual" | "agendada";
export type Etapa = {
  id: string;
  bloco: Bloco;
  fonte: string;
  executar: (pagina: number, origem: Origem) => Promise<ResultadoEtapa>;
};

function diaSP(desloc = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() + desloc * 86_400_000)
  );
}

/** Cada etapa roda numa chamada própria do servidor, que corta em 300s. */
const PRAZO_ETAPA_MS = 240_000;

/**
 * As etapas de cada bloco, para UMA empresa.
 *
 * Só monta: nenhuma API é chamada aqui além de conferir se a conta está
 * conectada. Usa o cliente privilegiado, porque quem chama é a fila — que
 * roda sem usuário logado, tanto no pedido manual quanto no agendado.
 */
export async function planejarAtualizacao(operacaoId: string, blocos: readonly Bloco[]): Promise<Etapa[]> {
  const quer = new Set(blocos);
  const ate = diaSP();
  const etapas: Etapa[] = [];
  const [meli, vtex, bling, ga4] = await Promise.all([
    meliConfigurado() ? integracoesDoProvedor("mercado_livre", operacaoId) : [],
    lojasVtex(operacaoId),
    blingConfigurado() ? integracaoDaOperacao(BLING, operacaoId) : null,
    ga4Configurado() ? integracoesDoProvedor(GA4, operacaoId) : [],
  ]);

  const add = (bloco: Bloco, id: string, fonte: string, executar: Etapa["executar"]) => {
    if (quer.has(bloco)) etapas.push({ id: `${bloco}:${id}`, bloco, fonte, executar });
  };

  for (const c of meli) {
    if (!c.ref || !(await contaConectada(c.contaCanalId))) continue;
    const conta = c.contaCanalId;
    const nome = c.nome;
    const pedidos = (dias: number) => async (_: number, origem: Origem) => {
      const r = await sincronizarMeli({
        conta, de: diaSP(-dias), ate, diasVisitas: 1,
        etapas: { catalogo: false, pedidos: true, visitas: false, diarias: true, disputa: false, promocoes: false },
        registro: { origem },
      });
      return r;
    };

    add("vendas", `meli:${conta}`, `Vendas · ${nome}`, async (p, origem) => {
      const r = await pedidos(1)(p, origem);
      /* O gasto de mídia de HOJE entra junto, para o ACOS do dia sair com as
         vendas do dia. O detalhe por anúncio fica no bloco Publicidade. */
      const avisos = [...r.avisos];
      try {
        const adv = await anunciante(conta);
        if (adv) await gravarGastoDiario(conta, adv, ate, ate, { operacaoId: r.operacaoId, contaCanalId: r.contaCanalId }, 1);
      } catch {
        avisos.push("Gasto de publicidade de hoje não veio; as vendas foram atualizadas.");
      }
      return { detalhe: `${r.pedidos.gravados} pedidos`, avisos };
    });
    add("financeiro", `meli:${conta}`, `Financeiro · ${nome}`, async (p, origem) => {
      const r = await pedidos(7)(p, origem);
      return { detalhe: `${r.pedidos.gravados} pedidos revisados`, avisos: r.avisos };
    });
    /* Duas etapas: juntas, catálogo + disputa + promoções da conta a prazo
       levaram 236s, colado no corte de 300s do servidor. */
    add("anuncios", `meli:${conta}`, `Anúncios · ${nome}`, async (_, origem) => {
      const r = await sincronizarMeli({
        conta, de: ate, ate, diasVisitas: 1,
        etapas: { catalogo: true, pedidos: false, visitas: false, diarias: false, disputa: true, promocoes: false },
        registro: { origem },
      });
      return { detalhe: `${r.anuncios.gravados} anúncios`, avisos: r.avisos };
    });
    add("anuncios", `meli-promocoes:${conta}`, `Promoções · ${nome}`, async (_, origem) => {
      const r = await sincronizarMeli({
        conta, de: ate, ate, diasVisitas: 1,
        etapas: { catalogo: false, pedidos: false, visitas: false, diarias: false, disputa: false, promocoes: true },
        registro: { origem },
      });
      return { detalhe: `${r.promocoes.campanhas} promoções, ${r.promocoes.itens} itens`, avisos: r.avisos };
    });
    add("visitas", `meli:${conta}`, `Visitas · ${nome}`, async (_, origem) => {
      const r = await sincronizarMeli({
        conta, de: diaSP(-1), ate, diasVisitas: 3,
        etapas: { catalogo: false, pedidos: false, visitas: true, diarias: true, disputa: false, promocoes: false },
        registro: { origem },
      });
      const avisos = [...r.avisos];
      if (r.visitas.falharam) avisos.push(`${r.visitas.falharam} anúncios sem visitas nesta leitura.`);
      return { detalhe: `${r.visitas.linhas} registros de visitas`, avisos };
    });
    add("precos", `meli:${conta}`, `Preços · ${nome}`, async (pagina) => {
      // Primeira passada relê tudo; a continuação só completa quem faltou.
      const r = await capturarPrecosDeVenda(conta, Date.now() + PRAZO_ETAPA_MS, pagina === 0);
      return {
        detalhe: `${r.gravados} preços lidos`,
        avisos: r.falharam ? [`${r.falharam} anúncios sem preço nesta leitura.`] : [],
        continuacao: r.semTempo > 0 && r.gravados > 0 ? pagina + 1 : undefined,
      };
    });
    add("estoque", `meli:${conta}`, `Estoque · ${nome}`, (pagina) => estoqueMeli(c, pagina));
    add("publicidade", `meli:${conta}`, `Publicidade · ${nome}`, async () => {
      const r = await sincronizarAds(conta, { de: diaSP(-29), ate, operacaoId, contaCanalId: conta });
      return { detalhe: r ? `${r.campanhas} campanhas, ${r.gravados} anúncios` : "Conta sem publicidade" };
    });
  }

  if (meli.some((c) => c.ref)) {
    add("envios", "meli", "Envios · Mercado Livre", async () => {
      const r = await atualizarEnvios(operacaoId);
      return {
        detalhe: `${r.envios.length} pedidos para enviar`,
        avisos: r.falhas.map((f) => `${f.conta}: ${f.motivo}`),
      };
    });
  }

  for (const c of vtex) {
    if (!(await vtexConectada(c.id))) continue;
    for (const [bloco, dias] of [["vendas", 1], ["financeiro", 7]] as const) {
      add(bloco, `vtex:${c.id}`, `${bloco === "vendas" ? "Vendas" : "Financeiro"} · ${c.nome}`, async () => {
        const r = await sincronizarVtex({ de: diaSP(-dias), ate, conta: c.id });
        return { detalhe: `${r.pedidos.gravados} pedidos` };
      });
    }
  }

  if (bling?.ref) {
    for (const [bloco, dias] of [["vendas", 1], ["financeiro", 7]] as const) {
      add(bloco, `bling:${bling.id}`, `${bloco === "vendas" ? "Vendas" : "Financeiro"} · Bling`, async () => {
        try {
          const r = await sincronizarBling(bling, diaSP(-dias), ate);
          const pendentes = Object.values(r.pendentes).reduce((s, p) => s + p.pedidos, 0);
          return {
            detalhe: `${r.pedidos} pedidos`,
            avisos: pendentes ? [`${pendentes} pedidos aguardam a associação de lojas na aba ERP.`] : [],
          };
        } catch (e) {
          const msg = (e as Error).message.slice(0, 500);
          await clientePrivilegiado().from("integracoes").update({ ultimo_erro: msg }).eq("id", bling.id);
          throw e;
        }
      });
    }
    add("estoque", `bling:${bling.id}`, "Estoque · Bling", (pagina) => estoqueBling(bling, pagina));
  }

  for (const i of ga4) {
    if (!i.ref || !i.config.propriedade) continue;
    add("visitas", `ga4:${i.id}`, `Visitas do site · ${i.nome}`, async () => {
      try {
        const r = await sincronizarGa4(i, diaSP(-4), ate);
        return { detalhe: `${r.dias} dias de sessões`, avisos: r.avisos };
      } catch (e) {
        await registrarErro(GA4, i.contaCanalId, (e as Error).message);
        throw e;
      }
    });
  }

  // A ordem da lista de blocos é a ordem de execução: vendas primeiro.
  const ordem = new Map(BLOCOS.map((b, k) => [b.id, k]));
  return etapas.sort((a, b) => ordem.get(a.bloco)! - ordem.get(b.bloco)!);
}
