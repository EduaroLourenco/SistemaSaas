/**
 * Atualiza a apresentação da Boa Forma no lugar.
 *
 * Mexe em duas coisas e em mais nada: o texto dentro de `<a:t>` e os PNGs
 * dos gráficos. Layout, cor, fonte e posição ficam como estão — é a
 * apresentação dele, não uma nova.
 *
 * ── Por índice, e não por busca de texto ──
 *
 * A tabela do slide 4 tem células com "4", "6", "2". Trocar por busca
 * acertaria toda a numeração de rodapé junto. Então cada troca diz a
 * POSIÇÃO do `<a:t>` no slide e o texto que espera encontrar ali; se o
 * texto não bater, o script não grava nada. Melhor falhar do que entregar
 * metade dos números novos e metade dos velhos.
 *
 * ── A regra dos números ──
 *
 * VENDA é unidade de pedido não cancelado. VISITA é o relatório semanal
 * do canal, única fonte que tem visita. Receita e ticket saem do pedido.
 * A janela é 29/06 a 25/10 — 17 semanas fechadas; a que começou em 26/10
 * fica de fora porque ainda está correndo.
 *
 * Uso: node scripts/local/boa-forma-atualizar-ppt.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import JSZip from "jszip";

const ENTRADA = "scratchpad/bf/boaforma.pptx";
const SAIDA = "scratchpad/bf/Performance_Boa_Forma_Apresentacao_atualizada 27,10.pptx";
const IMAGENS = ["image-3-1.png", "image-3-2.png", "image-4-1.png", "image-5-1.png", "image-14-1.png"];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const desc = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** [índice do `<a:t>` no slide, texto esperado hoje, texto novo] */
const TROCAS = {
  "slide1.xml": [
    [2, "Análise semanal, por modelo e por produto — 18 semanas monitoradas",
        "Análise semanal, por modelo, por produto e por canal — 17 semanas monitoradas"],
    [3, "Período: 08/jun a 11/out  ·  Preparado em outubro/2026",
        "Período: 29/jun a 25/out  ·  Atualizado em 27/outubro/2026"],
  ],
  "slide2.xml": [
    [1, "Acumulado das 18 semanas monitoradas (08/jun a 11/out)",
        "Acumulado das 17 semanas monitoradas (29/jun a 25/out)"],
    [2, "30", "42"],
    [4, "7.510", "8.304"],
    [6, "50", "49"],
    [8, "0,67%", "0,59%"],
    [10, "R$ 1.330,73", "R$ 846,26"],
    [16, "15", "22"],
    [18, "15", "20"],
    [20, "3.281", "3.927"],
    [22, "4.229", "4.377"],
    [24, "31", "32"],
    [26, "19", "17"],
    [28, "0,94%", "0,81%"],
    [30, "0,45%", "0,39%"],
    [32, "R$ 1.218,33", "R$ 820,33"],
    [34, "R$ 1.443,12", "R$ 895,07"],
  ],
  "slide3.xml": [
    [1, "Visitas e vendas por semana, 18 semanas monitoradas (08/jun a 11/out)",
        "Visitas e vendas por semana, 17 semanas monitoradas (29/jun a 25/out)"],
    [5, "Semana 7 (1.238 visitas, 20/07-26/07)", "Semana 4 (1.292 visitas, 20/07 a 26/07)"],
    [7, "Semana 9 (11 vendas, 03/08-09/08)", "Semana 6 (9 vendas, 03/08 a 09/08)"],
  ],
  "slide4.xml": [
    [10, "14", "18"], [11, "5.472", "5.964"], [12, "38", "39"], [13, "0,69%", "0,65%"], [14, "R$ 1.258,12", "R$ 753,65"],
    [16, "4", "9"], [17, "305", "555"], [18, "6", "4"], [19, "1,97%", "0,72%"], [20, "R$ 1.009,24", "R$ 772,66"],
    [22, "4", "5"], [23, "341", "345"], [24, "3", "3"], [25, "0,88%", "0,87%"], [26, "R$ 2.019,57", "R$ 1.759,63"],
    [28, "6", "6"], [29, "1.244", "1.279"], [30, "2", "2"], [31, "0,16%", "0,16%"], [32, "R$ 1.225,87", "R$ 1.214,90"],
    [34, "2", "4"], [35, "148", "161"], [36, "1", "1"], [37, "0,68%", "0,62%"], [38, "R$ 1.418,84", "R$ 1.274,90"],
    [40, "30", "42"], [41, "7.510", "8.304"], [42, "50", "49"], [43, "0,67%", "0,59%"], [44, "R$ 1.330,73", "R$ 846,26"],
    [45, "Sport Light concentra 76% das vendas do portfólio (38 de 50), com o maior número de anúncios ativos (14).",
         "Sport Light concentra 80% das vendas do portfólio (39 de 49), com o maior número de anúncios ativos (18)."],
  ],
  "slide5.xml": [
    [1, "Quando e quanto cada produto vendeu, do mais vendido ao menos vendido — 18 semanas monitoradas",
        "Quando e quanto cada produto vendeu, do mais vendido ao menos vendido — 17 semanas monitoradas"],
  ],
  "slide14.xml": [
    [1, "Taxa de conversão (vendas ÷ visitas) por produto, semana a semana — 18 semanas monitoradas",
        "Taxa de conversão (vendas ÷ visitas) por produto, semana a semana — 17 semanas monitoradas"],
  ],
  "slide9.xml": [
    [1, "Leitura do desempenho acumulado nas 18 semanas monitoradas",
        "Leitura do desempenho acumulado nas 17 semanas monitoradas"],
    [4, "14 anúncios, 38 vendas acumuladas (76% do total) e ticket médio de R$ 1.258 — o modelo mais relevante em volume.",
        "18 anúncios, 39 vendas acumuladas (80% do total) e ticket médio de R$ 754 — o modelo mais relevante em volume."],
    [7, "Conversão de 0,94% no Clássico vs. 0,45% no Premium, mesmo com o Premium recebendo 29% mais visitas.",
        "Conversão de 0,81% no Clássico vs. 0,39% no Premium, mesmo com o Premium recebendo 11% mais visitas."],
    [9, "Pico de performance nas semanas 7 a 9", "Pico de performance nas semanas 4 a 6"],
    [10, "Entre 20/jul e 09/ago o portfólio somou 29 das 50 vendas do período (58%), coincidindo com as ações de julho.",
         "Entre 20/jul e 09/ago o portfólio somou 25 das 49 vendas do período (51%), coincidindo com as ações de julho."],
    [12, "Vendas zeram por 5 semanas e voltam nas semanas 17 e 18",
         "Vendas zeram por 5 semanas e voltam a partir da semana 14"],
    [13, "Nenhuma venda da semana 12 à 16 (24/ago a 20/set); as semanas 17 e 18 (28/set a 11/out) voltam a vender, com 3 vendas cada.",
         "Nenhuma venda da semana 9 à 13 (24/ago a 27/set); de 28/set a 25/out voltam 11 vendas, 4 delas na última semana fechada."],
    [15, "Arctic Springs: maior ticket, menor volume", "Mercado Livre responde por 100% das vendas"],
    [16, "Ticket médio de R$ 2.020, o mais alto da linha, mas com apenas 3 vendas acumuladas — oportunidade de mais tráfego.",
         "As 49 unidades do período saíram todas pelo Mercado Livre, somando R$ 41.467. Magalu e Shopee seguem sem venda da linha."],
  ],
  "slide15.xml": [
    [1, "Ações realizadas e planejamento de outubro — Ads, pré-acordo, afiliados e comunicação semanal",
        "49 vendas e R$ 41.467 em 17 semanas — 100% das vendas da linha  ·  Ads, pré-acordo, afiliados e comunicação semanal"],
  ],
  "slide16.xml": [
    [1, "Canal em ativação — produto, anúncio e campanha de visibilidade já em curso",
        "Sem venda da linha até 25/out — produto, anúncio e campanha de visibilidade já em curso"],
    [10, "Ainda sem vendas no canal — linha em fase de ativação (produto, anúncio e campanha recém-lançados).",
         "Zero venda da linha Boa Forma até 25/out — produto, anúncio e campanha recém-lançados."],
  ],
  "slide17.xml": [
    [1, "Canal novo — plano de ativação antes do início das vendas",
        "Sem venda da linha até 25/out — plano de ativação antes do início das vendas"],
  ],
};

const zip = await JSZip.loadAsync(readFileSync(ENTRADA));
const problemas = [];
let trocados = 0;

for (const [slide, trocas] of Object.entries(TROCAS)) {
  const caminho = `ppt/slides/${slide}`;
  if (!zip.files[caminho]) { problemas.push(`${slide}: não existe no arquivo`); continue; }
  const xml = await zip.files[caminho].async("string");

  /* Os `<a:t>` na ordem em que aparecem — a mesma ordem que o leitor
     imprime, que é de onde vêm os índices. */
  const marcas = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)];
  const porIndice = new Map(trocas.map((t) => [t[0], t]));
  for (const [i, t] of trocas.entries()) {
    if (!marcas[t[0]]) { problemas.push(`${slide}[${t[0]}]: não existe (o slide tem ${marcas.length} textos)`); continue; }
    const atual = desc(marcas[t[0]][1]);
    if (atual !== t[1]) problemas.push(`${slide}[${t[0]}]: esperava "${t[1]}" e achei "${atual}"`);
  }
  if (problemas.length) continue;

  /* Reconstrói o XML de trás para frente: assim o índice de cada marca
     continua valendo enquanto as anteriores ainda não foram mexidas. */
  let novo = xml;
  for (const t of [...trocas].sort((a, b) => b[0] - a[0])) {
    if (t[1] === t[2]) continue;
    const m = marcas[t[0]];
    novo = novo.slice(0, m.index) + `<a:t>${esc(t[2])}</a:t>` + novo.slice(m.index + m[0].length);
    trocados++;
  }
  zip.file(caminho, novo);
}

for (const nome of IMAGENS) {
  const origem = `scratchpad/bf/novas/${nome}`;
  if (!existsSync(origem)) { problemas.push(`imagem ${nome}: não foi gerada`); continue; }
  zip.file(`ppt/media/${nome}`, readFileSync(origem));
}

if (problemas.length) {
  console.log("NÃO GRAVEI. Resolva antes:");
  for (const p of problemas) console.log("  · " + p);
  process.exit(1);
}

writeFileSync(SAIDA, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(`escrito: ${SAIDA}`);
console.log(`  ${trocados} textos trocados · ${IMAGENS.length} gráficos redesenhados`);
