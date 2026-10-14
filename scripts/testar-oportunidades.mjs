/**
 * As regras de ação do tráfego pago.
 *
 * Cada uma decide verba, e três delas se distinguem por detalhe que o
 * relatório do canal não tem: desligar contra "a mídia sobrou" (os dois são
 * investimento com atribuída zero) e rever preço contra pôr mais verba (os
 * dois têm ACOS, o que muda é a margem do anúncio).
 */
import assert from "node:assert/strict";
import { classificarOportunidades, mediana, VISITAS_MINIMAS } from "../src/lib/dados/trafego-oportunidades.ts";

const base = {
  mlb: "MLB1",
  sku: "SKU1",
  titulo: "Produto",
  conta: "Conta",
  tipo: "classico",
  visitas: 100,
  unidades: 5,
  receitaReal: 500,
  margem: 100,
  margemPct: 20,
  investimento: 0,
  receitaAtribuida: 0,
  estoque: 10,
  status: "ativo",
};
const com = (x) => ({ ...base, ...x });
const acaoDe = (entradas, mlb) => {
  const { linhas } = classificarOportunidades(entradas);
  return linhas.find((l) => l.mlb === mlb).acao;
};

/* 1. Mediana: par tira a média dos dois do meio, ímpar pega o do meio. */
assert.equal(mediana([]), null);
assert.equal(mediana([3, 1, 2]), 2);
assert.equal(mediana([4, 1, 3, 2]), 2.5);

/* 2. Gastou e não vendeu NADA: desligar. */
assert.equal(
  acaoDe([com({ mlb: "A", investimento: 50, receitaAtribuida: 0, receitaReal: 0, unidades: 0 })], "A"),
  "desligar"
);

/* 3. Gastou, o canal não creditou, mas o anúncio faturou: a mídia sobrou.
   Mesmos números do caso 2 no relatório do canal, ação oposta. */
assert.equal(
  acaoDe([com({ mlb: "A", investimento: 50, receitaAtribuida: 0, receitaReal: 900 })], "A"),
  "midia_sobrou"
);

/* 4. ACOS acima da margem DO ANÚNCIO: rever preço. 30% de ACOS seria ótimo
   num anúncio de 50% de margem e é prejuízo num de 20%. */
assert.equal(
  acaoDe([com({ mlb: "A", investimento: 30, receitaAtribuida: 100, margemPct: 20, margem: 100 })], "A"),
  "rever_preco"
);
assert.equal(
  acaoDe([com({ mlb: "A", investimento: 30, receitaAtribuida: 100, margemPct: 50, margem: 500 })], "A"),
  "manter",
  "ACOS 30% com margem 50% não é prejuízo nem folga grande"
);

/* 5. ACOS com folga e sobra positiva: pôr mais verba. */
assert.equal(
  acaoDe([com({ mlb: "A", investimento: 10, receitaAtribuida: 100, margemPct: 40, margem: 200 })], "A"),
  "escalar"
);
assert.equal(
  acaoDe([com({ mlb: "A", investimento: 10, receitaAtribuida: 100, margemPct: 40, margem: 5 })], "A"),
  "manter",
  "sem sobra depois da mídia não se escala"
);
assert.equal(
  acaoDe([com({ mlb: "A", investimento: 10, receitaAtribuida: 100, margemPct: 40, margem: 200, estoque: 0 })], "A"),
  "manter",
  "estoque zero não recebe mais verba"
);

/* 6. Converte acima da mediana e ainda não é dos mais vistos, sem ads:
   entrar. O conjunto define os cortes — conversões 2, 5 e 10%, então a
   mediana é 5%. */
const conjunto = [
  com({ mlb: "BAIXA", visitas: 1000, unidades: 20 }), // 2%
  com({ mlb: "MEIO", visitas: 400, unidades: 20 }), // 5%
  com({ mlb: "ALVO", visitas: 100, unidades: 10 }), // 10%, pouca visita
];
assert.equal(acaoDe(conjunto, "ALVO"), "entrar");
assert.equal(acaoDe(conjunto, "BAIXA"), "manter", "conversão abaixo da mediana não entra");

/* Conversão sobre amostra pequena é ruído, não oportunidade: 1 visita e 1
   venda dão 100% e não querem dizer nada. Este é o caso que apareceu nos
   dados reais da Probel, onde a mediana de visitas é 5. */
assert.equal(
  acaoDe([com({ mlb: "RUIDO", visitas: 1, unidades: 1 }), ...conjunto], "RUIDO"),
  "manter",
  "menos de 20 visitas não sustenta taxa de conversão"
);
assert.equal(
  acaoDe([com({ mlb: "UMA", visitas: 50, unidades: 1 }), ...conjunto], "UMA"),
  "manter",
  "uma venda só não distingue sorte de demanda"
);

/* Muita visita com conversão boa não é oportunidade de TRÁFEGO: já é dos
   mais vistos, e pôr verba é empurrar gente para onde já tem gente. */
assert.equal(
  acaoDe(
    [
      com({ mlb: "VISTO", visitas: 5000, unidades: 500 }),
      com({ mlb: "A", visitas: 100, unidades: 2 }),
      com({ mlb: "B", visitas: 300, unidades: 9 }),
      com({ mlb: "C", visitas: 500, unidades: 15 }),
      com({ mlb: "D", visitas: 800, unidades: 24 }),
    ],
    "VISTO"
  ),
  "manter"
);

/* Já tem verba: não é candidato a ENTRAR, mesmo convertendo alto com pouca
   visita. ACOS de 15% contra margem de 20% não é folga nem prejuízo, então
   cai em manter — o que se testa aqui é que "entrar" exige verba zero. */
assert.equal(
  acaoDe(
    [com({ mlb: "ALVO", visitas: 100, unidades: 10, investimento: 15, receitaAtribuida: 100, margemPct: 20, margem: 100 }), ...conjunto.slice(0, 2)],
    "ALVO"
  ),
  "manter"
);

/* Margem negativa não recebe tráfego, por boa que seja a conversão. */
assert.equal(
  acaoDe([com({ mlb: "ALVO", visitas: 100, unidades: 10, margemPct: -5, margem: -20 }), ...conjunto.slice(0, 2)], "ALVO"),
  "manter"
);

/* Pausado não entra: pôr verba em anúncio parado não traz visita. */
assert.equal(
  acaoDe([com({ mlb: "ALVO", visitas: 100, unidades: 10, status: "pausado" }), ...conjunto.slice(0, 2)], "ALVO"),
  "manter"
);

/* 7. Canal sem visita medida: conversão fica nula e ninguém vira candidato
   por falta de dado. */
const semVisita = classificarOportunidades([com({ mlb: "A", visitas: null })]);
assert.equal(semVisita.linhas[0].conversao, null);
assert.equal(semVisita.linhas[0].acao, "manter");
assert.equal(semVisita.referencias.conversaoMediana, null);
assert.equal(semVisita.referencias.comVisitaSuficiente, 0);

/* 8. Ordem: o que custa dinheiro agora aparece antes do que rende. */
const ordenado = classificarOportunidades([
  com({ mlb: "ESCALA", investimento: 10, receitaAtribuida: 100, margemPct: 40, margem: 200 }),
  com({ mlb: "MORTO", investimento: 50, receitaAtribuida: 0, receitaReal: 0, unidades: 0 }),
]).linhas.map((l) => l.mlb);
assert.deepEqual(ordenado, ["MORTO", "ESCALA"]);

/* 9. A contagem fecha com o número de linhas. */
const tudo = classificarOportunidades(conjunto);
assert.equal(
  Object.values(tudo.referencias.contagem).reduce((a, b) => a + b, 0),
  conjunto.length
);

console.log("ok");
