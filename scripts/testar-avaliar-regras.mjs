/**
 * O avaliador de regras.
 *
 * O que mais importa aqui é o terceiro caminho: campo sem dado não pode
 * virar "não". Numa operação sem custo cadastrado — 708 dos 716 produtos
 * da Probel — uma regra de margem reprovaria o catálogo inteiro e
 * pareceria uma decisão.
 *
 * Uso: node scripts/testar-avaliar-regras.mjs
 */
import { strict as assert } from "node:assert";
import { avaliarItem, avaliarCondicao, descrever } from "./lib/avaliar-regras.mjs";

const regra = (p) => ({
  id: p.id ?? "r1", nome: p.nome ?? "regra", ativa: p.ativa ?? true, ordem: p.ordem ?? 0,
  contaCanalId: p.contaCanalId ?? null, condicoes: p.condicoes ?? [],
  acao: p.acao ?? { tipo: "aceitar" }, quandoNaoSei: p.quandoNaoSei ?? "conferir",
});
const item = (p) => ({ mlb: "MLB1", contaCanalId: "conta-a", ...p });

/* ── Comparações ── */
assert.equal(avaliarCondicao({ campo: "venda.unidades30", operador: "menor", valor: 10 }, item({ "venda.unidades30": 3 })), "sim");
assert.equal(avaliarCondicao({ campo: "venda.unidades30", operador: "menor", valor: 10 }, item({ "venda.unidades30": 30 })), "nao");
assert.equal(avaliarCondicao({ campo: "campanha.tipo", operador: "em", valor: "DEAL,SMART" }, item({ "campanha.tipo": "smart" })), "sim");
assert.equal(avaliarCondicao({ campo: "campanha.nome", operador: "contem", valor: "black" }, item({ "campanha.nome": "11.11 da Black" })), "sim");

/* ── O terceiro caminho ── */
for (const vazio of [null, undefined, ""]) {
  assert.equal(
    avaliarCondicao({ campo: "margem.pct", operador: "maior", valor: 20 }, item({ "margem.pct": vazio })),
    "nao_sei",
    "campo vazio é 'não sei', nunca 'não'"
  );
}
/* Zero é um valor, não ausência: estoque 0 responde, não some. */
assert.equal(avaliarCondicao({ campo: "anuncio.estoque", operador: "menor", valor: 5 }, item({ "anuncio.estoque": 0 })), "sim");
/* Texto onde se espera número também é "não sei", não NaN reprovando. */
assert.equal(avaliarCondicao({ campo: "ads.acos", operador: "maior", valor: 10 }, item({ "ads.acos": "sem dado" })), "nao_sei");

/* ── Primeira que bate decide ── */
{
  const r = avaliarItem(item({ "campanha.tipo": "DEAL", "venda.unidades30": 2 }), [
    regra({ id: "geral", ordem: 10, acao: { tipo: "aceitar" } }),
    regra({ id: "excecao", ordem: 1, condicoes: [{ campo: "venda.unidades30", operador: "menor", valor: 10 }], acao: { tipo: "conferir" } }),
  ]);
  assert.equal(r.regraId, "excecao", "a de ordem menor decide");
  assert.equal(r.decisao, "conferir");
}

/* ── quandoNaoSei ── */
{
  const base = { condicoes: [{ campo: "margem.pct", operador: "maior", valor: 20 }], acao: { tipo: "aceitar" } };
  const i = item({ "margem.pct": null });
  assert.equal(avaliarItem(i, [regra({ ...base, quandoNaoSei: "conferir" })]).decisao, "conferir");
  assert.equal(avaliarItem(i, [regra({ ...base, quandoNaoSei: "nao_entrar" })]).decisao, "nao_entrar");
  /* "pular" segue para a próxima regra, em vez de decidir no escuro. */
  const pulou = avaliarItem(i, [
    regra({ id: "margem", ordem: 1, ...base, quandoNaoSei: "pular" }),
    regra({ id: "geral", ordem: 2, acao: { tipo: "aceitar" } }),
  ]);
  assert.equal(pulou.regraId, "geral");
  /* E o que faltou vai junto, para a tela poder mandar preencher. */
  assert.deepEqual(avaliarItem(i, [regra({ ...base, quandoNaoSei: "conferir" })]).faltou, ["margem.pct"]);
}

/* Falta de dado NÃO salva item que já reprovou em outra condição. */
{
  const r = avaliarItem(item({ "margem.pct": null, "campanha.tipo": "SMART" }), [
    regra({
      condicoes: [
        { campo: "campanha.tipo", operador: "igual", valor: "DEAL" },
        { campo: "margem.pct", operador: "maior", valor: 20 },
      ],
      quandoNaoSei: "conferir",
    }),
  ]);
  assert.equal(r.decisao, "sem_regra", "reprovou no tipo: o 'não sei' da margem não manda");
}

/* ── Regra de outra conta não se aplica ── */
{
  const r = avaliarItem(item({ "campanha.tipo": "DEAL" }), [regra({ contaCanalId: "conta-b" })]);
  assert.equal(r.decisao, "sem_regra");
}
/* Regra desligada idem. */
assert.equal(avaliarItem(item({}), [regra({ ativa: false })]).decisao, "sem_regra");

/* ── A frase que a tela mostra ── */
assert.equal(
  descrever(regra({
    condicoes: [{ campo: "campanha.tipo", operador: "igual", valor: "LIGHTNING" }, { campo: "venda.unidades30", operador: "menor", valor: 10 }],
    acao: { tipo: "conferir" },
  })),
  "tipo da campanha é LIGHTNING e vendas em 30 dias < 10 → mandar para conferência"
);

console.log("avaliador de regras: ok");
