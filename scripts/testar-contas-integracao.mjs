/**
 * A conta de canal é a chave da credencial, e o apelido não entra mais.
 *
 * Isto existe porque o compilador não protege: `Conta` é um `string`, então
 * passar "principal" onde se espera um id compila e só falharia em
 * produção — buscando no banco uma linha que não existe, ou, numa segunda
 * empresa, achando a linha de outra.
 *
 * Nenhuma chamada ao Mercado Livre acontece aqui: o guarda roda antes de
 * qualquer rede, e é justamente isso que o teste aproveita. Rodar não
 * rotaciona token de ninguém.
 *
 * Uso: node scripts/testar-contas-integracao.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createJiti } from "file:///C:/Users/dudu4/OneDrive/Desktop/plataforma/node_modules/jiti/lib/jiti.mjs";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
for (const l of fs.readFileSync(RAIZ + "/.env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) {
    process.env[l.slice(0, i)] = l.slice(i + 1).trim();
  }
}

fs.writeFileSync(path.join(process.cwd(), "vazio.cjs"), "");
const jiti = createJiti(RAIZ + "/", {
  alias: { "@": RAIZ + "/src", "server-only": path.join(process.cwd(), "vazio.cjs") },
});
const { vendedor, contaConectada } = await jiti.import(RAIZ + "/src/lib/meli/cliente.ts");
const { integracaoDa, integracoesMeli } = await jiti.import(RAIZ + "/src/lib/meli/tokens.ts");

let falhas = 0;
const ok = (certo, titulo, detalhe = "") => {
  console.log(`  ${certo ? "ok " : "FALHOU"}  ${titulo.padEnd(52)} ${detalhe}`);
  if (!certo) falhas++;
};

const INEXISTENTE = "00000000-0000-4000-8000-000000000000";

console.log("\nO APELIDO NÃO É MAIS ACEITO COMO CONTA:\n");

for (const apelido of ["principal", "segunda", ""]) {
  let erro = null;
  try {
    await vendedor(apelido);
  } catch (e) {
    erro = e?.message ?? String(e);
  }
  ok(
    Boolean(erro && /id de contas_canal/i.test(erro)),
    `recusa o apelido "${apelido}"`,
    erro ? erro.slice(0, 44) : "NÃO recusou — passou batido"
  );
}

console.log("\nA INTEGRAÇÃO É ACHADA PELA CONTA DE CANAL:\n");

const lista = await integracoesMeli();
ok(lista.length > 0, "integracoesMeli() devolve as contas do banco", `${lista.length} integração(ões)`);
ok(
  lista.every((i) => i.contaCanalId && i.operacaoId && i.nome),
  "cada uma traz conta, operação e nome",
  lista.map((i) => i.nome).join(" | ")
);

/*
 * A operação tem que vir da linha, não de lugar nenhum: é o que garante
 * que o dado de uma empresa não caia na outra.
 */
for (const i of lista) {
  const achada = await integracaoDa(i.contaCanalId);
  ok(
    achada?.id === i.id && achada?.operacaoId === i.operacaoId,
    `integracaoDa(${i.nome})`,
    `operação ${achada?.operacaoId?.slice(-4) ?? "?"}`
  );
}

const nenhuma = await integracaoDa(INEXISTENTE);
ok(nenhuma === null, "conta que não existe não devolve integração", String(nenhuma));

console.log("\nCONECTADA É TER COM O QUE RENOVAR:\n");

/*
 * Sem o aplicativo configurado NADA está conectado, por conta que seja —
 * não há com o que renovar. Vale travar: é o estado real desta máquina
 * (as variáveis MELI_* do .env.local estão vazias), e uma versão que
 * dissesse "conectada" aqui estaria mentindo para a tela.
 */
const app = Boolean(process.env.MELI_APP_ID && process.env.MELI_CLIENT_SECRET);
console.log(`  (aplicativo do Meli ${app ? "configurado" : "SEM configuração"} nesta máquina)\n`);

for (const i of lista) {
  const conectada = await contaConectada(i.contaCanalId);
  ok(
    app ? conectada === true : conectada === false,
    `contaConectada(${i.nome})`,
    conectada ? "tem credencial" : "sem credencial"
  );
}

ok(
  (await contaConectada(INEXISTENTE)) === false,
  "conta que não existe não está conectada"
);

console.log(
  falhas === 0
    ? "\nTodos os casos passaram.\n"
    : `\n${falhas} caso(s) FALHARAM.\n`
);
process.exit(falhas === 0 ? 0 : 1);
