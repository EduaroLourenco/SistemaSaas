/**
 * Ideias de produto para a Imprimil, nas três frentes que o Eduardo pediu.
 *
 * O que sustenta cada linha:
 *   - o catálogo dela (30 títulos bíblicos, 17 temáticos, packs de 10 a 100);
 *   - o que ela já vendeu (pedidos de 07/03 a 27/10/2026);
 *   - preço e venda de concorrente, coletados na pesquisa, com link.
 *
 * Nada de ideia solta: cada kit diz quais títulos entram, e cada produto
 * novo vem com a referência de quem já vende e por quanto.
 *
 * Uso: node scripts/local/imprimil-ideias.mjs
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

/* ── A paleta. Uma cor por frente, e nada de arco-íris. ── */
const ROXO = "FF4A2E7A", ROXO2 = "FF6B4BA8", VERDE = "FF1E6B52", LARANJA = "FFB5500F",
      AZUL = "FF1F4E79", CINZA = "FF595959";
const L_ROXO = "FFEDE7F6", L_VERDE = "FFE3F2EC", L_LARANJA = "FFFDEFE3", L_AZUL = "FFE8F0F8",
      L_CINZA = "FFF4F4F4", L_OURO = "FFFFF4CE";
const OURO = "FF8A6D0B", OURO_ESC = "FF5C4708";
const BRL = '"R$ "#,##0.00';

const wb = new ExcelJS.Workbook();
wb.creator = "gerizo";
wb.title = "Imprimil — ideias de produto";

const FONTE = { name: "Calibri", size: 11 };
const fundo = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

/** Faixa de título da aba. */
function titulo(ws, texto, sub, cor, colunas) {
  const t = ws.addRow([texto]);
  t.font = { ...FONTE, bold: true, size: 20, color: { argb: "FFFFFFFF" } };
  t.fill = fundo(cor);
  t.height = 40;
  ws.mergeCells(t.number, 1, t.number, colunas);
  t.alignment = { vertical: "middle", indent: 1 };
  if (sub) {
    const s = ws.addRow([sub]);
    s.font = { ...FONTE, size: 11, color: { argb: CINZA } };
    s.height = 22;
    ws.mergeCells(s.number, 1, s.number, colunas);
    s.alignment = { vertical: "middle", indent: 1, wrapText: true };
  }
  ws.addRow([]);
}

/** Cabeçalho de tabela. */
function cabecalho(ws, cols, cor) {
  const r = ws.addRow(cols.map((c) => c.t));
  r.font = { ...FONTE, bold: true, color: { argb: "FFFFFFFF" } };
  r.fill = fundo(cor);
  r.alignment = { vertical: "middle", wrapText: true, horizontal: "center" };
  r.height = 34;
  ws.columns = cols.map((c) => ({ width: c.w }));
  ws.views = [{ state: "frozen", ySplit: r.number }];
  ws.autoFilter = { from: { row: r.number, column: 1 }, to: { row: r.number, column: cols.length } };
  return r.number;
}

/** Linha de dado, com zebra e altura que cabe o texto. */
function linha(ws, valores, { zebra, cor, destaque } = {}) {
  const r = ws.addRow(valores);
  r.font = destaque ? { ...FONTE, bold: true } : FONTE;
  r.alignment = { vertical: "top", wrapText: true };
  r.height = 30;
  if (zebra) for (let c = 1; c <= valores.length; c++) r.getCell(c).fill = fundo(cor ?? L_CINZA);
  return r;
}

/* ══════════════════════════════════════════════════════════════
   Aba 1 — Resumo
   ══════════════════════════════════════════════════════════════ */
{
  const ws = wb.addWorksheet("Resumo", { properties: { tabColor: { argb: ROXO } } });
  ws.columns = [{ width: 4 }, { width: 34 }, { width: 62 }, { width: 26 }, { width: 22 }];
  titulo(ws, "IMPRIMIL · IDEIAS DE PRODUTO", "Três frentes · nov/2026 a fev/2027 · pesquisa de mercado com preço e link de concorrente", ROXO, 5);

  const achado = ws.addRow(["", "O QUE MAIS IMPORTA", "", "", ""]);
  achado.font = { ...FONTE, bold: true, size: 13, color: { argb: LARANJA } };
  ws.addRow([]);
  for (const [t, d] of [
    ["Marcador de página bíblico: o mercado pede e ela já imprime", "Dos 6 termos mais buscados em Marcadores de Livro, 3 são religiosos — bíblico, evangélico e católico. Mesmo papel, mesma tinta, mesmo público da Imprimil."],
    ["Agenda 2027 é o 1º termo mais buscado da categoria", "E novembro é o mês em que agenda vende. Ela já faz caderno moleskine — é o mesmo processo."],
    ["O concorrente vende o giz junto", "30 revistinhas + 30 caixas de giz de cera por R$ 59, com +500 vendidos. A Imprimil vende 30 livrinhos bíblicos por R$ 72,80, sem giz."],
    ["Não existe livrinho do nascimento de Jesus", "São 30 títulos bíblicos e nenhum do Natal. Falta o produto mais procurado de dezembro."],
    ["Só 3 títulos falam de Jesus", "Sermão da Montanha, Zaqueu e Pedro. O resto é Antigo Testamento. Kit 'Vida de Jesus' não fecha hoje."],
    ["Mulheres da Bíblia já fecha um kit", "Débora, Rute e Noemi, Ester, Ana e a Viúva Pobre. Cinco títulos prontos, tema pouco explorado."],
    ["Menor pack é de 10", "O concorrente vende kit de 5 e avulso. Falta a entrada barata que leva o cliente ao pack grande."],
  ]) {
    const r = linha(ws, ["", t, d, "", ""]);
    r.getCell(2).font = { ...FONTE, bold: true };
    r.height = 34;
  }

  ws.addRow([]);
  const c = ws.addRow(["", "AS TRÊS FRENTES", "", "QUANTAS IDEIAS", "ABA"]);
  c.font = { ...FONTE, bold: true, color: { argb: "FFFFFFFF" } };
  c.fill = fundo(ROXO2);
  c.height = 28;
  c.alignment = { vertical: "middle" };
  for (const [n, d, q, aba, cor] of [
    ["1 · Kits sazonais", "Temas novos para imprimir, mês a mês, de novembro a fevereiro", "14 kits", "Sazonais", L_ROXO],
    ["2 · Kits com o que já existe", "Recombinação dos 47 títulos atuais — custo zero de arte", "12 kits", "Kits do acervo", L_VERDE],
    ["3A · Produtos para vender junto", "Giz, lápis, sacolinha — o que o cliente já compra com o livrinho", "9 produtos", "Produtos juntos", L_LARANJA],
    ["3B · Produtos que a Imprimil imprime", "Usa a mesma máquina e o mesmo papel", "12 produtos", "Produtos impressos", L_AZUL],
    ["Pesquisa · o que digitam na busca", "Termo real de busca do Mercado Livre, por categoria, na ordem de quem mais busca", "10 categorias", "Mais buscados", L_OURO],
  ]) {
    const r = linha(ws, ["", n, d, q, aba], { zebra: true, cor });
    r.getCell(2).font = { ...FONTE, bold: true };
  }

  ws.addRow([]);
  const base = ws.addRow(["", "De onde vêm os números", "Catálogo e pedidos da Imprimil no sistema (07/03 a 27/10/2026) · preços de concorrente coletados em 27/10/2026, sujeitos a mudança · termos de busca pela API do Mercado Livre (tendências por categoria)", "", ""]);
  base.font = { ...FONTE, italic: true, size: 10, color: { argb: CINZA } };
  base.alignment = { wrapText: true, vertical: "top" };
  base.height = 30;
}

/* ══════════════════════════════════════════════════════════════
   Aba 2 — Kits sazonais
   ══════════════════════════════════════════════════════════════ */
{
  const ws = wb.addWorksheet("Sazonais", { properties: { tabColor: { argb: ROXO2 } } });
  titulo(ws, "FRENTE 1 · KITS SAZONAIS", "Temas novos para imprimir. A coluna 'produzir até' conta de trás para frente a partir da data de venda.", ROXO, 8);
  const cols = [
    { t: "MÊS", w: 12 }, { t: "DATA / GANCHO", w: 20 }, { t: "KIT", w: 34 },
    { t: "O QUE VAI DENTRO", w: 52 }, { t: "PARA QUEM", w: 24 },
    { t: "PRODUZIR ATÉ", w: 14 }, { t: "PREÇO SUGERIDO", w: 15 }, { t: "POR QUE", w: 44 },
  ];
  const h = cabecalho(ws, cols, ROXO);

  const ideias = [
    ["NOV", "Black Friday 27/11", "Kit 100 Sortidos — oferta de volume", "Os 17 temáticos atuais, 100 unidades", "Revenda e festas", "já pronto", 97.9, "O 100 é o que mais vende hoje: 52 un e R$ 2.747. Entrar na BF com ele, não com novidade."],
    ["NOV", "Preparar dezembro", "Kit Natal Bíblico — 10 títulos novos", "O nascimento de Jesus · A estrela de Belém · Os reis magos · O anjo e Maria · A manjedoura · Os pastores · A fuga para o Egito · Zacarias e Isabel · João Batista menino · O primeiro Natal", "Igreja, EBD, catequese", "10/nov", 49.9, "Dos 30 títulos bíblicos, NENHUM é de Natal. É o furo mais caro do catálogo."],
    ["NOV", "Preparar dezembro", "Kit Natal Geral — 8 títulos novos", "Papai Noel · Rena Rudolph · Árvore enfeitada · Boneco de neve · Presentes · Sinos · Duendes · Ceia de Natal", "Festas, escolas, comércio", "10/nov", 42.9, "Natal geral e Natal bíblico são dois públicos. Hoje ela não atende nenhum dos dois."],
    ["NOV", "Advento começa 29/11", "Calendário de Advento para colorir", "Cartela com 24 quadrinhos + 24 mini desenhos destacáveis", "Igreja e família", "15/nov", 34.9, "Produto de data fixa, compra por impulso, e quase ninguém vende em atacado."],
    ["DEZ", "Formatura infantil", "Kit Formatura — 6 títulos novos", "Meu primeiro diploma · A turminha · Saudade da escola · Vou crescer · Meus amigos · O que quero ser", "Escolas de educação infantil", "25/nov", 39.9, "Dezembro é formatura do pré. Escola compra 30 a 100 de uma vez."],
    ["DEZ", "Confraternização", "Kit Festa de Fim de Ano", "8 temáticos atuais + sacolinha kraft", "Empresas e condomínios", "já pronto", 54.9, "Só embalagem nova sobre o que já existe."],
    ["JAN", "Férias 01 a 31/01", "Kit Férias — 10 títulos novos", "Praia · Piquenique · Acampamento · Viagem de carro · Parque · Zoológico · Fazenda · Piscina · Sorvete · Caça ao tesouro", "Colônia de férias, hotel, restaurante", "15/dez", 47.9, "Hotel e restaurante compram para entreter criança. Nicho fora de festa."],
    ["JAN", "Volta às aulas", "Kit Volta às Aulas — 8 títulos novos", "Meu nome · Números · Alfabeto · Formas · Cores · Meu corpo · A escola · Minha família", "Escola e papelaria", "20/dez", 44.9, "Volta às aulas é o segundo pico do ano em papelaria. Vira também linha fixa."],
    ["JAN", "Volta às aulas", "Kit Atividades Educativas", "Labirinto · Ligue os pontos · 7 erros · Caça-palavras · Contas · Pinte por número", "Escola e reforço", "20/dez", 47.9, "Atividade vale mais que só colorir — justifica preço maior pelo mesmo papel."],
    ["FEV", "Carnaval 06 a 09/02", "Kit Carnaval + Máscaras", "6 livrinhos + 6 máscaras destacáveis para colorir", "Escola, bloco infantil, festa", "15/jan", 42.9, "Máscara destacável usa o mesmo offset e é o que a criança leva no rosto."],
    ["FEV", "Volta às aulas 2ª onda", "Kit Professor — 30 sortidos + cartela de adesivos", "30 livrinhos + 100 adesivos de incentivo", "Professor e coordenação", "20/jan", 69.9, "Professor compra do próprio bolso e o adesivo é o que ele mais usa."],
    ["FEV", "Preparar Páscoa 28/03", "Kit Páscoa Bíblica — 8 títulos novos", "A última ceia · A entrada em Jerusalém · O jardim · A cruz · O túmulo vazio · A ressurreição · Maria Madalena · O caminho de Emaús", "Igreja, EBD, catequese", "10/fev", 49.9, "Páscoa bíblica é o par do Natal bíblico e tem o mesmo comprador."],
    ["FEV", "Preparar Páscoa", "Kit Páscoa Geral — 6 títulos novos", "Coelhinho · Ovos decorados · Cesta de Páscoa · A toca · Caça aos ovos · Amigos do coelho", "Escola, festa, chocolateria", "10/fev", 39.9, "Chocolateria compra para brindar junto com o ovo."],
    ["FEV", "Dia das Mulheres 08/03", "Kit Mulheres da Bíblia", "Débora · Rute e Noemi · Rainha Ester · Ana · A viúva pobre", "Igreja, grupo de mulheres", "já pronto", 32.9, "Os cinco títulos JÁ EXISTEM. É só capa e anúncio novos."],
  ];
  ideias.forEach((i, k) => {
    const r = linha(ws, i, { zebra: k % 2 === 1, cor: L_ROXO });
    r.getCell(3).font = { ...FONTE, bold: true };
    r.getCell(7).numFmt = BRL;
    if (i[5] === "já pronto") r.getCell(6).fill = fundo(L_OURO);
    r.height = 44;
  });
  ws.getRow(h).getCell(1).note = "Ordenado pelo mês em que a venda acontece.";
}

/* ══════════════════════════════════════════════════════════════
   Aba 3 — Kits com o acervo
   ══════════════════════════════════════════════════════════════ */
{
  const ws = wb.addWorksheet("Kits do acervo", { properties: { tabColor: { argb: VERDE } } });
  titulo(ws, "FRENTE 2 · KITS COM O QUE JÁ EXISTE", "Nenhuma arte nova. Só capa, embalagem e anúncio — os 47 títulos já estão impressos.", VERDE, 7);
  const cols = [
    { t: "KIT", w: 32 }, { t: "QTD", w: 7 }, { t: "TÍTULOS QUE ENTRAM", w: 66 },
    { t: "PÚBLICO", w: 26 }, { t: "PALAVRA-CHAVE DO ANÚNCIO", w: 34 },
    { t: "PREÇO SUGERIDO", w: 15 }, { t: "SITUAÇÃO", w: 26 },
  ];
  cabecalho(ws, cols, VERDE);

  const kits = [
    ["Mulheres da Bíblia", 5, "Débora a juíza sábia · Rute e Noemi · A corajosa rainha Ester · História de Ana · A viúva pobre", "Grupo de mulheres, igreja", "lembrancinha encontro de mulheres", 32.9, "PRONTO — 5 de 5 existem"],
    ["Heróis da Bíblia", 6, "Sansão · Rei Davi · Gideão e o pequeno exército · Josué · Daniel · Elias", "Meninos, EBD, acampamento", "livrinho heróis da bíblia colorir", 36.9, "PRONTO — 6 de 6 existem"],
    ["Coragem e Fé", 5, "Daniel · Rainha Ester · Gideão · Jó permanece fiel · Josué", "EBD, escola dominical", "lembrancinha ebd coragem fé", 32.9, "PRONTO — 5 de 5 existem"],
    ["Amizade e Família", 5, "Davi e Jônatas · Rute e Noemi · Caim e Abel · História de José · Adão e Eva", "Catequese, aula de valores", "livrinho valores amizade colorir", 32.9, "PRONTO — 5 de 5 existem"],
    ["Arca de Noé e os Animais", 4, "Arca de Noé · Noé e o arco-íris da promessa · A girafa que queria dançar · O coelhinho e a cenoura gigante", "Berçário, maternal, 2 a 5 anos", "livrinho arca de noé colorir bebê", 27.9, "PRONTO — mistura bíblico com temático"],
    ["Milagres e Encontros com Jesus", 3, "O sermão da montanha · Zaqueu encontra Jesus · Pedro e a pesca maravilhosa", "Catequese, EBD", "livrinho vida de jesus colorir", 24.9, "FALTAM TÍTULOS — só 3 de Jesus no acervo"],
    ["Começo de Tudo (Gênesis)", 6, "Adão e Eva · Caim e Abel · Arca de Noé · Noé e o arco-íris · Jacó e a escada · História de José", "EBD sequencial, 1º semestre", "livrinho gênesis colorir ebd", 36.9, "PRONTO — 6 de 6 existem"],
    ["Bichinhos e Natureza", 5, "A girafa que queria dançar · O coelhinho e a cenoura · A abelhinha trabalhadora · O gatinho e a lua · Jardim das borboletas", "Festa infantil, maternal", "lembrancinha festa bichinhos colorir", 32.9, "PRONTO — 5 de 5 existem"],
    ["Sonhar e Imaginar", 5, "A estrelinha perdida · A nuvem brincalhona · O balão colorido · A varinha mágica · O gatinho e a lua", "Festa, hora do soninho", "livrinho historinhas dormir colorir", 32.9, "PRONTO — 5 de 5 existem"],
    ["Transporte e Aventura", 4, "O trenzinho da alegria · O barquinho azul · O guarda-chuva viajante · A casa da árvore", "Festa de menino, 3 a 6 anos", "lembrancinha festa trem barco colorir", 27.9, "PRONTO — 4 de 4 existem"],
    ["Kit Experimente — 5 sortidos", 5, "5 títulos sortidos, bíblicos ou temáticos", "Primeira compra, teste", "livrinho colorir lembrancinha 5 unidades", 19.9, "NOVO FORMATO — hoje o menor é 10"],
    ["Kit Mês da EBD — 4 semanas", 4, "4 títulos bíblicos, um por domingo do mês", "Escola dominical", "revistinha ebd mensal colorir", 27.9, "PRONTO — recorte por calendário"],
  ];
  kits.forEach((k, i) => {
    const r = linha(ws, k, { zebra: i % 2 === 1, cor: L_VERDE });
    r.getCell(1).font = { ...FONTE, bold: true };
    r.getCell(6).numFmt = BRL;
    r.getCell(7).fill = fundo(String(k[6]).startsWith("PRONTO") ? "FFD9EAD3" : L_OURO);
    r.height = 42;
  });
}

/* ══════════════════════════════════════════════════════════════
   Aba 4 — Produtos para vender junto
   ══════════════════════════════════════════════════════════════ */
{
  const ws = wb.addWorksheet("Produtos juntos", { properties: { tabColor: { argb: LARANJA } } });
  titulo(ws, "FRENTE 3A · PRODUTOS PARA VENDER JUNTO", "O que o cliente já compra com o livrinho. Comprado de terceiro, revendido ou montado em kit.", LARANJA, 8);
  const cols = [
    { t: "PRODUTO", w: 30 }, { t: "COMO USAR", w: 40 }, { t: "PREÇO DE MERCADO", w: 30 },
    { t: "VENDE QUANTO", w: 18 }, { t: "ANÚNCIO DE REFERÊNCIA", w: 48 },
    { t: "PRIORIDADE", w: 12 }, { t: "POR QUE", w: 46 }, { t: "RISCO", w: 32 },
  ];
  cabecalho(ws, cols, LARANJA);

  const produtos = [
    ["Mini giz de cera 6 cores", "Uma caixinha por livrinho, dentro do kit", "30 caixas R$ 38 · 50 caixas R$ 54,90", "+1.000 vendidos", "https://www.mercadolivre.com.br/30-caixas-de-giz-de-cera-mini-05-cores-atacado-lembrancinha-pinta-brasil/p/MLB27590350", "1", "É o que falta no kit dela. 'giz de cera atacado' é o 3º termo mais buscado da categoria e 'mini giz de cera' o 4º.", "Comprado de terceiro — margem menor, estoque novo"],
    ["Mini lápis de cor 12 cores", "Alternativa ao giz, público mais velho (6 a 10 anos)", "20 caixas R$ 54,59 · 24 caixas R$ 62 a 79", "4,9 de avaliação", "https://lista.mercadolivre.com.br/mini-lapis-de-cor-6-cores-atacado", "2", "'kit mini lápis de cor' e 'kit 10 caixas lápis de cor' estão no top 11 da categoria Lápis.", "Mais caro por unidade que o giz"],
    ["Sacolinha kraft personalizada", "Embala o kit e leva a marca", "A definir com fornecedor local", "—", "https://lista.mercadolivre.com.br/sacola-kraft-personalizada-lembrancinha", "1", "Transforma 'livrinho solto' em 'kit' e sobe o preço sem mexer no produto.", "Precisa de arte e mínimo de tiragem"],
    ["Kit montado: livrinho + giz", "O produto, não o insumo: 30 livrinhos + 30 gizes", "Concorrente: 30 un por R$ 59", "+500 vendidos", "https://lista.mercadolivre.com.br/kit-livro-de-pintura-e-giz-de-cera-lembrancinha", "1", "É o anúncio que está ganhando dela hoje, no mesmo tamanho de kit.", "Precisa do giz em estoque antes de anunciar"],
    ["Massinha de modelar mini", "Terceiro item do kit de festa", "Aparece em kits de R$ 128 com 20 un", "—", "https://lista.mercadolivre.com.br/massinha-modelar-mini-lembrancinha-atacado", "3", "Aparece nos kits mais caros da concorrência (R$ 5,75 por conjunto).", "Validade e derretimento no verão"],
    ["Bolha de sabão mini", "Item de festa, barato, aumenta valor percebido", "Aparece em kits combinados", "—", "https://lista.mercadolivre.com.br/bolha-de-sabao-mini-lembrancinha-atacado", "3", "Entra nos kits de festa, não nos de igreja.", "Vaza no transporte"],
    ["Mola maluca", "Brinde de kit de festa", "Em kits de 15 a 20 un", "—", "https://lista.mercadolivre.com.br/mola-maluca-lembrancinha-atacado", "3", "Concorrente usa junto com livrinho em kits de R$ 197 a R$ 341.", "Margem baixa, item commodity"],
    ["Cartela de adesivos", "Dentro do kit, ou vendida solta ao professor", "Impressão própria — custo de offset", "—", "https://lista.mercadolivre.com.br/adesivo-incentivo-professor-atacado", "2", "'adesivos infantis' é o 3º e 'cartela de adesivos infantis' o 5º termo da categoria. E ela imprime.", "Precisa de corte / meio-corte"],
    ["Apontador e borracha mini", "Fecha o kit escolar", "Lote de 50 a partir de R$ 30", "—", "https://lista.mercadolivre.com.br/apontador-mini-lembrancinha-atacado", "4", "Só faz sentido no kit de volta às aulas.", "Muito commodity, pouca diferenciação"],
  ];
  produtos.forEach((p, i) => {
    const r = linha(ws, p, { zebra: i % 2 === 1, cor: L_LARANJA });
    r.getCell(1).font = { ...FONTE, bold: true };
    r.getCell(5).font = { ...FONTE, color: { argb: "FF0563C1" }, underline: true };
    if (p[4].startsWith("http")) r.getCell(5).value = { text: "ver anúncio", hyperlink: p[4] };
    const pri = Number(p[5]);
    r.getCell(6).fill = fundo(pri === 1 ? "FFD9EAD3" : pri === 2 ? L_OURO : L_CINZA);
    r.getCell(6).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(6).font = { ...FONTE, bold: true };
    r.height = 46;
  });
}

/* ══════════════════════════════════════════════════════════════
   Aba 5 — Produtos que a Imprimil imprime
   ══════════════════════════════════════════════════════════════ */
{
  const ws = wb.addWorksheet("Produtos impressos", { properties: { tabColor: { argb: AZUL } } });
  titulo(ws, "FRENTE 3B · PRODUTOS QUE A IMPRIMIL IMPRIME", "Mesma máquina, mesmo papel offset. Produto novo sem fornecedor novo.", AZUL, 7);
  const cols = [
    { t: "PRODUTO", w: 30 }, { t: "O QUE É", w: 46 }, { t: "PARA QUEM", w: 26 },
    { t: "PREÇO DE MERCADO", w: 26 }, { t: "REFERÊNCIA", w: 44 },
    { t: "ESFORÇO", w: 12 }, { t: "POR QUE VALE", w: 46 },
  ];
  cabecalho(ws, cols, AZUL);

  const itens = [
    ["Marcador de página bíblico", "Cartão 5x15 impresso 4x4, versículo e arte — lotes de 50 e 100", "Igreja, EBD, livraria cristã", "R$ 1 a 3 a unidade, lote de 50", "https://lista.mercadolivre.com.br/marca-pagina-personalizado-biblicos", "Baixo", "3 dos 6 termos MAIS BUSCADOS da categoria são religiosos: bíblico, evangélico e católico. Ela já imprime conteúdo bíblico."],
    ["Agenda / planner 2027 personalizado", "Agenda 2027, capa personalizada, miolo próprio", "Papelaria, empresa, igreja", "R$ 30 a 90", "https://lista.mercadolivre.com.br/agenda-personalizada-2027", "Médio", "'agenda personalizada 2027' é o termo NÚMERO 1 da categoria Agendas, e novembro é o mês em que se vende."],
    ["Cartela de adesivos de incentivo", "Carinhas, estrelas, 'parabéns' — 100 por cartela", "Professor, EBD, catequista", "R$ 15 a 30 por cartela grande", "https://lista.mercadolivre.com.br/adesivo-incentivo-professor", "Baixo", "Mesmo papel, mesma tinta. Só precisa de meio-corte."],
    ["Caderno de caligrafia", "Pauta de caligrafia, 16 a 32 páginas", "Alfabetização, reforço", "R$ 8 a 18 a unidade", "https://lista.mercadolivre.com.br/caderno-caligrafia-infantil", "Baixo", "Mesma dobra do livrinho, mais páginas. Vende o ano todo."],
    ["Bloco de atividades A5", "32 páginas de passatempo, capa colorida", "Escola, restaurante, consultório", "R$ 12 a 25", "https://lista.mercadolivre.com.br/bloco-atividades-infantil-atacado", "Baixo", "Dobro do preço do livrinho pelo mesmo processo."],
    ["Marcador de página", "Cartão impresso 5x15, 4x4, com verniz", "Igreja, livraria, escola", "R$ 1 a 3 a unidade, lotes de 50", "https://lista.mercadolivre.com.br/marcador-de-pagina-personalizado-atacado", "Baixo", "Sobra de papel vira produto. Margem alta por peça."],
    ["Caderno de desenho sem pauta", "Folha lisa, 40 páginas, capa personalizada", "Festa, escola, presente", "R$ 15 a 35", "https://lista.mercadolivre.com.br/caderno-desenho-infantil-personalizado", "Médio", "Ela já faz moleskine — é o mesmo processo, público infantil."],
    ["Planner / agenda 2027", "Planner mensal e semanal, capa personalizada", "Papelaria, professor, revenda", "R$ 30 a 90", "https://lista.mercadolivre.com.br/planner-2027", "Médio", "Carro-chefe da papelaria em 2026, e ela já faz caderno."],
    ["Convite infantil personalizado", "10 a 50 convites por tema de festa", "Mãe de festa, buffet", "R$ 25 a 60 o lote de 20", "https://lista.mercadolivre.com.br/convite-infantil-personalizado-atacado", "Médio", "Mesmo comprador do livrinho de lembrancinha, mesma festa."],
    ["Papel de parede infantil adesivo", "Rolo ou painel impresso", "Quarto infantil, escola", "R$ 60 a 200 o painel", "https://lista.mercadolivre.com.br/papel-de-parede-infantil-adesivo", "Alto", "Você citou. Exige outra impressora e outro insumo — projeto, não extensão."],
    ["Caneta personalizada a laser", "Gravação em caneta de brinde", "Empresa, evento, igreja", "R$ 2 a 8 a unidade", "https://lista.mercadolivre.com.br/caneta-personalizada-laser-atacado", "Alto", "Você citou. Precisa de máquina laser — outro negócio, não outra tiragem."],
    ["Cartela de atividades em lona", "Painel lavável para colorir e apagar", "Restaurante, buffet, consultório", "R$ 25 a 70", "https://lista.mercadolivre.com.br/painel-colorir-lavavel-infantil", "Alto", "Produto reutilizável, ticket alto, pouca concorrência."],
  ];
  itens.forEach((p, i) => {
    const r = linha(ws, p, { zebra: i % 2 === 1, cor: L_AZUL });
    r.getCell(1).font = { ...FONTE, bold: true };
    if (p[4].startsWith("http")) {
      r.getCell(5).value = { text: "ver no mercado", hyperlink: p[4] };
      r.getCell(5).font = { ...FONTE, color: { argb: "FF0563C1" }, underline: true };
    }
    r.getCell(6).fill = fundo(p[5] === "Baixo" ? "FFD9EAD3" : p[5] === "Médio" ? L_OURO : "FFF4CCCC");
    r.getCell(6).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(6).font = { ...FONTE, bold: true };
    r.height = 44;
  });
}

/* ══════════════════════════════════════════════════════════════
   Aba 6 — O que as pessoas digitam na busca do Mercado Livre
   Dado da API (/trends/MLB/{categoria}), não palpite.
   ══════════════════════════════════════════════════════════════ */
{
  const tend = JSON.parse(readFileSync("scratchpad/imprimil/tendencias.json", "utf8"));
  const ws = wb.addWorksheet("Mais buscados", { properties: { tabColor: { argb: OURO } } });
  titulo(ws, "O QUE AS PESSOAS DIGITAM NA BUSCA", "Termo real de busca do Mercado Livre, por categoria, na ordem em que mais buscam. Amarelo = termo que a Imprimil atende hoje ou atenderia sem fornecedor novo.", OURO, 4);

  const cols = [{ t: "CATEGORIA", w: 26 }, { t: "LUGAR", w: 9 }, { t: "O QUE DIGITAM", w: 52 }, { t: "VER A BUSCA", w: 30 }];
  cabecalho(ws, cols, OURO);

  /* O que nos interessa: religioso, personalizado, atacado, infantil,
     kit, mini, e o planner de 2027. É o filtro que separa "o mercado
     busca isso" de "a Imprimil pode vender isso". */
  const NOSSO = /biblic|evangelic|catolic|jesus|personaliz|atacado|infantil|kit |kit|mini |colorir|crianca|escolar|2027|lembrancinha|caligrafia|adesiv/i;

  for (const [cat, termos] of Object.entries(tend)) {
    const cab = ws.addRow([cat.toUpperCase(), "", "", ""]);
    cab.font = { ...FONTE, bold: true, size: 12, color: { argb: OURO_ESC } };
    cab.fill = fundo(L_OURO);
    cab.height = 26;
    cab.alignment = { vertical: "middle", indent: 1 };
    ws.mergeCells(cab.number, 1, cab.number, 4);

    for (const t of termos.slice(0, 15)) {
      const meu = NOSSO.test(t.termo);
      const r = linha(ws, ["", t.pos, t.termo, t.link], { zebra: meu, cor: L_OURO });
      r.height = 20;
      r.getCell(2).alignment = { horizontal: "center" };
      r.getCell(3).font = meu ? { ...FONTE, bold: true } : FONTE;
      r.getCell(4).value = { text: "ver a busca", hyperlink: t.link };
      r.getCell(4).font = { ...FONTE, color: { argb: "FF0563C1" }, underline: true };
    }
    ws.addRow([]);
  }
}

/* ══════════════════════════════════════════════════════════════
   Aba 7 — O que a Imprimil tem e vende hoje
   ══════════════════════════════════════════════════════════════ */
{
  const ws = wb.addWorksheet("Hoje", { properties: { tabColor: { argb: CINZA } } });
  titulo(ws, "O QUE A IMPRIMIL TEM E VENDE HOJE", "Catálogo e pedidos do sistema, 07/03 a 27/10/2026. É a base de tudo que foi sugerido.", CINZA, 5);

  const c1 = ws.addRow(["MAIS VENDIDOS", "UNID.", "RECEITA", "", ""]);
  c1.font = { ...FONTE, bold: true, color: { argb: "FFFFFFFF" } };
  c1.fill = fundo(CINZA);
  c1.height = 26;
  ws.columns = [{ width: 44 }, { width: 10 }, { width: 14 }, { width: 30 }, { width: 40 }];
  for (const [n, q, r] of [
    ["Kit 100 Livrinhos Colorir Infantil", 52, 2747.16],
    ["Kit 30 Livrinhos Bíblicos", 47, 1316.66],
    ["Kit 10 Cadernos Moleskine", 5, 338.5],
    ["Kit 50 Livrinhos Colorir", 4, 151.22],
    ["Kit 10 Livrinhos Bíblicos", 3, 51.11],
  ]) {
    const l = linha(ws, [n, q, r, "", ""]);
    l.getCell(3).numFmt = BRL;
    l.height = 22;
  }

  ws.addRow([]);
  const c2 = ws.addRow(["O ACERVO", "QUANTOS", "", "", ""]);
  c2.font = { ...FONTE, bold: true, color: { argb: "FFFFFFFF" } };
  c2.fill = fundo(CINZA);
  c2.height = 26;
  for (const [n, q] of [
    ["Títulos bíblicos", 30], ["Títulos temáticos", 17],
    ["Packs (10, 15, 30, 50, 100)", 5], ["Anúncios ativos no Meli", 37],
  ]) linha(ws, [n, q, "", "", ""]).height = 22;

  ws.addRow([]);
  const c3 = ws.addRow(["TÍTULOS BÍBLICOS", "", "TÍTULOS TEMÁTICOS", "", ""]);
  c3.font = { ...FONTE, bold: true, color: { argb: "FFFFFFFF" } };
  c3.fill = fundo(CINZA);
  c3.height = 26;
  const bib = ["Adão e Eva","Sansão","Arca de Noé","Caim e Abel","Samuel","Daniel","Elias","Apóstolo Paulo","Eliseu","Sermão da Montanha","Jonas","Rei Davi","Moisés","A viúva pobre","Histórias da Bíblia","Noé e o arco-íris","Davi e Jônatas","Gideão","Débora, a juíza sábia","Jó permanece fiel","Neemias","Pedro e a pesca","Zaqueu encontra Jesus","Jacó e a escada","Rute e Noemi","Rainha Ester","História de Ana","História de José","História de Josué","História de Ló"];
  const tem = ["Natal","Dia das Crianças","Robozinho amigo","A abelhinha trabalhadora","O guarda-chuva viajante","A casa da árvore","O barquinho azul","A girafa que queria dançar","O coelhinho e a cenoura","A festa dos brinquedos","Jardim das borboletas","O gatinho e a lua","A estrelinha perdida","O trenzinho da alegria","O balão colorido","A nuvem brincalhona","A varinha mágica"];
  for (let i = 0; i < Math.max(bib.length, tem.length); i++) {
    const l = linha(ws, [bib[i] ?? "", "", tem[i] ?? "", "", ""], { zebra: i % 2 === 1 });
    l.height = 18;
  }
}

await wb.xlsx.writeFile("output/IMPRIMIL-ideias-de-produto.xlsx");
console.log("escrito: output/IMPRIMIL-ideias-de-produto.xlsx");
console.log("  abas: " + wb.worksheets.map((w) => w.name).join(" · "));
