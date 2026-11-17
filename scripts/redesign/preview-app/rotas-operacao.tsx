import type { ReactNode } from "react";
import CentralAnuncios from "@/components/analise/central-anuncios";
import Catalogo from "@/app/anuncios/catalogo/catalogo-cliente";
import PrecoAlvo from "@/app/anuncios/preco-alvo/preco-alvo-cliente";
import PrecoIdeal from "@/app/anuncios/preco-ideal/preco-ideal-cliente";
import PerformancePreco from "@/app/anuncios/preco-performance/performance-cliente";
import TipoAnuncio from "@/app/anuncios/tipo/tipo-cliente";
import Automacoes from "@/app/automacoes/automacoes-cliente";
import Regras from "@/app/automacoes/regras/regras-cliente";
import Campanhas from "@/app/promocoes/campanhas/campanhas-cliente";
import Comparar from "@/app/promocoes/comparar/comparar-cliente";
import Historico from "@/app/promocoes/historico/historico-cliente";
import Processar from "@/app/promocoes/processar/page";
import Importar from "@/app/importar/importar-cliente";
import Conversa from "@/app/conversa/conversa-cliente";
import Precos from "@/app/monitoramento/precos/precos-cliente";
import Fretes from "@/app/monitoramento/fretes/page";
import { analiseOperacao, catalogoOperacao, disputaOperacao, alvoOperacao, idealOperacao, performanceOperacao, tipoOperacao, automacoesOperacao, adsOperacao, regrasOperacao, filaOperacao, promocoesOperacao, compararOperacao, precosOperacao } from "./fixtures-operacao";

export const ROTAS_OPERACAO: Record<string, ReactNode> = {
  "/anuncios/analise": <CentralAnuncios dados={analiseOperacao} inicial={{periodo:{de:"2026-10-18",ate:"2026-11-16"},modo:"anterior",livre:null}} />,
  "/anuncios/catalogo": <Catalogo dados={catalogoOperacao} disputa={disputaOperacao} />,
  "/anuncios/preco-alvo": <PrecoAlvo dados={alvoOperacao} />,
  "/anuncios/preco-ideal": <PrecoIdeal dados={idealOperacao} />,
  "/anuncios/preco-performance": <PerformancePreco dados={performanceOperacao} />,
  "/anuncios/tipo": <TipoAnuncio dados={tipoOperacao} />,
  "/automacoes": <Automacoes dados={automacoesOperacao} ads={adsOperacao} regras={regrasOperacao} folgas={{porTipo:{"*":5},faltaMigracao:null}} fila={filaOperacao} />,
  "/automacoes/regras": <Regras regras={regrasOperacao} faltaMigracao={null} cobertura={[]} contas={[{id:"fixture-conta",nome:"Conta de demonstração"}]} />,
  "/promocoes/campanhas": <Campanhas dados={promocoesOperacao} />,
  "/promocoes/comparar": <Comparar dados={compararOperacao} />,
  "/promocoes/historico": <Historico dados={promocoesOperacao} />,
  "/promocoes/processar": <Processar />,
  "/importar": <Importar origens={{contasApi:1,erpConectado:false}} recentes={[]} />,
  "/conversa": <Conversa />,
  "/monitoramento/precos": <Precos dados={precosOperacao} />,
  "/monitoramento/fretes": <Fretes />,
};
