import { carregarTermometro } from "@/lib/dados/termometro";
import { carregarEnvios } from "@/lib/dados/envios-meli";
import { BlocoOperacao } from "./operacao-hoje-blocos";
export { BlocoOperacao } from "./operacao-hoje-blocos";

/* Separado da carga do dia: o número de vendas aparece sem esperar por isto. */
export async function OperacaoHoje() {
  const [t, e] = await Promise.allSettled([carregarTermometro(), carregarEnvios()]);
  return (
    <BlocoOperacao
      termometro={t.status === "fulfilled" ? t.value : null}
      envios={e.status === "fulfilled" ? e.value : null}
    />
  );
}
