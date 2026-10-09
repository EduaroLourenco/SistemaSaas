/**
 * A causa da queda, caso por caso.
 *
 * Roda a função de verdade (`src/lib/dados/queda-causa.ts`, que não toca no
 * banco), não uma cópia dela. O que este arquivo protege é a regra que mais
 * dá vontade de mexer: quando visita caindo é PREÇO e quando é EXPOSIÇÃO.
 * Mexer no limite de 4% ou de 10% sem passar por aqui é mexer no diagnóstico
 * de toda a Probel.
 *
 *   node --experimental-strip-types scripts/testar-causa-queda.mjs
 */
import assert from "node:assert/strict";
import { diagnosticar, repartir } from "../src/lib/dados/queda-causa.ts";

/** Um lado do período. Visitas null = canal que não registra visita. */
const lado = ({ receita, unidades, visitas = null, preco }) => ({
  receita,
  unidades,
  pedidos: unidades,
  visitas,
  conversao: visitas ? (unidades / visitas) * 100 : null,
  precoVendido: preco,
  precoVitrine: preco,
  cobertura: 1,
});

/** O que a tela passa, com o mínimo preenchido para a decisão. */
const caso = (antes, agora, extra = {}) =>
  diagnosticar({
    antes,
    agora,
    delta: agora.receita - antes.receita,
    /* O efeito é a repartição real da diferença, não um número inventado:
       é ele que decide a causa quando nenhuma regra anterior bate. */
    efeito: repartir(antes, agora, agora.receita - antes.receita),
    diasSemEstoque: 0,
    diasObservados: 7,
    pesoAcompanhado: 1,
    status: "active",
    ...extra,
  });

const catalogo = (ganhouAntes, ganhouAgora, dias = 7) => ({
  catalogo: { antes: { ganhando: ganhouAntes, dias }, agora: { ganhando: ganhouAgora, dias } },
});

let n = 0;
const vale = (nome, { causa, explicacao }, esperada, trecho) => {
  n++;
  assert.equal(causa, esperada, `${nome}: esperava "${esperada}", veio "${causa}" — ${explicacao}`);
  if (trecho) assert.ok(explicacao.includes(trecho), `${nome}: a frase não diz "${trecho}" — ${explicacao}`);
};

/* ── 1. O caso clássico: preço sobe, quem entrou não comprou ── */
vale(
  "preço sobe e a conversão cai, visita de pé",
  caso(
    lado({ receita: 10_000, unidades: 10, visitas: 1000, preco: 1000 }),
    lado({ receita: 4200, unidades: 4, visitas: 1000, preco: 1050 })
  ),
  "preço subiu",
  "visitas mantidas"
);

/* ── 2. O caso que faltava: preço sobe e ninguém clica ──
   Conversão até SUBE (sobra quem já ia pagar) e a visita desaba. Antes isto
   saía como "perdeu visitas" e mandava olhar mídia e posição — conselho
   errado, porque o que mudou foi o preço. */
vale(
  "preço sobe e a visita cai, conversão de pé",
  caso(
    lado({ receita: 10_000, unidades: 10, visitas: 1000, preco: 1000 }),
    lado({ receita: 5250, unidades: 5, visitas: 400, preco: 1050 })
  ),
  "preço subiu",
  "não clicou"
);

/* ── 3. A prova: perdeu o primeiro lugar do catálogo depois de subir ── */
vale(
  "preço sobe e perde o catálogo",
  caso(
    lado({ receita: 10_000, unidades: 10, visitas: 1000, preco: 1000 }),
    lado({ receita: 3150, unidades: 3, visitas: 300, preco: 1050 }),
    catalogo(7, 1)
  ),
  "preço subiu",
  "deixou de ganhar o catálogo"
);

/* ── 4. A contraprova: subiu o preço, mas segue ganhando o catálogo ──
   A visita que caiu não foi a posição, então a causa volta a ser exposição.
   É o freio que impede a regra nova de culpar preço por tudo. */
const mantido = caso(
  lado({ receita: 10_000, unidades: 10, visitas: 1000, preco: 1000 }),
  lado({ receita: 5250, unidades: 5, visitas: 400, preco: 1050 }),
  catalogo(7, 7)
);
vale("preço sobe mas mantém o catálogo", mantido, "perdeu visitas", "seguiu ganhando o catálogo");

/* ── 5. Sem mexer no preço, visita cai: exposição, como sempre foi ── */
vale(
  "visita cai com preço igual",
  caso(
    lado({ receita: 10_000, unidades: 10, visitas: 1000, preco: 1000 }),
    lado({ receita: 5000, unidades: 5, visitas: 500, preco: 1000 })
  ),
  "perdeu visitas"
);

/* ── 6. Faltou produto vem antes de qualquer conversa sobre preço ── */
vale(
  "sem estoque ganha de preço",
  caso(
    lado({ receita: 10_000, unidades: 10, visitas: 1000, preco: 1000 }),
    lado({ receita: 1050, unidades: 1, visitas: 200, preco: 1050 }),
    { diasSemEstoque: 5, diasObservados: 7, estoqueAtual: 0 }
  ),
  "sem estoque",
  "ainda está zerado"
);

/* ── 7. Já reabasteceu: o número de hoje muda a ação, não a causa ── */
vale(
  "sem estoque, mas já reabastecido",
  caso(
    lado({ receita: 10_000, unidades: 10, visitas: 1000, preco: 1000 }),
    lado({ receita: 1000, unidades: 1, visitas: 200, preco: 1000 }),
    { diasSemEstoque: 5, diasObservados: 7, estoqueAtual: 48 }
  ),
  "sem estoque",
  "já tem 48 em estoque"
);

/* ── 8. Canal sem visita (loja própria): só unidades × preço ── */
vale(
  "sem visita registrada",
  caso(
    lado({ receita: 10_000, unidades: 10, preco: 1000 }),
    lado({ receita: 4200, unidades: 4, preco: 1050 })
  ),
  "preço subiu",
  "unidades caíram"
);

/* ── 9. Preço sobe pouco (abaixo de 4%): não é diagnóstico de preço ── */
vale(
  "preço sobe 2%",
  caso(
    lado({ receita: 10_000, unidades: 10, visitas: 1000, preco: 1000 }),
    lado({ receita: 5100, unidades: 5, visitas: 1000, preco: 1020 })
  ),
  "conversão caiu"
);

/* ── 10. Subiu a receita: nenhuma queda para explicar ── */
vale(
  "cresceu",
  caso(
    lado({ receita: 5000, unidades: 5, visitas: 500, preco: 1000 }),
    lado({ receita: 10_000, unidades: 10, visitas: 1000, preco: 1000 })
  ),
  "cresceu"
);

console.log(`${n} casos conferidos, todos certos.`);
