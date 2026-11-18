import { queda, skus, termometro, trafego } from "./fixtures-decisao";
import type { DadosQueda } from "@/lib/dados/queda";
import type { DadosTrafegoPago } from "@/lib/dados/trafego-pago";
import type { DadosTermometro } from "@/lib/dados/termometro";

// Casos sintéticos de apresentação: títulos longos, fontes sobrepostas e estados nulos.
export const skusRefino = skus;
const causas: DadosQueda["linhas"][number]["causa"][] = ["perdeu visitas", "sem estoque", "conversão caiu", "preço subiu", "parou de vender"];
export const quedaRefino: DadosQueda = { ...queda, linhas: queda.linhas.map((linha, i) => ({ ...linha, causa: causas[i % causas.length] })) };
export const trafegoRefino: DadosTrafegoPago = {
  ...trafego,
  periodos: [trafego.periodos[0], { ...trafego.periodos[0], inicio: "2026-10-01", fim: "2026-10-31", rotulo: "Outubro" }, { ...trafego.periodos[0], inicio: "2026-09-01", fim: "2026-09-30", rotulo: "Setembro" }],
  conferencia: { inicio: "2026-10-17", fim: "2026-11-15", relatorio: 24000, diario: 23850, diasRegistrados: 29, diasEsperados: 30, registrosRegistrados: 29, registrosEsperados: 30 },
};
export const termometroRefino: DadosTermometro = {
  ...termometro,
  atencao: [{ chave: "fixture-prazo", gravidade: "alta", numero: "2", rotulo: "envios com prazo próximo", href: "/mercado-livre/envios", valor: null }, { chave: "fixture-pergunta", gravidade: "media", numero: "3", rotulo: "perguntas sem resposta", valor: null }],
  campanhas: termometro.campanhas.map(campanha => ({ ...campanha, status: "Em andamento" })),
  reputacao: termometro.reputacao.map(rep => ({ ...rep, conta: "Loja de demonstração · unidade principal" })),
  catalogo: {
    medido: true, desde: "2026-09-30",
    contas: [{ contaId: "fixture-conta-ml", nome: "Loja de demonstração · unidade principal", dia: "2026-11-17", diaAnterior: "2026-11-10", ganhando: 8, disputando: 12, ganhandoAnterior: 10, disputandoAnterior: 12 }],
    totais: { ganhando: 8, disputando: 12, ganhandoAnterior: 10, disputandoAnterior: 12 },
    perdidos: [{ mlb: "MLB-FIXTURE-001", sku: "DEMO-001", titulo: skus.linhas[0].titulo, conta: "Loja de demonstração · unidade principal", situacao: "competindo", ultimoDiaGanhando: "2026-11-10" }], ganhos: [],
  },
};
