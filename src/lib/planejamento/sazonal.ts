import { dataISO, somarDias } from "./modelo";
const SEBRAE =
  "https://mg.agenciasebrae.com.br/cultura-empreendedora/calendario-de-vendas-2026-confira-mais-de-100-datas-comemorativas/";
const NUVEM = "https://www.nuvemshop.com.br/blog/calendario-comercial/";
export type Oportunidade = {
  id: string;
  nome: string;
  data: string;
  categoria: string;
  fonte: string;
  verificado: string;
  regra: string;
  ideia: string;
};
const fixas: [number, number, string, string][] = [
  [1, 7, "Dia do Leitor", "Nicho"],
  [1, 18, "Dia dos Profissionais da Beleza", "Nicho"],
  [1, 20, "Dia do Queijo", "Nicho"],
  [1, 30, "Dia da Saudade", "Conteúdo"],
  [2, 14, "Dia da Amizade", "Conteúdo"],
  [2, 17, "Dia Mundial do Gato", "Nicho"],
  [3, 8, "Dia Internacional da Mulher", "Comércio"],
  [3, 15, "Dia do Consumidor", "Comércio"],
  [3, 19, "Dia do Artesão", "Casa"],
  [3, 20, "Dia da Felicidade", "Conteúdo"],
  [4, 13, "Dia do Beijo", "Conteúdo"],
  [4, 23, "Dia Mundial do Livro", "Nicho"],
  [5, 24, "Dia Nacional do Café", "Nicho"],
  [5, 25, "Dia do Orgulho Nerd", "Nicho"],
  [5, 28, "Dia do Hambúrguer", "Nicho"],
  [6, 12, "Dia dos Namorados", "Comércio"],
  [6, 24, "São João", "Comércio"],
  [6, 28, "Dia do Orgulho LGBTQIAPN+", "Conteúdo"],
  [7, 5, "Dia do Biquíni", "Nicho"],
  [7, 7, "Dia do Chocolate", "Nicho"],
  [7, 10, "Dia da Pizza", "Nicho"],
  [7, 13, "Dia do Rock", "Nicho"],
  [7, 16, "Dia do Comerciante", "Comércio"],
  [7, 20, "Dia do Amigo", "Conteúdo"],
  [7, 24, "Dia do Autocuidado", "Casa"],
  [7, 26, "Dia dos Avós", "Comércio"],
  [8, 15, "Dia do Solteiro", "Conteúdo"],
  [8, 18, "Dia da Informática", "Nicho"],
  [8, 29, "Dia do Gamer", "Nicho"],
  [9, 2, "Dia do Florista", "Casa"],
  [9, 15, "Dia do Cliente", "Comércio"],
  [9, 23, "Dia do Sorvete", "Nicho"],
  [9, 27, "Dia do Turismo", "Nicho"],
  [10, 1, "Dia do Vendedor", "Comércio"],
  [10, 4, "Dia dos Animais", "Nicho"],
  [10, 5, "Dia da Micro e Pequena Empresa", "Comércio"],
  [10, 12, "Dia das Crianças", "Comércio"],
  [10, 15, "Dia do Professor", "Comércio"],
  [10, 15, "Dia do Consumo Consciente", "Casa"],
  [10, 30, "Dia da Decoração", "Casa"],
  [10, 31, "Halloween", "Comércio"],
  [11, 19, "Empreendedorismo Feminino", "Conteúdo"],
  [11, 20, "Dia da Consciência Negra", "Conteúdo"],
  [12, 25, "Natal", "Comércio"],
  [12, 31, "Réveillon", "Comércio"],
];
function dia(ano: number, mes: number, d: number): string {
  return dataISO(new Date(Date.UTC(ano, mes - 1, d, 12)));
}
function domingo(ano: number, mes: number, n: number): string {
  const p = new Date(Date.UTC(ano, mes - 1, 1));
  return dia(ano, mes, 1 + ((7 - p.getUTCDay()) % 7) + (n - 1) * 7);
}
function pascoa(ano: number): string {
  const a = ano % 19,
    b = Math.floor(ano / 100),
    c = ano % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451);
  return dia(
    ano,
    Math.floor((h + l - 7 * m + 114) / 31),
    ((h + l - 7 * m + 114) % 31) + 1,
  );
}
export function oportunidades(ano: number): Oportunidade[] {
  if (ano < 2000 || ano > 2100) return [];
  function criar(
    nome: string,
    data: string,
    categoria: string,
    fonte = SEBRAE,
    regra = "Data fixa anual",
  ): Oportunidade {
    const ideia =
      categoria === "Casa"
        ? "Crie uma seleção de produtos e um conteúdo útil para a casa. Conecte um banner e uma ação de relacionamento."
        : categoria === "Conteúdo"
          ? "Planeje uma mensagem relevante para o seu público. Esta data não precisa virar desconto."
          : "Escolha um objetivo e um público. Prepare a seleção, a comunicação e o acompanhamento dos resultados.";
    return {
      id: data + "-" + nome,
      nome,
      data,
      categoria,
      fonte,
      verificado: "2026-10-05",
      regra,
      ideia,
    };
  }
  const lista = fixas.map(([mes, d, nome, cat]) =>
    criar(nome, dia(ano, mes, d), cat),
  );
  const p = pascoa(ano),
    nov = new Date(Date.UTC(ano, 10, 1)).getUTCDay();
  const black = dia(ano, 11, 1 + ((4 - nov + 7) % 7) + 22);
  lista.push(
    criar(
      "Carnaval",
      somarDias(p, -47),
      "Comércio",
      NUVEM,
      "47 dias antes da Páscoa",
    ),
    criar(
      "Páscoa",
      p,
      "Comércio",
      NUVEM,
      "Data móvel calculada pelo calendário gregoriano",
    ),
    criar(
      "Dia das Mães",
      domingo(ano, 5, 2),
      "Comércio",
      NUVEM,
      "Segundo domingo de maio",
    ),
    criar(
      "Dia dos Pais",
      domingo(ano, 8, 2),
      "Comércio",
      NUVEM,
      "Segundo domingo de agosto",
    ),
    criar(
      "Black Friday",
      black,
      "Comércio",
      NUVEM,
      "Sexta após a quarta quinta-feira de novembro",
    ),
    criar(
      "Cyber Monday",
      somarDias(black, 3),
      "Comércio",
      NUVEM,
      "Segunda-feira após a Black Friday",
    ),
    criar(
      "Dia do Estagiário",
      dia(ano, 8, 18),
      "Nicho",
      "https://www.cieemg.org.br/noticia/18-de-agosto-dia-do-estagiario",
    ),
  );
  if (ano === 2026)
    lista.push(
      criar(
        "Dia Mundial do Sono",
        "2026-03-13",
        "Casa",
        "https://worldsleepday.org/",
        "Edição 2026 confirmada pelo organizador",
      ),
    );
  return lista.sort(
    (a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome),
  );
}
