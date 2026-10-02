/**
 * O que o cadastro de canal aceita, e o que ele recusa.
 *
 * O corpo do POST não escolhe tabela nem coluna — só preenche o que o
 * recurso declarou. Isto trava as duas pontas disso: que um campo a mais
 * no corpo é IGNORADO (e não gravado), e que os apelidos chegam como lista
 * de verdade, porque `apelidos` é `text[]` no banco e uma string iria
 * quebrar a gravação.
 *
 * Uso: node scripts/testar-cadastro-canais.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createJiti } from "file:///C:/Users/dudu4/OneDrive/Desktop/plataforma/node_modules/jiti/lib/jiti.mjs";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
fs.writeFileSync(path.join(process.cwd(), "vazio.cjs"), "");
const jiti = createJiti(RAIZ + "/", {
  alias: { "@": RAIZ + "/src", "server-only": path.join(process.cwd(), "vazio.cjs") },
});
const { paraColunas } = await jiti.import(RAIZ + "/src/lib/dados/cadastros-financeiros.ts");
const { RECURSOS } = await jiti.import(RAIZ + "/src/lib/dados/cadastros.ts");

let falhas = 0;
const ok = (certo, titulo, detalhe = "") => {
  console.log(`  ${certo ? "ok " : "FALHOU"}  ${titulo.padEnd(50)} ${detalhe}`);
  if (!certo) falhas++;
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const CONTA = RECURSOS["contas-canal"];
const CANAL = RECURSOS.canais;
const UM_ID = "a37f9d9b-5bc7-4a94-a569-578942a93c81";

console.log("\nO RECURSO EXISTE E APONTA PARA A TABELA CERTA:\n");
ok(CONTA?.tabela === "contas_canal", "contas-canal -> contas_canal", CONTA?.tabela);
ok(CANAL?.tabela === "canais", "canais -> canais", CANAL?.tabela);

console.log("\nOS APELIDOS CHEGAM COMO LISTA (a coluna é text[]):\n");

{
  const { linha, erros } = paraColunas(CONTA, {
    canalId: UM_ID,
    nome: "Conta teste",
    apelidos: "COLCHOES PROBEL, Colchões Probel ,, probel sp ",
  });
  ok(erros.length === 0, "sem erros de validação", JSON.stringify(erros));
  ok(
    igual(linha.apelidos, ["COLCHOES PROBEL", "Colchões Probel", "probel sp"]),
    "texto com vírgulas vira lista, aparado e sem vazios",
    JSON.stringify(linha.apelidos)
  );
}

{
  const { linha } = paraColunas(CONTA, {
    canalId: UM_ID,
    nome: "X",
    apelidos: ["um", " dois ", ""],
  });
  ok(igual(linha.apelidos, ["um", "dois"]), "lista também é aceita", JSON.stringify(linha.apelidos));
}

{
  /*
   * Vazio tem que ser `[]`, não nulo: a coluna é `not null default '{}'` e
   * nulo ali faria o banco recusar justamente quem está LIMPANDO o campo.
   */
  const { linha } = paraColunas(CONTA, { canalId: UM_ID, nome: "X", apelidos: "" });
  ok(
    igual(linha.apelidos, []),
    "apelido vazio vira lista vazia, não nulo",
    JSON.stringify(linha.apelidos)
  );
}

console.log("\nO CORPO NÃO ESCOLHE COLUNA:\n");

{
  const { linha } = paraColunas(CONTA, {
    canalId: UM_ID,
    nome: "Conta teste",
    // Tentativa de mover a conta para outra empresa pelo navegador.
    operacao_id: "00000000-0000-0000-0000-000000000999",
    operacaoId: "00000000-0000-0000-0000-000000000999",
    criado_em: "1999-01-01",
  });
  ok(!("operacao_id" in linha), "operacao_id vindo do corpo é ignorado", JSON.stringify(Object.keys(linha)));
  ok(!("criado_em" in linha), "criado_em vindo do corpo é ignorado");
}

console.log("\nO OBRIGATÓRIO É COBRADO NA CRIAÇÃO, NÃO NA EDIÇÃO:\n");

{
  const { erros } = paraColunas(CONTA, { nome: "Sem canal" });
  ok(
    erros.some((e) => e.campo === "canalId"),
    "criar conta sem canal é recusado",
    JSON.stringify(erros)
  );
}
{
  const { erros } = paraColunas(CONTA, { nome: "Só o nome" }, { parcial: true });
  ok(erros.length === 0, "editar só o nome é aceito", JSON.stringify(erros));
}
{
  const { erros } = paraColunas(CONTA, { canalId: "nao-e-uuid", nome: "X" });
  ok(
    erros.some((e) => e.campo === "canalId"),
    "canal que não é uuid é recusado",
    JSON.stringify(erros)
  );
}

console.log("\nO TIPO DO CANAL É FECHADO:\n");

{
  const { erros } = paraColunas(CANAL, { nome: "X", codigo: "x", tipo: "qualquer_coisa" });
  ok(
    erros.some((e) => e.campo === "tipo"),
    "tipo fora da lista é recusado",
    JSON.stringify(erros)
  );
}
{
  const { linha, erros } = paraColunas(CANAL, {
    nome: "Magalu",
    codigo: "magalu",
    tipo: "marketplace",
  });
  ok(erros.length === 0 && linha.codigo === "magalu", "canal válido passa", JSON.stringify(linha));
}

console.log(
  falhas === 0 ? "\nTodos os casos passaram.\n" : `\n${falhas} caso(s) FALHARAM.\n`
);
process.exit(falhas === 0 ? 0 : 1);
