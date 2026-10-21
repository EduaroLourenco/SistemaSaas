/**
 * Regera `scripts/lib/` a partir do TypeScript.
 *
 * Os testes rodam fora do Next e importam `.mjs`, então existe uma cópia
 * compilada desses módulos. Ela é ignorada pelo git e até aqui era mantida
 * à mão — e tinha ficado para trás: em 21/10/2026 o `processar.mjs` local
 * aceitava calado uma planilha que a versão em TypeScript recusa, o que fez
 * um teste de diagnóstico apontar para o lado errado.
 *
 * Uso: node scripts/gerar-lib.mjs
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const fonte = path.join(raiz, "src/lib/planilhas");
const destino = path.join(raiz, "scripts/lib");
const temporario = path.join(raiz, ".lib-gerada");

/* Só os módulos que já têm espelho: são os que os testes importam. Mandar a
   pasta inteira arrasta leitores que dependem do runtime do Next e o tsc
   para por causa deles. */
const modulos = readdirSync(destino)
  .filter((n) => n.endsWith(".mjs"))
  .map((n) => path.join(fonte, n.replace(/\.mjs$/, ".ts")));

/* O binário local, não `npx`: no Windows o `npx.cmd` precisa de shell e o
   spawn direto falha antes de rodar nada. */
const tsc = path.join(raiz, "node_modules/typescript/bin/tsc");

execFileSync(
  process.execPath,
  [
    tsc,
    ...modulos,
    "--outDir",
    temporario,
    "--module",
    "esnext",
    "--target",
    "es2022",
    "--moduleResolution",
    "bundler",
    "--skipLibCheck",
  ],
  { stdio: "inherit", cwd: raiz },
);

for (const nome of readdirSync(temporario)) {
  if (!nome.endsWith(".js")) continue;
  const js = readFileSync(path.join(temporario, nome), "utf8")
    /* O import relativo compilado sai sem extensão; o Node em ESM exige. */
    .replace(/from "(\.\/[\w-]+)"/g, 'from "$1.mjs"');
  writeFileSync(path.join(destino, nome.replace(/\.js$/, ".mjs")), js);
  console.log("  " + nome.replace(/\.js$/, ".mjs"));
}

rmSync(temporario, { recursive: true, force: true });
