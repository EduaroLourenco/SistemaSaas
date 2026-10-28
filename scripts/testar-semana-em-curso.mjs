/**
 * A semana em curso não entra no recorte — e não derruba a comparação.
 *
 * Em 27/10/2026 a tela de Anúncios mostrava toda métrica despencando. Não
 * era queda: a S44 (26/10 a 01/11) tinha 2 dias dos 7, com 25 vendas
 * contra as 264 da S43, e entrava DUAS vezes na conta — na soma do
 * período e na comparação "vs. N semanas anteriores". E o rótulo dizia só
 * "8 semanas", então não havia como ver a causa na tela.
 *
 * `docs/agents/telas.md`: "Parcial é 'ainda está acontecendo'. Diga, não
 * compare como se estivesse fechado."
 *
 *   node scripts/testar-semana-em-curso.mjs
 */
import assert from "node:assert/strict";

/*
 * As duas regras testadas, copiadas da origem:
 *   - `marcar`      de `carregarAnalise()` em src/lib/dados/analise.ts
 *   - `recortar`    de `AnaliseAnuncios` em
 *                      src/app/anuncios/analise/analise-cliente.tsx
 *
 * O carregador fala com o banco e a tela é componente; nenhum dos dois
 * roda aqui. A decisão é curta, e uma regra replicada com a origem
 * anotada vale mais do que um teste que não existe.
 */
function marcar(semanas, hoje) {
  return semanas.map((s) => {
    const parcial = hoje >= s.inicio && hoje <= s.fim;
    const dias = parcial
      ? Math.floor((Date.parse(hoje) - Date.parse(s.inicio)) / 86_400_000) + 1
      : 7;
    return { ...s, parcial, dias };
  });
}

const brDia = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

function recortar(semanas, escolhido, incluirEmCurso) {
  const base = incluirEmCurso ? semanas : semanas.filter((s) => !s.parcial);
  const n = Math.min(escolhido, base.length);
  const selecionadas = base.slice(-n);
  const anteriores = base.length >= 2 * n && n ? base.slice(-2 * n, -n) : null;
  return {
    n,
    semanas: selecionadas.map((s) => s.semana),
    anteriores: anteriores?.map((s) => s.semana) ?? null,
    rotulo: selecionadas.length
      ? `${brDia(selecionadas[0].inicio)} – ${brDia(selecionadas.at(-1).fim)}`
      : "sem semana fechada",
  };
}

/* 24 semanas fechadas de 2026 mais a S44, que é a que está correndo. */
const HOJE = "2026-10-27";
const HISTORICO = marcar(
  Array.from({ length: 25 }, (_, i) => {
    const inicio = new Date(Date.parse("2026-05-11") + i * 7 * 86_400_000);
    const fim = new Date(inicio.getTime() + 6 * 86_400_000);
    const iso = (d) => d.toISOString().slice(0, 10);
    return { semana: `S${20 + i}`, inicio: iso(inicio), fim: iso(fim) };
  }),
  HOJE,
);

/* ══ 1. Só a semana que contém hoje é parcial, e ela sabe quantos dias tem ══ */
{
  const emCurso = HISTORICO.filter((s) => s.parcial);
  assert.equal(emCurso.length, 1, "uma semana em curso, nunca duas");
  assert.equal(emCurso[0].semana, "S44");
  assert.equal(emCurso[0].inicio, "2026-10-26");
  assert.equal(
    emCurso[0].dias,
    2,
    "26 e 27 de outubro: dois dias dos sete, e é isso que o rótulo diz",
  );

  const s43 = HISTORICO.find((s) => s.semana === "S43");
  assert.equal(s43.parcial, false, "19/10 a 25/10 já fechou");
  assert.equal(s43.dias, 7);
}

/* ══ 2. Por padrão o recorte para na última semana FECHADA ══ */
{
  const r = recortar(HISTORICO, 8, false);
  assert.equal(r.n, 8);
  assert.ok(!r.semanas.includes("S44"), "a semana parcial fica fora da soma");
  assert.equal(r.semanas.at(-1), "S43", "o recorte termina na última fechada");
  assert.equal(
    r.rotulo,
    "31/08 – 25/10",
    "o rótulo mostra o período de verdade, não só a contagem de semanas",
  );
}

/* ══ 3. A comparação também não pega a parcial ══
   Era o segundo caminho pelo qual a S44 contaminava a tela: mesmo
   somando certo, o recorte anterior deslizava uma semana e comparava
   períodos de tamanhos diferentes. */
{
  const r = recortar(HISTORICO, 8, false);
  assert.deepEqual(r.anteriores, ["S28", "S29", "S30", "S31", "S32", "S33", "S34", "S35"]);
  assert.equal(r.anteriores.length, r.semanas.length, "oito contra oito");
  assert.ok(!r.anteriores.includes("S44"));
}

/* ══ 4. Marcando a caixa, ela entra — e aparece rotulada ══ */
{
  const r = recortar(HISTORICO, 8, true);
  assert.equal(r.semanas.at(-1), "S44", "quem pede o parcial recebe o parcial");
  assert.equal(r.rotulo, "07/09 – 01/11");
  assert.equal(r.anteriores.length, 8);
}

/* ══ 5. "Tudo" encurta em uma semana quando a parcial sai ══
   O <select> oferece o total disponível como última opção. Sem clampar,
   o valor escolhido (25) deixava de existir na lista (24) e o campo
   aparecia em branco. */
{
  assert.equal(recortar(HISTORICO, 25, true).n, 25);
  assert.equal(recortar(HISTORICO, 25, false).n, 24, "clampado ao que existe");
  assert.equal(recortar(HISTORICO, 25, false).semanas.length, 24);
}

/* ══ 6. Histórico que é só a semana em curso: não inventa comparação ══
   Conta nova, primeira importação na segunda-feira. Zero semana fechada
   é ausência de leitura, não um período de tamanho zero. */
{
  const r = recortar(HISTORICO.filter((s) => s.parcial), 8, false);
  assert.equal(r.n, 0);
  assert.deepEqual(r.semanas, []);
  assert.equal(r.anteriores, null, "sem período anterior para comparar");
  assert.equal(r.rotulo, "sem semana fechada", "diz que não mediu, não mostra zero");
}

console.log(
  "OK: a semana em curso fica fora do recorte e da comparação, entra só se pedida, e o rótulo mostra as datas.",
);
