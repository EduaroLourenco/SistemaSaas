import {
  type Item,
  type Status,
  somarDias,
  diasEntre,
  dataValida,
  novoItem,
} from "./modelo";
import { estrategiaDe } from "./estrategia";

export function acaoDaCampanha(data: string, campanha: Item | null): Item {
  const item = novoItem(data);
  if (!campanha) return item;
  return {
    ...item,
    campanha_id: campanha.id,
    cor: campanha.cor,
    canais: [...campanha.canais],
    contas: [...campanha.contas],
    skus: [...campanha.skus],
    detalhes: {
      ...item.detalhes,
      grupos: [...campanha.detalhes.grupos],
      estrategia: {
        ...estrategiaDe(item),
        anuncios: [...estrategiaDe(campanha).anuncios],
      },
    },
  };
}

export const COLUNAS: {
  id: Status;
  nome: string;
  cor: string;
  dica: string;
}[] = [
  {
    id: "Rascunho",
    nome: "Ideias",
    cor: "#8b82bd",
    dica: "Vale começar com uma frase",
  },
  {
    id: "Planejada",
    nome: "Em preparação",
    cor: "#d59542",
    dica: "Transformando o plano em ação",
  },
  {
    id: "Aprovada",
    nome: "Prontas",
    cor: "#788bc5",
    dica: "Tudo combinado para começar",
  },
  {
    id: "Em andamento",
    nome: "Em execução",
    cor: "#a073c5",
    dica: "Acompanhando cada movimento",
  },
  {
    id: "Concluída",
    nome: "Concluídas",
    cor: "#509982",
    dica: "O que levamos para a próxima?",
  },
];
export function reagendar(item: Item, dia: string): Item | null {
  if (!dataValida(dia)) return null;
  const fim = somarDias(dia, diasEntre(item.inicio, item.fim));
  return dataValida(fim) ? { ...item, inicio: dia, fim } : null;
}
export function corDoTipo(tipo: string): string {
  if (/CRM|Conteúdo/i.test(tipo)) return "#b86685";
  if (/Ads|Mídia/i.test(tipo)) return "#8170ba";
  if (/Promoção|Preço|Cupom/i.test(tipo)) return "#bf8c39";
  if (/anúncio|Kit/i.test(tipo)) return "#548e83";
  return "#6389b1";
}
export type ModeloCampanha = {
  id: string;
  nome: string;
  descricao: string;
  cor: string;
  objetivo: string;
  dias: number;
  acoes: {
    titulo: string;
    tipo: string;
    etapa: string;
    dia: number;
    dias: number;
  }[];
};
export const MODELOS: ModeloCampanha[] = [
  {
    id: "em-branco",
    nome: "Do seu jeito",
    descricao: "Uma campanha em branco, espaço para suas ideias.",
    cor: "#8170ba",
    objetivo: "",
    dias: 14,
    acoes: [],
  },
  {
    id: "marketplace",
    nome: "Acelerar no marketplace",
    descricao: "Anúncio, oferta e mídia trabalhando juntos.",
    cor: "#d5a443",
    objetivo:
      "Melhorar a apresentação dos anúncios e testar uma oferta coordenada com mídia.",
    dias: 14,
    acoes: [
      {
        titulo: "Revisar fotos e conteúdo dos anúncios",
        tipo: "Revisão de anúncio",
        etapa: "Preparação",
        dia: 0,
        dias: 3,
      },
      {
        titulo: "Definir a seleção e conferir a promoção",
        tipo: "Promoção",
        etapa: "Preparação",
        dia: 2,
        dias: 3,
      },
      {
        titulo: "Planejar Product Ads para a seleção",
        tipo: "Product Ads",
        etapa: "Lançamento",
        dia: 5,
        dias: 8,
      },
      {
        titulo: "Revisar resultados e guardar aprendizados",
        tipo: "Personalizada",
        etapa: "Pós-campanha",
        dia: 13,
        dias: 1,
      },
    ],
  },
  {
    id: "lancamento",
    nome: "Lançar uma coleção",
    descricao: "Da primeira arte ao acompanhamento das vendas.",
    cor: "#78a99a",
    objetivo:
      "Apresentar a nova seleção com uma mensagem consistente em cada canal.",
    dias: 14,
    acoes: [
      {
        titulo: "Montar o mix e preparar os anúncios",
        tipo: "Revisão de anúncio",
        etapa: "Preparação",
        dia: 0,
        dias: 3,
      },
      {
        titulo: "Criar o banner da nova coleção",
        tipo: "Banner",
        etapa: "Esquenta",
        dia: 3,
        dias: 3,
      },
      {
        titulo: "Planejar a divulgação para a base de clientes",
        tipo: "CRM",
        etapa: "Lançamento",
        dia: 6,
        dias: 2,
      },
      {
        titulo: "Atualizar a vitrine e acompanhar a seleção",
        tipo: "Vitrine / Minha Página",
        etapa: "Sustentação",
        dia: 6,
        dias: 8,
      },
    ],
  },
];
