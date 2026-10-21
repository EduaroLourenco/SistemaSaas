/**
 * Regera `scripts/lib/` a partir do TypeScript.
 *
 * Os testes rodam fora do Next e importam `.mjs`, então existe uma cópia
 * compilada desses módulos. Ela é ignorada pelo git e até aqui era mantida
 * à mão — e tinha ficado para trás: em 21/10/2026 o `processar.mjs` local
 * aceitava calado uma planilha que a versão em TypeScript recusa, o que fez
 * um diagnóstico apontar para o lado errado por alguns minutos.
 *
 * Uso: node scripts/gerar-lib.mjs
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const destino = path.join(raiz, "scripts/lib");
const temporario = path.join(raiz, ".lib-gerada");
const configTemporaria = path.join(raiz, "tsconfig.lib-gerada.json");

/*
 * Um tsconfig que ESTENDE o do projeto, em vez de repetir as opções na
 * linha de comando. O motivo é o apelido `@/`: alguns desses módulos
 * importam por ele, e `--paths` não existe como flag de linha de comando —
 * só em arquivo. Sem isso, o tsc para em quatro módulos que compilam bem
 * dentro do projeto.
 */
writeFileSync(
  configTemporaria,
  JSON.stringify(
    {
      extends: "./tsconfig.json",
      compilerOptions: {
        outDir: ".lib-gerada",
        module: "esnext",
        target: "es2022",
        moduleResolution: "bundler",
        noEmit: false,
        skipLibCheck: true,
        declaration: false,
        /* O projeto compila incremental, e o `.tsbuildinfo` do `next build`
           faz o tsc achar que não há nada a emitir — saía a cópia velha. */
        incremental: false,
        composite: false,
      },
      include: ["src/lib/planilhas/**/*.ts"],
    },
    null,
    2,
  ),
);

try {
  execFileSync(
    process.execPath,
    [path.join(raiz, "node_modules/typescript/bin/tsc"), "-p", configTemporaria],
    { stdio: "inherit", cwd: raiz },
  );

  /*
   * Onde o tsc largou os arquivos.
   *
   * Ele calcula a raiz comum de tudo que compilou. Como alguns módulos
   * importam por `@/`, entram arquivos de fora de `planilhas` e a raiz sobe
   * para `src/lib` — então a saída é `.lib-gerada/planilhas/`, não a raiz.
   * Procurar a pasta em vez de supor o caminho: quando a raiz muda de nível
   * outra vez, isto continua achando.
   */
  const procurar = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      if (e.name === "planilhas") return path.join(dir, e.name);
      const achado = procurar(path.join(dir, e.name));
      if (achado) return achado;
    }
    return null;
  };
  const pasta = procurar(temporario) ?? temporario;

  for (const nome of readdirSync(pasta)) {
    if (!nome.endsWith(".js")) continue;
    const js = readFileSync(path.join(pasta, nome), "utf8")
      /* O import relativo compilado sai sem extensão; o Node em ESM exige. */
      .replace(/from "(\.\/[\w-]+)"/g, 'from "$1.mjs"');
    writeFileSync(path.join(destino, nome.replace(/\.js$/, ".mjs")), js);
    console.log("  " + nome.replace(/\.js$/, ".mjs"));
  }
} finally {
  rmSync(temporario, { recursive: true, force: true });
  rmSync(configTemporaria, { force: true });
}
