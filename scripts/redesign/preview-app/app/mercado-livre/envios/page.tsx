import Envios from "@/app/mercado-livre/envios/envios-cliente";
import { envios } from "../../../fixtures";
import { documentos, documentosLimite, documentosLegado } from "../../../fixtures-documentos";
export default async function Preview({ searchParams }: { searchParams: Promise<{cenario?:string;estado?:string}> }) {
  const query = await searchParams;
  const cenario = query.estado || query.cenario;
  const dados = cenario === "documentos" ? documentos
    : cenario === "documentos-limite" ? documentosLimite
    : cenario === "documentos-legado" ? documentosLegado
    : cenario === "falha" ? {...envios, envios: [], falhas: [{conta: envios.contas[0], motivo: "Falha sintética de consulta da conta."}]}
    : ["vazio", "zero"].includes(cenario || "") ? {...envios, envios: []}
    : cenario === "sem-contas" ? {...envios, contas: [], envios: []}
    : cenario === "nulo" ? {...envios, envios: envios.envios.map(e=>({...e, limite: null, origem: null, dias: null}))}
    : envios;
  return <Envios dados={dados} />;
}
