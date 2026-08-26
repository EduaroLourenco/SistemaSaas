import "server-only";
import { carregarBaseVendas } from "./vendas";
import type { CanalInfo, LinhaVendaDia } from "./vendas";

/**
 * Roteiro de apresentação, montado do banco.
 *
 * A versão anterior trazia comentários escritos à mão — "crescimento
 * puxado por Mercado Livre e Shopee", "queda de 1,6 ponto vem da pressão
 * de campanha". Frases assim, numa tela feita para ser lida em reunião,
 * são pior que número errado: ninguém confere a origem de uma frase.
 *
 * Aqui o comentário é DERIVADO dos números do próprio recorte. Quando não
 * há o que dizer com segurança, ele diz isso, em vez de preencher.
 */

export type SlideApresentacao = {
  id: string;
  titulo: string;
  subtitulo: string;
  valor: number;
  formato: "money" | "count" | "pct";
  delta: number;
  inverso?: boolean;
  comentario: string;
  tipo: "linha" | "barra";
  serie: { rotulo: string; valor: number }[];
};

export type DadosApresentacao = {
  linhas: LinhaVendaDia[];
  canais: CanalInfo[];
  primeiraData: string;
  ultimaData: string;
  vazio: boolean;
};

export async function carregarApresentacao(): Promise<DadosApresentacao> {
  const base = await carregarBaseVendas();
  if (base.vazio) {
    return { linhas: [], canais: [], primeiraData: "", ultimaData: "", vazio: true };
  }
  const datas = base.linhas.map((l) => l.data).sort();
  return {
    linhas: base.linhas,
    canais: base.canais,
    primeiraData: datas[0],
    ultimaData: datas[datas.length - 1],
    vazio: false,
  };
}
