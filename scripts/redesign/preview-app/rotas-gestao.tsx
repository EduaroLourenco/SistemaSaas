import type { ComponentProps, ReactNode } from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { Brand } from "@/components/ui/brand";
import { Panel } from "@/components/ui/primitives";
import Entrar from "@/app/entrar/page";
import Cadastro from "@/app/cadastro/page";
import { CriarEmpresa } from "@/app/comecar/criar-empresa";
import Aceitar from "@/app/convite/[token]/aceitar";
import Privacidade from "@/app/privacidade/page";
import Termos from "@/app/termos/page";
import Manual from "@/app/manual/bling/page";
import Configuracoes from "@/app/configuracoes/page";
import Equipe from "@/app/equipe/equipe-cliente";
import Empresas from "@/app/empresas/empresas-cliente";
import Canais from "@/app/integracoes/canais/canais-cliente";
import Glossario from "@/app/glossario/glossario-cliente";
import Guia from "@/app/guia/page";
import Exportacoes from "@/app/relatorios/exportacoes/page";
import Apresentacao from "@/app/relatorios/apresentacao/apresentacao-cliente";
import { FontesConteudo } from "@/app/integracoes/fontes-conteudo";
import { EstoquesConteudo } from "@/components/painel/estoques-conteudo";
import { RelatorioCliente } from "@/app/relatorio/[chave]/relatorio-cliente";
import type { Relatorio, Variacao } from "@/lib/dados/relatorio";
import type { Canal, ContaCanal } from "@/lib/dados/canais";
import type { DadosFontes } from "@/lib/dados/fontes";
import { TERMOS, SECOES_GLOSSARIO } from "@/mock/sistema";
import { painel } from "./fixtures";
import relatorioBase from "./fixture-relatorio.json";

const pagina = (titulo: string, conteudo: ReactNode) => <><PageHeader title={titulo} /><PageBody className="management-workspace"><WorkspaceNav />{conteudo}</PageBody></>;
const canais: Canal[] = [{id:"fixture-meli",codigo:"mercado_livre",nome:"Mercado Livre",tipo:"marketplace",corSerie:1,ordem:1,ativo:true,apelidos:[]},{id:"fixture-site",codigo:"vtex",nome:"Loja própria",tipo:"loja_propria",corSerie:2,ordem:2,ativo:true,apelidos:[]}];
const contas: ContaCanal[] = canais.map((c,i)=>({id:`fixture-conta-${i}`,canalId:c.id,canalNome:c.nome,canalCodigo:c.codigo,nome:i?"Loja de demonstração":"Conta de demonstração",identificador:null,fulfillment:false,reputacao:null,padrao:true,ativa:true,apelidos:[],conectada:i===0,escrita:null,sincronizadaEm:i===0?"2026-11-16T14:00:00-03:00":null,ultimoErro:null,canalTipo:c.tipo,ga4:null}));
const fontes: DadosFontes = {hoje:"2026-11-17",piorAtraso:1,fontes:[{id:"fixture-pedidos",nome:"Pedidos de demonstração",alimenta:"Vendas, pedidos e produtos",cobertura:"2026-11-16",importadoEm:"2026-11-16T14:00:00-03:00",registros:842,atrasoDias:1,origem:"api"},{id:"fixture-custos",nome:"Custos de demonstração",alimenta:"Margem e precificação",cobertura:"2026-11-15",importadoEm:"2026-11-16T14:00:00-03:00",registros:32,atrasoDias:2,origem:"planilha"}]};
const estoque: ComponentProps<typeof EstoquesConteudo>["d"] = {instalada:true,erro:null,total:3,pagina:0,fontes:[{id:"fixture-estoque",nome:"Mercado Livre · demonstração",provedor:"mercado_livre",conectada:true,estado:"atualizado",locais:[{id:"fixture-local",nome:"Depósito do vendedor",tipo:"seller"}],atualizadaEm:"2026-11-16T14:00:00-03:00",iniciadaEm:"2026-11-16T13:00:00-03:00",erro:null}],saldos:[24,0,null].map((saldo,i)=>({id:`fixture-saldo-${i}`,integracao_id:"fixture-estoque",origem:"canal",provedor:"mercado_livre",conta_canal_id:"fixture-conta-0",consultado_em:"2026-11-16T14:00:00-03:00",produto_externo:`fixture-${i}`,sku:`DEMO-00${i+1}`,titulo:painel.anuncios[i].titulo,local_id:"fixture-local",local_nome:"Depósito do vendedor",local_tipo:"seller",disponivel:saldo,fisico:saldo,reservado:saldo===null?null:0,anuncios:[],observacao:saldo===null?"Saldo não informado nesta fixture.":null}))};
const variacao=(atual:number,anterior:number):Variacao=>({atual,anterior,media4:anterior,melhor:atual,melhorQuando:"Novembro",contraAnterior:anterior?(atual-anterior)/anterior:null,contraMedia4:null,contraMelhor:0});
const relatorio: Relatorio = {...relatorioBase,periodo:{de:"2026-11-09",ate:"2026-11-15",dias:7,hoje:"2026-11-16"},janelas:{anterior:{de:"2026-11-02",ate:"2026-11-08"},media4:"Últimas quatro semanas",melhor:"Melhor semana"},operacao:{receita:variacao(342480,312000),pedidos:variacao(489,460),unidades:variacao(552,520),ticket:variacao(700.37,678.26),cancelamento:variacao(.023,.026),visitas:variacao(38600,36400),conversao:variacao(.0126,.0126)},prioridades:[{titulo:"Conferir os produtos com cobertura curta",numero:"3 produtos",detalhe:"Exemplo sintético de prioridade operacional.",onde:"Estoque",prazo:"semana"}],estadoDados:[{fonte:"Pedidos · fixture",ate:"2026-11-15",atrasoDias:1,situacao:"ok",detalhe:"Dados sintéticos."}],anotacoes:{},financeiro:{coberturaCusto:.81,receitaComCusto:277408,receitaTotal:342480,margemApurada:.19,produtosComCusto:32,produtosTotal:40}} as Relatorio;
relatorio.canais=[{id:"fixture-meli",nome:"Mercado Livre · demonstração",canal:"Mercado Livre",temVisita:true,metricas:relatorio.operacao,participacao:1,serie:Array.from({length:7},(_,i)=>({dia:`2026-11-${String(9+i).padStart(2,"0")}`,receita:42000+i*1000,pedidos:60+i,visitas:4800+i*90}))}];

export const ROTAS_GESTAO: Record<string, ReactNode> = {
  "/entrar": <Entrar />,
  "/cadastro": <Cadastro />,
  "/comecar": <main className="access-page"><div className="access-panel"><Brand className="mb-10" /><h1 className="mb-4">Criar empresa</h1><p className="mb-6 text-ink-2">Você entra como proprietário. A primeira operação é criada junto.</p><CriarEmpresa sugestao="" /></div></main>,
  "/convite/demonstracao": <Aceitar token="fixture-sem-validade" empresa="Empresa de demonstração" email="pessoa@example.test" papel="Leitor" meuEmail="pessoa@example.test" />,
  "/privacidade": <Privacidade />,
  "/termos": <Termos />,
  "/manual/bling": <Manual />,
  "/configuracoes": <Configuracoes />,
  "/equipe": pagina("Equipe",<Equipe equipe={{organizacaoId:"fixture-org",organizacaoNome:"Loja de demonstração",meuPapel:"proprietario",faltaMigracao:null,membros:[{id:"fixture-membro",usuarioId:"fixture-usuario",nome:"Pessoa de demonstração",email:"pessoa@example.test",papel:"proprietario",desde:"2026-10-01",euMesmo:true}],convites:[{id:"fixture-convite",email:"equipe@example.test",papel:"leitor",token:"fixture-sem-validade",criadoEm:"2026-11-16",expiraEm:"2026-11-23",vencido:false}]}} />),
  "/empresas": pagina("Empresas",<Empresas dados={{souAdmin:true,faltaMigracao:null,empresas:[{id:"fixture-empresa",nome:"Loja de demonstração",slug:"fixture",criadoEm:"2026-10-01",operacoes:1,membros:3,convites:1,canais:2,contas:2,conectadas:1}]}} />),
  "/integracoes/canais": pagina("Canais e contas",<Canais canais={canais} contas={contas} erp={null} abaInicial="contas" faltaMigracao={null} escritaDisponivel={false} />),
  "/integracoes/estoques": <EstoquesConteudo d={estoque} />,
  "/integracoes": <FontesConteudo fontes={fontes} contas={[{id:"fixture-conta-0",nome:"Conta de demonstração",conectada:true}]} todas={[{status:"conectada",ultima_sincronizacao:"2026-11-16T14:00:00-03:00",ultimo_erro:null,conta_canal_id:"fixture-conta-0",provedor:"mercado_livre",credencial_ref:"fixture-sem-segredo"}]} lojas={[]} saude={[{id:"fixture-saude",pergunta:"Até quando há dados?",estado:"atencao",resposta:"A fixture cobre até 16/11.",detalhes:[]}]} bling={null} escritaDisponivel={false} mapa={<Panel className="p-5"><h2 className="text-[20px] font-semibold">Dados por canal</h2><p className="mt-2 text-ink-2">Exemplo sintético isolado. Pedidos, visitas e estoque pertencem à conta de demonstração.</p></Panel>} />,
  "/glossario": <Glossario dados={{termos:TERMOS,secoes:SECOES_GLOSSARIO,vazio:false}} />,
  "/guia": <Guia />,
  "/relatorios/exportacoes": <Exportacoes />,
  "/relatorios/apresentacao": <Apresentacao dados={{linhas:painel.linhas.map(l=>({...l,canalReal:l.canalId})),canais:painel.canaisInfo,primeiraData:"2026-08-18",ultimaData:"2026-11-15",vazio:false}} />,
  "/relatorio/demonstracao": <RelatorioCliente dados={relatorio} chave="fixture-sem-validade" />,
};
