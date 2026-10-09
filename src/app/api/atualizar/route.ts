import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { contasMeli } from "@/lib/meli/rota";
import { sincronizarMeli } from "@/lib/meli/sincronizar";
import { appConfigurado as meliConfigurado } from "@/lib/meli/cliente";
import { lojasVtex, vtexConectada } from "@/lib/vtex/cliente";
import { sincronizarVtex } from "@/lib/vtex/sincronizar";
import { integracaoDaOperacao, integracoesDoProvedor } from "@/lib/integracoes/cofre";
import { PROVEDOR as BLING, appConfigurado as blingConfigurado } from "@/lib/bling/cliente";
import { sincronizarBling } from "@/lib/bling/sincronizar";
import { PROVEDOR as GA4, appConfigurado as ga4Configurado } from "@/lib/ga4/cliente";
import { sincronizarGa4 } from "@/lib/ga4/sincronizar";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * "Atualizar agora" — a mesma leitura do agendamento, pedida por gente.
 *
 * POST /api/atualizar
 *
 * O agendamento roda à 01h e às 13h. Entre um e outro o número na tela é
 * do último turno, e quem está decidindo preço às 10h da manhã quer o de
 * agora. Esta rota é esse botão: passa por toda fonte conectada DA EMPRESA
 * ESCOLHIDA e relê a janela curta.
 *
 * ── O que ela não faz ──
 *
 * Visitas. Uma conta de Mercado Livre são ~430 anúncios a 4 chamadas por
 * segundo: quase dois minutos só nisso, e com duas contas o tempo da
 * função acaba antes de o Bling e a VTEX serem lidos. Visita é métrica de
 * dia fechado e o turno da madrugada já a traz; pedido, estoque e preço
 * mudam durante o dia e são o que o botão busca.
 *
 * ── Por que POST ──
 *
 * Escreve, e gasta cota de API compartilhada. GET seria pré-carregado por
 * navegador e acelerador de link, disparando a leitura sem ninguém clicar.
 */

/** Dias relidos. Pedido muda de situação depois de criado (cancelamento). */
const DIAS = 2;

function diaSP(desloc = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() + desloc * 86_400_000)
  );
}

type Fonte = { fonte: string; ok: boolean; detalhe?: string; erro?: string };

export async function POST() {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }

  const op = await operacaoPadrao();
  if (!op) return NextResponse.json({ erro: "Nenhuma empresa escolhida." }, { status: 409 });

  /* Ler é de todo mundo; disparar leitura de API, não. Quem decide é o
     banco, com a mesma função que as outras rotas de escrita usam. */
  const { data: podeEditar } = await sb.rpc("pode_editar_operacao", { op: op.id });
  if (!podeEditar) {
    return NextResponse.json({ erro: "Seu acesso é de leitura." }, { status: 403 });
  }

  const de = diaSP(-DIAS);
  const ate = diaSP();
  const comecou = Date.now();
  const fontes: Fonte[] = [];

  /** Uma fonte que falha não pode impedir a próxima de atualizar. */
  const tentar = async (fonte: string, acao: () => Promise<string>) => {
    try {
      fontes.push({ fonte, ok: true, detalhe: await acao() });
    } catch (e) {
      fontes.push({ fonte, ok: false, erro: e instanceof Error ? e.message : String(e) });
    }
  };

  // ── Mercado Livre: uma conta por vez ──
  if (meliConfigurado()) {
    for (const c of (await contasMeli()).filter((c) => c.conectada)) {
      await tentar(`Mercado Livre · ${c.nome}`, async () => {
        const r = await sincronizarMeli({
          conta: c.id,
          de,
          ate,
          etapas: { catalogo: true, pedidos: true, diarias: true, visitas: false, disputa: false },
          registro: { origem: "manual" },
        });
        return `${r.pedidos.gravados} pedidos, ${r.anuncios.gravados} anúncios`;
      });
    }
  }

  // ── Loja própria ──
  for (const loja of (await lojasVtex()).filter((l) => l.operacaoId === op.id)) {
    if (!(await vtexConectada(loja.id))) continue;
    await tentar(`VTEX · ${loja.nome}`, async () => {
      const r = await sincronizarVtex({ de, ate, conta: loja.id });
      return `${r.pedidos.gravados} pedidos`;
    });
  }

  // ── ERP: traz os canais que não têm API própria ──
  if (blingConfigurado()) {
    const integ = await integracaoDaOperacao(BLING, op.id);
    if (integ?.ref) {
      await tentar("Bling", async () => {
        const r = await sincronizarBling(integ, de, ate);
        return `${r.pedidos} pedidos`;
      });
    }
  }

  // ── Site: sessões e receita do GA4 ──
  if (ga4Configurado()) {
    for (const integ of (await integracoesDoProvedor(GA4)).filter(
      (i) => i.operacaoId === op.id && i.config.propriedade
    )) {
      await tentar(`GA4 · ${integ.nome}`, async () => {
        await sincronizarGa4(integ, de, ate);
        return "sessões relidas";
      });
    }
  }

  return NextResponse.json({
    periodo: { de, ate },
    segundos: Math.round((Date.now() - comecou) / 1000),
    fontes,
    // Nada conectado não é erro: a empresa pode viver de planilha.
    nenhuma: fontes.length === 0,
  });
}
