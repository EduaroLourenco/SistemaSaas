/**
 * A agenda de Automações: 17 linhas do canal viram 13 campanhas.
 *
 * O corpo é a RESPOSTA REAL do Mercado Livre nas duas contas da Probel
 * em 04/11/2026 — nenhum número foi inventado. `agora` é fixo no
 * instante da coleta, senão o teste muda de resultado todo dia.
 *
 * Roda: node scripts/testar-agenda-promocoes.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(raiz, "src") }, interopDefault: true });
const { agruparCampanhas, oQueNaoEspera, GRUPOS } = await jiti.import(path.join(raiz, "src/lib/agenda-promocoes.ts"));

const CAPTURA = {
 "geradoEm": "2026-11-04T03:28:43.452Z",
 "promocoes": [
  {
   "codigo": "LGH-MLB1000",
   "tipo": "LIGHTNING",
   "nome": null,
   "prazo": null,
   "fim": null,
   "contaId": "a37f9d9b-5bc7-4a94-a569-578942a93c81",
   "contaNome": "São Paulo — pronta entrega"
  },
  {
   "codigo": "P-MLB17937078",
   "tipo": "SMART",
   "nome": "Impulsione suas vendas",
   "prazo": "2027-02-20T02:50:00Z",
   "fim": "2027-02-20T02:50:00Z",
   "contaId": "a37f9d9b-5bc7-4a94-a569-578942a93c81",
   "contaNome": "São Paulo — pronta entrega"
  },
  {
   "codigo": "P-MLB18055120",
   "tipo": "SMART_LIGHTNING",
   "nome": "OFERTAS RELÂMPAGOS IMPERDÍVEIS",
   "prazo": "2027-03-10T23:30:00Z",
   "fim": "2027-03-10T23:30:00Z",
   "contaId": "a37f9d9b-5bc7-4a94-a569-578942a93c81",
   "contaNome": "São Paulo — pronta entrega"
  },
  {
   "codigo": "P-MLB18159042",
   "tipo": "SMART",
   "nome": "FH Furn ME2 MeliPro Medio",
   "prazo": "2026-11-13T02:00:00Z",
   "fim": "2026-11-13T02:00:00Z",
   "contaId": "a37f9d9b-5bc7-4a94-a569-578942a93c81",
   "contaNome": "São Paulo — pronta entrega"
  },
  {
   "codigo": "P-MLB18159044",
   "tipo": "SMART",
   "nome": "FH Furn ME2 SD Medio OutN",
   "prazo": "2026-12-14T02:00:00Z",
   "fim": "2026-12-14T02:00:00Z",
   "contaId": "a37f9d9b-5bc7-4a94-a569-578942a93c81",
   "contaNome": "São Paulo — pronta entrega"
  },
  {
   "codigo": "P-MLB17909028",
   "tipo": "DEAL",
   "nome": "11.11 da Black",
   "prazo": "2026-11-12T02:00:00Z",
   "fim": "2026-11-12T03:00:00Z",
   "contaId": "a37f9d9b-5bc7-4a94-a569-578942a93c81",
   "contaNome": "São Paulo — pronta entrega"
  },
  {
   "codigo": "C-MLB6114065",
   "tipo": "SELLER_COUPON_CAMPAIGN",
   "nome": "Cupom para carrinhos abandonados",
   "prazo": null,
   "fim": "2026-12-20T02:59:59Z",
   "contaId": "a37f9d9b-5bc7-4a94-a569-578942a93c81",
   "contaNome": "São Paulo — pronta entrega"
  },
  {
   "codigo": "P-MLB18175026",
   "tipo": "PRE_NEGOTIATED",
   "nome": "Pre Acordo Casa",
   "prazo": "2026-12-16T02:00:00Z",
   "fim": "2026-12-16T02:00:00Z",
   "contaId": "a37f9d9b-5bc7-4a94-a569-578942a93c81",
   "contaNome": "São Paulo — pronta entrega"
  },
  {
   "codigo": "P-MLB18193088",
   "tipo": "SMART",
   "nome": "CPP FH Novembro",
   "prazo": "2026-12-13T02:00:00Z",
   "fim": "2026-12-13T02:00:00Z",
   "contaId": "a37f9d9b-5bc7-4a94-a569-578942a93c81",
   "contaNome": "São Paulo — pronta entrega"
  },
  {
   "codigo": "P-MLB17911004",
   "tipo": "DEAL",
   "nome": "Black Friday 2026",
   "prazo": "2026-11-30T15:00:00Z",
   "fim": "2026-12-01T03:00:00Z",
   "contaId": "a37f9d9b-5bc7-4a94-a569-578942a93c81",
   "contaNome": "São Paulo — pronta entrega"
  },
  {
   "codigo": "LGH-MLB1000",
   "tipo": "LIGHTNING",
   "nome": null,
   "prazo": null,
   "fim": null,
   "contaId": "a730ac84-4352-4b10-92f7-14b3ff47f186",
   "contaNome": "2ª conta — venda a prazo"
  },
  {
   "codigo": "P-MLB18099366",
   "tipo": "PRICE_MATCHING",
   "nome": "Saia na frente da concorrência e reduza suas tarifas de venda",
   "prazo": "2027-04-11T03:00:00Z",
   "fim": "2027-04-11T03:00:00Z",
   "contaId": "a730ac84-4352-4b10-92f7-14b3ff47f186",
   "contaNome": "2ª conta — venda a prazo"
  },
  {
   "codigo": "P-MLB18161018",
   "tipo": "SMART",
   "nome": "FH Furn ME1 MeliPro Alto",
   "prazo": "2026-11-13T02:00:00Z",
   "fim": "2026-11-13T02:00:00Z",
   "contaId": "a730ac84-4352-4b10-92f7-14b3ff47f186",
   "contaNome": "2ª conta — venda a prazo"
  },
  {
   "codigo": "P-MLB18159034",
   "tipo": "SMART",
   "nome": "FH Furn ME1 SD Medio OutN",
   "prazo": "2026-12-14T02:00:00Z",
   "fim": "2026-12-14T02:00:00Z",
   "contaId": "a730ac84-4352-4b10-92f7-14b3ff47f186",
   "contaNome": "2ª conta — venda a prazo"
  },
  {
   "codigo": "P-MLB17909028",
   "tipo": "DEAL",
   "nome": "11.11 da Black",
   "prazo": "2026-11-12T02:00:00Z",
   "fim": "2026-11-12T03:00:00Z",
   "contaId": "a730ac84-4352-4b10-92f7-14b3ff47f186",
   "contaNome": "2ª conta — venda a prazo"
  },
  {
   "codigo": "P-MLB18175026",
   "tipo": "PRE_NEGOTIATED",
   "nome": "Pre Acordo Casa",
   "prazo": "2026-12-16T02:00:00Z",
   "fim": "2026-12-16T02:00:00Z",
   "contaId": "a730ac84-4352-4b10-92f7-14b3ff47f186",
   "contaNome": "2ª conta — venda a prazo"
  },
  {
   "codigo": "P-MLB17911004",
   "tipo": "DEAL",
   "nome": "Black Friday 2026",
   "prazo": "2026-11-30T15:00:00Z",
   "fim": "2026-12-01T03:00:00Z",
   "contaId": "a730ac84-4352-4b10-92f7-14b3ff47f186",
   "contaNome": "2ª conta — venda a prazo"
  }
 ],
 "contagens": {
  "a37f9d9b-5bc7-4a94-a569-578942a93c81LGH-MLB1000": {
   "participando": 0,
   "agendados": 0,
   "pendentes": 136,
   "rebate": null
  },
  "a37f9d9b-5bc7-4a94-a569-578942a93c81P-MLB17937078": {
   "participando": 226,
   "agendados": 0,
   "pendentes": 15,
   "rebate": {
    "de": 0,
    "ate": 3.9
   }
  },
  "a37f9d9b-5bc7-4a94-a569-578942a93c81P-MLB18055120": {
   "participando": 0,
   "agendados": 0,
   "pendentes": 51,
   "rebate": {
    "de": 0.7,
    "ate": 3.5
   }
  },
  "a37f9d9b-5bc7-4a94-a569-578942a93c81P-MLB18159042": {
   "participando": 164,
   "agendados": 0,
   "pendentes": 5,
   "rebate": {
    "de": 0.1,
    "ate": 1.3
   }
  },
  "a37f9d9b-5bc7-4a94-a569-578942a93c81P-MLB18159044": {
   "participando": 171,
   "agendados": 0,
   "pendentes": 4,
   "rebate": {
    "de": 0.1,
    "ate": 1.3
   }
  },
  "a37f9d9b-5bc7-4a94-a569-578942a93c81P-MLB17909028": {
   "participando": 219,
   "agendados": 0,
   "pendentes": 79,
   "rebate": null
  },
  "a37f9d9b-5bc7-4a94-a569-578942a93c81C-MLB6114065": {
   "participando": 0,
   "agendados": 0,
   "pendentes": 298,
   "rebate": null
  },
  "a37f9d9b-5bc7-4a94-a569-578942a93c81P-MLB18175026": {
   "participando": 100,
   "agendados": 91,
   "pendentes": 1,
   "rebate": {
    "de": 2.2,
    "ate": 4.4
   }
  },
  "a37f9d9b-5bc7-4a94-a569-578942a93c81P-MLB18193088": {
   "participando": 183,
   "agendados": 0,
   "pendentes": 3,
   "rebate": {
    "de": 0.4,
    "ate": 2.2
   }
  },
  "a37f9d9b-5bc7-4a94-a569-578942a93c81P-MLB17911004": {
   "participando": 0,
   "agendados": 195,
   "pendentes": 103,
   "rebate": null
  },
  "a730ac84-4352-4b10-92f7-14b3ff47f186LGH-MLB1000": {
   "participando": 0,
   "agendados": 0,
   "pendentes": 0,
   "rebate": null
  },
  "a730ac84-4352-4b10-92f7-14b3ff47f186P-MLB18099366": {
   "participando": 9,
   "agendados": 0,
   "pendentes": 0,
   "rebate": {
    "de": 2.2,
    "ate": 3.3
   }
  },
  "a730ac84-4352-4b10-92f7-14b3ff47f186P-MLB18161018": {
   "participando": 394,
   "agendados": 0,
   "pendentes": 41,
   "rebate": {
    "de": 0.1,
    "ate": 3.9
   }
  },
  "a730ac84-4352-4b10-92f7-14b3ff47f186P-MLB18159034": {
   "participando": 448,
   "agendados": 0,
   "pendentes": 14,
   "rebate": {
    "de": 0.6,
    "ate": 3.6
   }
  },
  "a730ac84-4352-4b10-92f7-14b3ff47f186P-MLB17909028": {
   "participando": 4,
   "agendados": 2,
   "pendentes": 743,
   "rebate": null
  },
  "a730ac84-4352-4b10-92f7-14b3ff47f186P-MLB18175026": {
   "participando": 59,
   "agendados": 55,
   "pendentes": 6,
   "rebate": {
    "de": 1.8,
    "ate": 4.3
   }
  },
  "a730ac84-4352-4b10-92f7-14b3ff47f186P-MLB17911004": {
   "participando": 0,
   "agendados": 600,
   "pendentes": 150,
   "rebate": null
  }
 }
};

const agora = new Date(CAPTURA.geradoEm).getTime();
const contagens = new Map(Object.entries(CAPTURA.contagens));
const campanhas = agruparCampanhas(CAPTURA.promocoes, contagens, agora);

/* ── 17 linhas do canal, 13 campanhas ── */
assert.equal(CAPTURA.promocoes.length, 17, "a captura tem 17 linhas por conta");
assert.equal(campanhas.length, 13, "13 campanhas distintas");

/* As quatro que existem nas DUAS contas: é por elas que o carrossel
   mostrava a mesma decisão duas vezes. */
const emDuas = campanhas.filter((c) => c.contas.length === 2).map((c) => c.codigo).sort();
assert.deepEqual(emDuas, ["LGH-MLB1000", "P-MLB17909028", "P-MLB17911004", "P-MLB18175026"]);

/* ── os totais batem com a soma das linhas ── */
const soma = (campo) => CAPTURA.promocoes.reduce((s, p) => s + (CAPTURA.contagens[p.contaId + p.codigo][campo] ?? 0), 0);
assert.equal(campanhas.reduce((s, c) => s + c.noAr, 0), soma("participando"));
assert.equal(campanhas.reduce((s, c) => s + c.agendados, 0), soma("agendados"));
assert.equal(campanhas.reduce((s, c) => s + c.pendentes, 0), soma("pendentes"));
assert.equal(campanhas.reduce((s, c) => s + c.pendentes, 0), 1649, "esperando resposta");
assert.equal(campanhas.reduce((s, c) => s + c.agendados, 0), 943, "agendados");
assert.equal(campanhas.reduce((s, c) => s + c.noAr, 0), 1977, "no ar");

/* ── o número herói ── */
const heroi = oQueNaoEspera(campanhas);
assert.equal(heroi.prazo, 9, "o mais longo do grupo urgente");
assert.equal(heroi.esperando, 868, "itens esperando no que vence em até 9 dias");
assert.equal(heroi.urgentes.length, 3);

/* ── os grupos ── */
const tamanho = GRUPOS.map((g) => campanhas.filter((c) => g.cabe(c.dias)).length);
assert.deepEqual(tamanho, [3, 5, 3, 2], "esta semana, este mês, depois, sem prazo");
/* Todo mundo cai em exatamente um grupo: grupo que se sobrepõe some com
   campanha ou mostra duas vezes. */
for (const c of campanhas) {
  assert.equal(GRUPOS.filter((g) => g.cabe(c.dias)).length, 1, `${c.codigo} em um grupo só`);
}

/* ── prazo de ACEITE, nunca o fim da campanha ── */
const cupom = campanhas.find((c) => c.tipo === "SELLER_COUPON_CAMPAIGN");
assert.equal(cupom.prazo, null, "o cupom não tem prazo de aceite");
assert.ok(cupom.fim, "mas tem fim de campanha, e ele não vira prazo");
assert.equal(cupom.dias, null, "por isso cai em Sem prazo de aceite");

/* ── o prazo da campanha é o MAIS CURTO entre as contas ── */
for (const c of campanhas) {
  const prazos = CAPTURA.promocoes.filter((p) => p.codigo === c.codigo).map((p) => p.prazo).filter(Boolean);
  assert.equal(c.prazo, prazos.length ? prazos.sort()[0] : null, `prazo de ${c.codigo}`);
}

/* ── o pré-acordo do consultor, que é o que o Eduardo foi procurar ── */
const pre = campanhas.find((c) => c.tipo === "PRE_NEGOTIATED");
assert.ok(pre, "o pré-acordo existe");
assert.equal(pre.nome, "Pre Acordo Casa");
assert.equal(pre.contas.length, 2, "nas duas contas");
assert.equal(pre.dias, 42);
assert.deepEqual({ noAr: pre.noAr, agendados: pre.agendados, pendentes: pre.pendentes }, { noAr: 159, agendados: 146, pendentes: 7 });
assert.ok(pre.rebate && pre.rebate.de === 1.8 && pre.rebate.ate === 4.4, "rebate de 1,8 a 4,4%");

/* ── a relâmpago vem SEM nome do canal, e não pode virar "Sem nome" ── */
const lgh = campanhas.find((c) => c.codigo === "LGH-MLB1000");
assert.equal(lgh.nome, "Oferta relâmpago do canal");
assert.equal(lgh.dias, null, "ela não tem prazo de aceite");
assert.equal(lgh.rebate, null, "e não tem rebate");

/* ── zero, nulo e parcial são três coisas ── */
const semResposta = agruparCampanhas(CAPTURA.promocoes, new Map(), agora);
assert.ok(semResposta.every((c) => c.incerto), "sem contagem, tudo é 'não sei'");
assert.ok(semResposta.every((c) => c.pendentes === 0), "o acumulador fica em zero, mas a tela lê `incerto`");
const meiaResposta = agruparCampanhas(
  CAPTURA.promocoes,
  new Map([["2d4607c0" + "x", null], ...Object.entries(CAPTURA.contagens).slice(0, 1)]),
  agora
);
assert.ok(meiaResposta.some((c) => c.incerto), "uma conta sem resposta já torna a campanha parcial");

/* ── campanha de uma conta só não é parcial quando essa conta respondeu ── */
const umaConta = campanhas.filter((c) => c.contas.length === 1);
assert.ok(umaConta.length === 9 && umaConta.every((c) => !c.incerto));

console.log(`${campanhas.length} campanhas de ${CAPTURA.promocoes.length} linhas`);
for (const g of GRUPOS) {
  const itens = campanhas.filter((c) => g.cabe(c.dias));
  if (itens.length) console.log(`  ${g.titulo}: ${itens.map((c) => `${c.nome} (${c.dias ?? "—"}d, ${c.pendentes})`).join(", ")}`);
}
console.log(`herói: ${heroi.esperando} itens vencem em até ${heroi.prazo} dias`);
console.log("tudo certo.");
