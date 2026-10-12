import "server-only";
import { contasMeli } from "@/lib/meli/rota";
import { sincronizarMeli } from "@/lib/meli/sincronizar";
import { sincronizarAds } from "@/lib/meli/ads";
import { appConfigurado as meliConfigurado, contaConectada } from "@/lib/meli/cliente";
import { lojasVtex, vtexConectada } from "@/lib/vtex/cliente";
import { sincronizarVtex } from "@/lib/vtex/sincronizar";
import { integracaoDaConta, integracaoDaOperacao, integracoesDoProvedor } from "@/lib/integracoes/cofre";
import { estoqueMeli } from "@/lib/meli/estoque";
import { estoqueBling } from "@/lib/bling/estoque";
import { PROVEDOR as BLING, appConfigurado as blingConfigurado } from "@/lib/bling/cliente";
import { sincronizarBling } from "@/lib/bling/sincronizar";
import { PROVEDOR as GA4, appConfigurado as ga4Configurado } from "@/lib/ga4/cliente";
import { sincronizarGa4 } from "@/lib/ga4/sincronizar";

type ResultadoEtapa = { detalhe: string; avisos?: string[]; continuacao?: number };
type Etapa = { id: string; fonte: string; executar: (pagina?: number) => Promise<ResultadoEtapa> };

function diaSP(desloc = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() + desloc * 86_400_000)
  );
}

/** Só monta o plano. Nenhuma API de canal é sincronizada antes do POST. */
export async function planejarAtualizacao(operacaoId: string) {
  const de = diaSP(-2);
  const ate = diaSP();
  const etapas: Etapa[] = [];
  const complementos: Etapa[] = [];
  const [meli, vtex, bling, ga4] = await Promise.all([
    meliConfigurado() ? contasMeli(operacaoId) : [],
    lojasVtex(operacaoId),
    blingConfigurado() ? integracaoDaOperacao(BLING, operacaoId) : null,
    ga4Configurado() ? integracoesDoProvedor(GA4, operacaoId) : [],
  ]);

  for (const c of meli) {
    // O cofre também funciona para o administrador que acessa empresas de clientes.
    if (!(await contaConectada(c.id))) continue;
    const integracao = await integracaoDaConta("mercado_livre", c.id);
    if (integracao?.operacaoId === operacaoId) complementos.push({
      id: `meli-estoque:${c.id}`, fonte: `Estoques · ${c.nome}`, executar: (pagina) => estoqueMeli(integracao, pagina),
    });
    etapas.push({ id: `meli-dados:${c.id}`, fonte: `Mercado Livre · ${c.nome}`, executar: async () => {
      const r = await sincronizarMeli({
        conta: c.id, de, ate, diasVisitas: 2,
        etapas: { catalogo: true, pedidos: true, diarias: true, visitas: false, disputa: false },
        registro: { origem: "manual" },
      });
      return { detalhe: `${r.pedidos.gravados} pedidos, ${r.anuncios.gravados} anúncios`, avisos: r.avisos };
    } });
    complementos.push({ id: `meli-ads:${c.id}`, fonte: `Publicidade · ${c.nome}`, executar: async () => {
      const r = await sincronizarAds(c.id, { de: diaSP(-29), ate, operacaoId, contaCanalId: c.id });
      return { detalhe: r ? `${r.campanhas} campanhas, ${r.gravados} anúncios e ${r.diasGravados} dias atualizados` : "Conta sem publicidade disponível" };
    } });
    complementos.push({ id: `meli-visitas:${c.id}`, fonte: `Visitas · ${c.nome}`, executar: async () => {
      const r = await sincronizarMeli({
        conta: c.id, de, ate, diasVisitas: 3,
        etapas: { catalogo: false, pedidos: false, diarias: true, visitas: true, disputa: false },
        registro: { origem: "manual" },
      });
      const avisos = [...r.avisos];
      if (r.visitas.falharam) avisos.push(`Não foi possível ler visitas de ${r.visitas.falharam} anúncios. Os demais foram atualizados.`);
      return { detalhe: `${r.visitas.linhas} registros de visitas atualizados`, avisos };
    } });
  }
  for (const c of vtex) {
    if (!(await vtexConectada(c.id))) continue;
    etapas.push({ id: `vtex:${c.id}`, fonte: `VTEX · ${c.nome}`, executar: async () => {
      const r = await sincronizarVtex({ de, ate, conta: c.id });
      return { detalhe: `${r.pedidos.gravados} pedidos` };
    } });
  }
  if (bling?.ref) {
    complementos.push({ id: `bling-estoque:${bling.id}`, fonte: "Estoques · Bling", executar: (pagina) => estoqueBling(bling, pagina) });
    etapas.push({ id: `bling:${bling.id}`, fonte: "Bling", executar: async () => {
      const r = await sincronizarBling(bling, de, ate);
      const pendentes = Object.values(r.pendentes).reduce((s, p) => s + p.pedidos, 0);
      return {
        detalhe: `${r.pedidos} pedidos`,
        avisos: pendentes ? [`${pendentes} pedidos aguardam a associação de lojas na aba ERP.`] : [],
      };
    } });
  }
  for (const i of ga4) {
    if (!i.ref || !i.config.propriedade) continue;
    etapas.push({ id: `ga4:${i.id}`, fonte: `GA4 · ${i.nome}`, executar: async () => {
      const r = await sincronizarGa4(i, de, ate);
      return { detalhe: `${r.dias} dias de sessões atualizados`, avisos: r.avisos };
    } });
  }
  // Visitas e publicidade têm requisições próprias: não consomem o tempo dos pedidos.
  return { periodo: { de, ate }, etapas: [...etapas, ...complementos] };
}
