/**
 * Boa Forma: deck de 03/11 -> 10/11 (19 semanas, 29/jun a 08/nov).
 * Mesmo método de boa-forma-atualizar-ppt.mjs: troca por índice de <a:t>
 * com texto esperado; se algo não bater, não grava.
 * Entrada: scratchpad/bf/{analise,graficos}.json e novas/*.png (regerados).
 */
import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";
const PASTA = "G:/.shortcut-targets-by-id/12ubsGaHgo3GYGooSbVTbh_UjVz0xcG86/02_Canais de Venda/12. KPIs/";
const ENTRADA = PASTA + "Performance_Boa_Forma_Apresentacao_atualizada 0311.pptx";
const SAIDA = PASTA + "Performance_Boa_Forma_Apresentacao_atualizada 1011.pptx";
const IMG = { "image1.png": "image-3-1.png", "image2.png": "image-3-2.png", "image3.png": "image-4-1.png", "image4.png": "image-5-1.png", "image5.png": "image-14-1.png" };
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const desc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const T = {
  1: [[2, "18 semanas monitoradas", "19 semanas monitoradas"], [3, "29/jun a 01/nov  ·  Atualizado em 03/novembro/2026", "29/jun a 08/nov  ·  Atualizado em 10/novembro/2026"]],
  2: [[1, "18 semanas monitoradas (29/jun a 01/nov)", "19 semanas monitoradas (29/jun a 08/nov)"],
      [4, "8.617", "8.865"], [6, "56", "59"], [8, "0,65%", "0,67%"], [10, "R$ 811,12", "R$ 789,08"],
      [20, "4.195", "4.433"], [22, "4.422", "4.432"], [24, "37", "40"], [28, "0,88%", "0,90%"], [32, "R$ 774,48", "R$ 749,00"], [34, "R$ 882,46", "R$ 878,12"]],
  3: [[1, "18 semanas monitoradas (29/jun a 01/nov)", "19 semanas monitoradas (29/jun a 08/nov)"]],
  4: [[11, "6.210", "6.405"], [12, "46", "49"], [13, "0,74%", "0,77%"], [14, "R$ 724,96", "R$ 701,92"], [19, "0,70%", "0,69%"],
      [17, "571", "581"], [29, "1.317", "1.345"], [31, "0,15%", "0,15%"], [23, "352", "361"], [25, "0,85%", "0,83%"], [35, "167", "173"], [37, "0,60%", "0,58%"],
      [41, "8.617", "8.865"], [42, "56", "59"], [43, "0,65%", "0,67%"], [44, "R$ 811,12", "R$ 789,08"],
      [45, "Sport Light concentra 82% das vendas do portfólio (46 de 56), com o maior número de anúncios ativos (18).", "Sport Light concentra 83% das vendas do portfólio (49 de 59), com o maior número de anúncios ativos (18)."]],
  5: [[1, "18 semanas monitoradas", "19 semanas monitoradas"]],
  6: [[1, "18 semanas monitoradas", "19 semanas monitoradas"]],
  7: [[1, "18 semanas monitoradas", "19 semanas monitoradas"],
      [4, "18 anúncios, 46 vendas acumuladas (82% do total) e ticket médio de R$ 725 — o modelo mais relevante em volume.", "18 anúncios, 49 vendas acumuladas (83% do total) e ticket médio de R$ 702 — o modelo mais relevante em volume."],
      [7, "Conversão de 0,88% no Clássico vs. 0,43% no Premium, mesmo com o Premium recebendo 5% mais visitas.", "Conversão de 0,90% no Clássico vs. 0,43% no Premium, com o mesmo volume de visitas nos dois."],
      [10, "Entre 20/jul e 09/ago o portfólio somou 25 das 56 vendas do período (45%), coincidindo com as ações de julho.", "Entre 20/jul e 09/ago o portfólio somou 25 das 59 vendas do período (42%), coincidindo com as ações de julho."],
      [12, "Vendas zeram por 5 semanas e a retomada ganha força", "Vendas zeram por 5 semanas e voltam em 28/set"],
      [13, "Nenhuma venda da semana 9 à 13 (24/ago a 27/set); de 28/set a 01/nov voltam 17 vendas, 6 delas na última semana fechada.", "Nenhuma venda da semana 9 à 13 (24/ago a 27/set); de 28/set a 08/nov voltam 20 vendas, 3 delas na última semana fechada."],
      [16, "As 56 unidades do período saíram todas pelo Mercado Livre, somando R$ 45.422. Magalu e Shopee seguem sem venda da linha.", "As 59 unidades do período saíram todas pelo Mercado Livre, somando R$ 45.766. Magalu e Shopee seguem sem venda da linha."]],
  8: [[1, "56 vendas e R$ 45.422 em 18 semanas", "59 vendas e R$ 45.766 em 19 semanas"].map((x,i)=>i==1?"56 vendas e R$ 45.422 em 18 semanas — 100% das vendas da linha  ·  Ads, pré-acordo, afiliados e comunicação semanal":x)[0] && "ignore"].slice(0,0),
  9: [[1, "Sem venda da linha até 01/nov — produto, anúncio e campanha de visibilidade já em curso", "Sem venda da linha até 08/nov — produto, anúncio e campanha de visibilidade já em curso"],
      [10, "Zero venda da linha Boa Forma até 01/nov — produto, anúncio e campanha recém-lançados.", "Zero venda da linha Boa Forma até 08/nov — produto, anúncio e campanha recém-lançados."]],
  10: [[1, "Sem venda da linha até 01/nov — plano de ativação antes do início das vendas", "Sem venda da linha até 08/nov — plano de ativação antes do início das vendas"]],
  11: [[1, "vendas e última venda: 18 semanas até 01/nov", "vendas e última venda: 19 semanas até 08/nov"], [4, "Vendas 18 sem.", "Vendas 19 sem."],
       [12, "20", "23"], [14, "R$ 435,82 (31/10)", "R$ 434,82 (03/11)"]],
};
T[8] = [[1, "56 vendas e R$ 45.422 em 18 semanas — 100% das vendas da linha  ·  Ads, pré-acordo, afiliados e comunicação semanal", "59 vendas e R$ 45.766 em 19 semanas — 100% das vendas da linha  ·  Ads, pré-acordo, afiliados e comunicação semanal"]];

const zip = await JSZip.loadAsync(readFileSync(ENTRADA));
const erros = [];
for (const [n, trocas] of Object.entries(T)) {
  const f = `ppt/slides/slide${n}.xml`;
  let xml = await zip.files[f].async("string");
  const m = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)];
  for (const [i, velho] of trocas) {
    const a = m[i] && desc(m[i][1]);
    /* o texto esperado pode ser só um trecho do <a:t> (subtítulos longos) */
    if (a == null || !a.includes(velho)) erros.push(`slide${n}[${i}]: "${velho}" não está em "${a}"`);
  }
  if (erros.length) continue;
  for (const [i, velho, novo] of [...trocas].sort((a, b) => b[0] - a[0])) {
    const x = m[i], t = desc(x[1]).replace(velho, novo);
    xml = xml.slice(0, x.index) + `<a:t>${esc(t)}</a:t>` + xml.slice(x.index + x[0].length);
  }
  zip.file(f, xml);
}
for (const [alvo, fonte] of Object.entries(IMG)) zip.file(`ppt/media/${alvo}`, readFileSync(`scratchpad/bf/novas/${fonte}`));
if (erros.length) { console.log("NÃO GRAVEI:\n" + erros.join("\n")); process.exit(1); }
writeFileSync(SAIDA, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log("escrito", SAIDA);
