/**
 * O nome da campanha, lido do nome do arquivo da Central de Promoções.
 *
 * A primeira versão tirava o uuid com uma regra ancorada no FIM da
 * string — e o uuid está no meio, antes do carimbo do download. Ele
 * aparecia inteiro na tela: "Com reducao de tarifas-d1d47bed-c182-
 * 43e1-8085-0f47ba97d748".
 *
 * Os casos vêm do histórico real da Probel, que tem 27 campanhas em
 * quatro formatos diferentes de nome.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const vazio = path.join(mkdtempSync(path.join(tmpdir(), "gerizo-")), "vazio.cjs");
writeFileSync(vazio, "module.exports={}");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(raiz, "src"), "server-only": vazio },
  interopDefault: true,
});

/*
 * O componente é "use client" e importa React. Para testar só a função
 * de nome, ela é relida do arquivo e avaliada isolada — é texto puro,
 * sem dependência nenhuma.
 */
const { readFileSync } = await import("node:fs");
const fonte = readFileSync(path.join(raiz, "src/components/promocoes/por-sku.tsx"), "utf8");
const corpo = fonte.slice(
  fonte.indexOf("function nomeCurto("),
  fonte.indexOf("export function PromocoesPorSku"),
);
assert.ok(corpo.includes("function nomeCurto"), "não achei a função no componente");
const nomeCurto = new Function(
  `${corpo.replace(/: \{ nome: string; periodo: string \| null \}/, "").replace(/: string/g, "")}; return nomeCurto;`,
)();

const casos = [
  [
    "1_Com_reducao_de_tarifas-d0149a47-2b14-4b03-bcfd-5a0dfeccb0dd-2026_10_19-16_31 | De 1 de Outubro a 2 de Novembro",
    "Com reducao de tarifas",
    "De 1 de Outubro a 2 de Novembro",
  ],
  [
    "1_Com_reducao_de_tarifas-d1d47bed-c182-43e1-8085-0f47ba97d748-2026_10_19-15_41 | De 1 a 31 de Outubro",
    "Com reducao de tarifas",
    "De 1 a 31 de Outubro",
  ],
  [
    "1_Com_reducao_de_tarifas_2026_09_23-14_51 | De 16 de Julho a 30 de Setembro",
    "Com reducao de tarifas",
    "De 16 de Julho a 30 de Setembro",
  ],
  /* Sem período e sem uuid: o formato mais curto que o canal gera. */
  ["1_seller_campaigns-2026_10_01-13_51", "seller campaigns", null],
  /* O nome é "10_10" — a campanha 10.10 — e o carimbo vem logo depois.
     Aqui o risco é comer o nome junto com a data. */
  [
    "1_10_10_2026_09_28-11_22 | De 28 de Setembro a 13 de Outubro",
    "10 10",
    "De 28 de Setembro a 13 de Outubro",
  ],
  [
    "1_O_melhor_de_todos_os_dias_com_reducao_nas_suas_tarifas_2026_09_02-09_54 | De 17 de Agosto a 13 de Setembro",
    "O melhor de todos os dias com reducao nas suas tarifas",
    "De 17 de Agosto a 13 de Setembro",
  ],
];

for (const [entrada, nome, periodo] of casos) {
  const r = nomeCurto(entrada);
  assert.equal(r.nome, nome, `nome errado para ${entrada.slice(0, 50)}…`);
  assert.equal(r.periodo, periodo, `período errado para ${entrada.slice(0, 50)}…`);
  assert.ok(
    !/[0-9a-f]{8}-[0-9a-f]{4}/i.test(r.nome),
    `sobrou uuid no nome: ${r.nome}`,
  );
}

/* Nome que não segue formato nenhum não pode virar string vazia: melhor
   mostrar o original do que uma linha em branco na tabela. */
const estranho = nomeCurto("promo avulsa");
assert.equal(estranho.nome, "promo avulsa");
assert.equal(estranho.periodo, null);

console.log(`OK: ${casos.length} formatos de nome de campanha, sem uuid e com o período separado.`);
