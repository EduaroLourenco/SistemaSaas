import { carregarTermometro } from "@/lib/dados/termometro";
import { emCache } from "@/lib/cache-tela";
import { carregarEnvios } from "@/lib/dados/envios-meli";
import { BlocoOperacao } from "./operacao-hoje-blocos";
export { BlocoOperacao } from "./operacao-hoje-blocos";

/* Separado da carga do dia: o número de vendas aparece sem esperar por isto. */
export async function OperacaoHoje() {
  /* Envios fica fora do cache: é a fila do dia, tem que ser a de agora. */
  const [t, e] = await Promise.allSettled([emCache("termometro", {}, () => carregarTermometro()), carregarEnvios()]);
  return (
    <BlocoOperacao
      termometro={t.status === "fulfilled" ? t.value : null}
      envios={e.status === "fulfilled" ? e.value : null}
    />
  );
}
