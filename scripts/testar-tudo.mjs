/**
 * Roda a suíte inteira e diz o que quebrou.
 *
 * Existia a suíte e não existia o comando: conferir 33 arquivos um a um
 * ninguém faz, e o que ninguém faz não pega regressão. Em 20/10/2026
 * três testes estavam vermelhos havia tempo — e vermelho de sempre
 * esconde vermelho novo.
 *
 * O veredito é o CÓDIGO DE SAÍDA, não o texto final. Teste que termina
 * com "10 casos conferidos, todos certos" passa; procurar a palavra "OK"
 * dava falso negativo em um terço deles.
 *
 * Uso: node scripts/testar-tudo.mjs [filtro]
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = fileURLToPath(new URL(".", import.meta.url));
const filtro = process.argv[2] ?? "";
const arquivos = readdirSync(dir)
  .filter((n) => n.startsWith("testar-") && n.endsWith(".mjs") && n !== "testar-tudo.mjs")
  .filter((n) => !filtro || n.includes(filtro))
  .sort();

const inicio = Date.now();
const falhas = [];
for (const nome of arquivos) {
  const t = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, nome)], {
    encoding: "utf8",
    timeout: 240_000,
    cwd: path.join(dir, ".."),
  });
  const seg = ((Date.now() - t) / 1000).toFixed(1);
  if (r.status === 0) {
    console.log(`  ok   ${nome.padEnd(34)} ${seg}s`);
  } else {
    const saida = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const motivo =
      saida.split("\n").find((l) => /AssertionError|Error:|erro|falhou/i.test(l))?.trim() ??
      (r.signal === "SIGTERM" ? "passou de 240s" : `saída ${r.status}`);
    console.log(`  FALHA ${nome.padEnd(34)} ${seg}s  ${motivo.slice(0, 90)}`);
    falhas.push({ nome, motivo });
  }
}

const total = ((Date.now() - inicio) / 1000).toFixed(0);
console.log(`\n${arquivos.length - falhas.length} de ${arquivos.length} passaram em ${total}s`);
if (falhas.length) {
  console.log("\nquebrados:");
  for (const f of falhas) console.log(`  ${f.nome}: ${f.motivo.slice(0, 120)}`);
  process.exitCode = 1;
}
