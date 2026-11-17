import VisaoGeral from "@/app/painel-cliente";
import { painel } from "../fixtures";
export default async function Preview({ searchParams }: { searchParams: Promise<{estado?:string;cenario?:string}> }) {
  const query = await searchParams;
  const estado = query.estado || query.cenario;
  const dados = estado === "vazio" ? {...painel, linhas: [], anuncios: [], canais: [], canaisSemanas: [], recomendacoes: [], quedas: [], ultimaData: null, vazio: true, fontes: {...painel.fontes, piorAtraso: null}}
    : estado === "zero" ? {...painel, linhas: painel.linhas.map(l => ({...l, receita: 0, pedidos: 0, visitas: 0, ads: 0, cancelado: 0, pedidosCancelados: 0})), anuncios: painel.anuncios.map(a=>({...a, receita: 0, vendas: 0, visitas: 0, conversao: 0})), recomendacoes: [], quedas: []}
    : estado === "nulo" ? {...painel, linhas: painel.linhas.map(l=>({...l, visitas: 0})), anuncios: painel.anuncios.map(a=>({...a, visitas: 0, conversao: 0}))}
    : estado === "grande" ? {...painel, linhas: painel.linhas.map(l => ({...l, receita: l.receita * 1000, ads: l.ads * 1000, cancelado: l.cancelado * 1000})), anuncios: painel.anuncios.map(a => ({...a, receita: a.receita * 1000}))}
    : estado === "defasado" ? {...painel, fontes: {...painel.fontes, piorAtraso: 5}}
    : painel;
  return <VisaoGeral dados={dados} />;
}
