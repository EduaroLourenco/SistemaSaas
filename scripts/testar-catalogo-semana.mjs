/**
 * Catálogo semana contra semana: o retrato certo e quem trocou de lado.
 *
 * A regra que este teste protege é a que explica a queda de São Paulo: a
 * conta ganhava 63 disputas em 06/10 e passou a ganhar 1 em 13/10. Se a
 * comparação somasse dias em vez de comparar dois retratos, a semana
 * incompleta sempre pareceria pior — e o alerta dispararia todo dia, que é
 * o mesmo que não disparar nunca.
 *
 * Confere, com dados montados à mão:
 *   · cada semana é lida no seu ÚLTIMO dia medido, não no primeiro nem na soma;
 *   · "perdeu" é ganhar antes e não ganhar agora, e só para anúncio medido
 *     nos dois retratos — quem entrou ou saiu da disputa não conta;
 *   · dividir o primeiro lugar conta como ganhar (está na vitrine);
 *   · semana anterior sem leitura nenhuma devolve comparação nula, não zero.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
/* `server-only` existe para barrar o import no cliente; aqui não há
   cliente nenhum, e sem o atalho o módulo nem carrega. */
const vazio = path.join(mkdtempSync(path.join(tmpdir(), "gerizo-")), "vazio.cjs");
writeFileSync(vazio, "module.exports={}");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(raiz, "src"), "server-only": vazio }, interopDefault: true });
const { carregarCatalogoSemana, estadoDeCatalogo } = await jiti.import(
  path.join(raiz, "src/lib/dados/catalogo-semana.ts")
);

/** Um Supabase de mentira que só sabe devolver as linhas de catálogo. */
function fingirBanco(linhas) {
  const consulta = {
    select: () => consulta,
    gte: () => consulta,
    order: () => consulta,
    range: (de, ate) => Promise.resolve({ data: linhas.slice(de, ate + 1), error: null }),
  };
  return { from: () => consulta };
}

const contas = [
  { id: "c1", nome: "São Paulo" },
  { id: "c2", nome: "A prazo" },
];
const anuncios = [
  { id: "a1", codigo_externo: "MLB1", sku_canal: "pa1", titulo: "Colchão 1", conta_canal_id: "c1" },
  { id: "a2", codigo_externo: "MLB2", sku_canal: "pa2", titulo: "Colchão 2", conta_canal_id: "c1" },
  { id: "a3", codigo_externo: "MLB3", sku_canal: "pa3", titulo: "Colchão 3", conta_canal_id: "c2" },
  { id: "a4", codigo_externo: "MLB4", sku_canal: "pa4", titulo: "Colchão 4", conta_canal_id: "c2" },
];
const janela = {
  contas,
  anuncios,
  inicioAnterior: "2026-10-05",
  ateAnterior: "2026-10-08",
  inicio: "2026-10-12",
  ate: "2026-10-15",
};

/*
 * Semana anterior: dois dias medidos. No PRIMEIRO (05/10) a1 ainda não
 * ganhava; no ÚLTIMO (08/10) ganhava. Se a leitura pegasse o primeiro dia,
 * a1 apareceria como ganho — e é exatamente o contrário.
 */
const linhas = [
  { anuncio_id: "a1", data: "2026-10-05", situacao: "competing" },
  { anuncio_id: "a2", data: "2026-10-05", situacao: "winning" },
  { anuncio_id: "a3", data: "2026-10-05", situacao: "competing" },

  { anuncio_id: "a1", data: "2026-10-08", situacao: "winning" },
  { anuncio_id: "a2", data: "2026-10-08", situacao: "winning" },
  { anuncio_id: "a3", data: "2026-10-08", situacao: "sharing_first_place" },

  /* Dia do meio, fora das duas fatias: não pode entrar em nenhuma. */
  { anuncio_id: "a1", data: "2026-10-10", situacao: "winning" },

  { anuncio_id: "a1", data: "2026-10-14", situacao: "competing" },
  { anuncio_id: "a2", data: "2026-10-14", situacao: "winning" },
  { anuncio_id: "a3", data: "2026-10-14", situacao: "winning" },
  /* a4 só aparece agora: entrou na disputa, não "ganhou" de ninguém. */
  { anuncio_id: "a4", data: "2026-10-14", situacao: "winning" },
];

const r = await carregarCatalogoSemana(fingirBanco(linhas), janela);

assert.equal(r.medido, true);
assert.equal(r.contas[0].dia, "2026-10-14", "O retrato é o último dia medido da fatia, não o último dia do calendário");
assert.equal(r.contas[0].diaAnterior, "2026-10-08", "A semana anterior também é lida no seu último dia medido");

assert.equal(r.totais.ganhando, 3, "a2, a3 e a4 estão na vitrine em 14/10");
assert.equal(r.totais.disputando, 4);
assert.equal(r.totais.ganhandoAnterior, 3, "a1, a2 e a3 estavam na vitrine em 08/10");
assert.equal(r.totais.disputandoAnterior, 3);

const sp = r.contas.find((c) => c.nome === "São Paulo");
assert.equal(sp.ganhando, 1, "São Paulo só mantém a2");
assert.equal(sp.ganhandoAnterior, 2);

assert.deepEqual(r.perdidos.map((x) => x.sku), ["PA1"], "Só a1 saiu da vitrine");
assert.equal(r.perdidos[0].situacao, "competindo");
assert.equal(r.perdidos[0].ultimoDiaGanhando, "2026-10-10", "O último dia ganhando é o real, mesmo fora da fatia");
assert.deepEqual(r.ganhos.map((x) => x.sku), [], "a4 entrou na disputa já ganhando: não é virada, é anúncio novo");

/* ── Semana anterior sem leitura: comparação nula, nunca zero ── */
const semBase = await carregarCatalogoSemana(
  fingirBanco(linhas.filter((l) => l.data >= "2026-10-12")),
  janela
);
assert.equal(semBase.medido, true);
assert.equal(semBase.totais.ganhandoAnterior, null, "Sem leitura na semana passada a comparação é nula");
assert.deepEqual(semBase.perdidos, [], "Sem base não existe perda");

/* ── Nada medido na janela ── */
const semMedicao = await carregarCatalogoSemana(fingirBanco([]), janela);
assert.equal(semMedicao.medido, false);
assert.equal(semMedicao.totais.ganhando, 0);

/* ── O estado por anúncio, que a tela de produtos usa ── */
const estado = await estadoDeCatalogo(fingirBanco(linhas), "2026-10-01");
assert.equal(estado.get("a1").ganhando, false);
assert.equal(estado.get("a1").perdeuDepoisDe, "2026-10-10", "Produto que perdeu carrega o dia em que ainda ganhava");
assert.equal(estado.get("a2").ganhando, true);
assert.equal(estado.get("a2").perdeuDepoisDe, null, "Quem ainda ganha não tem data de perda");
assert.equal(estado.get("a3").situacao, "ganhando");

console.log("OK: retrato do último dia de cada fatia, quem saiu da vitrine, sem base e estado por anúncio.");
