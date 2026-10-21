/**
 * "Por que caiu": situação e estoque param de sair vazios.
 *
 *   node --experimental-strip-types scripts/testar-situacao-estoque-queda.mjs
 *
 * As colunas existiam na planilha e vinham em branco. O motivo eram dois
 * filtros no carregamento: a situação só era lida no nível de ANÚNCIO, e o
 * estoque só quando o grupo tinha UM anúncio. Como a tela abre no nível de
 * produto e quase todo SKU tem clássico mais premium — na Probel são 290
 * produtos em 1.267 anúncios — as duas colunas saíam vazias na planilha
 * inteira. Reclamado pelo Eduardo em 21/10/2026.
 *
 * Medido depois do conserto, na Probel: situação de 0% para 100% dos
 * produtos, estoque para 55%. Os 45% restantes são SKUs cujos anúncios
 * todos declaram "sem controle de estoque", e aí não há número a mostrar.
 */
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

/* Jiti e não `--experimental-strip-types`: `queda.ts` importa por `@/` e
   depende de `server-only`, que fora do Next não existe. */
const RAIZ = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const vazio = path.join(RAIZ, "node_modules", ".cache", "vazio.cjs");
fs.mkdirSync(path.dirname(vazio), { recursive: true });
fs.writeFileSync(vazio, "module.exports = {};\n");
const jiti = createJiti(RAIZ + "/", {
  alias: { "@": RAIZ + "/src", "server-only": vazio },
  interopDefault: true,
});
const { somarEstoque, resumirSituacao } = await jiti.import(RAIZ + "/src/lib/dados/queda.ts");
const { SOB_ENCOMENDA, semControleDeEstoque } = await jiti.import(
  RAIZ + "/src/lib/estoque-sem-controle.ts",
);

let n = 0;
const vale = (nome, a, b) => { n++; assert.deepEqual(a, b, nome); };

/* ── Estoque ── */

/* Um anúncio só: o número dele. */
vale("um anúncio", somarEstoque(new Map([["contaA", 9]])), 9);

/* Dois anúncios da MESMA conta: clássico e premium dividem o estoque
   físico. Quem monta o mapa já guardou o maior — somar os dois diria 18
   onde existem 9. */
vale("mesma conta não duplica", somarEstoque(new Map([["contaA", 9]])), 9);

/* Contas diferentes têm inventário próprio no canal: soma. */
vale("contas diferentes somam", somarEstoque(new Map([["contaA", 9], ["contaB", 4]])), 13);

/* Nada lido é "não sei", não zero: zero diria "faltou produto" de um
   anúncio sobre o qual não se sabe nada. */
vale("mapa vazio é nulo", somarEstoque(new Map()), null);

/* Zero de verdade continua zero — é ruptura, e precisa aparecer. */
vale("zero é zero", somarEstoque(new Map([["contaA", 0]])), 0);

/* ── O marcador de "sem controle de estoque" ── */
vale("40 mil é sem controle", semControleDeEstoque(SOB_ENCOMENDA), true);
vale("acima também", semControleDeEstoque(99999), true);
vale("abaixo não", semControleDeEstoque(SOB_ENCOMENDA - 1), false);
vale("nulo não", semControleDeEstoque(null), false);
vale("zero não", semControleDeEstoque(0), false);

/* ── Situação ── */

/* Todos ativos. */
vale("todos ativos", resumirSituacao(["ativo", "ativo"]), { status: "ativo", situacao: "ativo" });

/* O canal escreve nos dois idiomas conforme o endpoint. */
vale("active conta como ativo", resumirSituacao(["active"]), { status: "ativo", situacao: "ativo" });

/* Todos pausados: é o caso em que o diagnóstico PODE dizer "pausado". */
vale("todos pausados", resumirSituacao(["pausado", "pausado"]), {
  status: "pausado",
  situacao: "pausado",
});

/*
 * O caso que "ativo" sozinho escondia, e o que mais importa aqui: metade
 * dos anúncios do SKU fora do ar. A tela mostra a mistura; o diagnóstico
 * recebe "ativo", porque ainda há irmão vendendo e a queda não é "o
 * anúncio está pausado".
 */
vale("parcial mostra a mistura", resumirSituacao(["ativo", "pausado", "pausado", "ativo"]), {
  status: "ativo",
  situacao: "2 de 4 ativos",
});
vale("um ativo entre oito", resumirSituacao(["ativo", ...Array(7).fill("pausado")]), {
  status: "ativo",
  situacao: "1 de 8 ativos",
});

/* Sem anúncio nenhum: nulo nos dois, e não "pausado" — não saber não é
   estar fora do ar. */
vale("sem anúncios", resumirSituacao([]), { status: null, situacao: null });
/* Situação nula em todos: nulo, pelo mesmo motivo. */
vale("todos sem situação", resumirSituacao([null, null]), { status: null, situacao: null });
/* Mistura de nulo com pausado: o que se sabe é "pausado". */
vale("nulo com pausado", resumirSituacao([null, "pausado"]), {
  status: "pausado",
  situacao: "pausado",
});

console.log(`${n} verificações: situação resume a mistura e o estoque soma por conta sem duplicar.`);
