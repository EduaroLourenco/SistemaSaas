/**
 * Captura o front real, rota por rota, em desktop e celular.
 *
 * ── Por que Playwright e não o painel do navegador ──
 *
 * São quase cem capturas. O painel devolve a imagem para a conversa, o que
 * gasta contexto e não deixa arquivo em disco; o Playwright grava PNG
 * direto na pasta, que é o que vai para o ZIP.
 *
 * ── A sessão ──
 *
 * Entra uma vez com o usuário de teste (só leitura, criado para isto e
 * apagado no fim) e reaproveita o mesmo contexto em todas as rotas. Sem
 * isso seriam 48 logins.
 *
 * ── O que ele NÃO faz ──
 *
 * Não clica em nada que grave: a conta é `leitor`, e mesmo assim o roteiro
 * de interação abaixo só abre menu, troca aba e expande painel. Captura de
 * modal destrutivo fica de fora de propósito.
 *
 * Uso:
 *   node docs/auditoria-visual-2026-10-07/capturar.mjs
 *   node docs/auditoria-visual-2026-10-07/capturar.mjs /vendas/canais   (uma só)
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { MODULOS } from "./rotas.mjs";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
const BASE = process.env.BASE ?? "http://localhost:3010";
const DESTINO = path.join(RAIZ, "docs/redesign-ui/screenshots");
const CRED = JSON.parse(
  fs.readFileSync(path.join(RAIZ, "docs/auditoria-visual-2026-10-07/.credencial-teste.json"), "utf8")
);

const DESKTOP = { width: 1440, height: 900 };
const CELULAR = { width: 390, height: 844 };

/* A lista de rotas vive em rotas.mjs, compartilhada com capturar-dobra.mjs. */

const falhas = [];
const feitas = [];

const esperarQuieto = async (pag) => {
  /* A tela é servidor-renderizada; o que falta é fonte, imagem e gráfico. */
  await pag.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await pag.waitForTimeout(900);
};

async function capturar(pag, destino, nome) {
  fs.mkdirSync(destino, { recursive: true });
  const arq = path.join(destino, nome + ".png");
  await pag.screenshot({ path: arq, fullPage: true });
  feitas.push(path.relative(DESTINO, arq).replace(/\\/g, "/"));
  return arq;
}

async function entrar(contexto) {
  const pag = await contexto.newPage();
  await pag.goto(BASE + "/entrar", { waitUntil: "domcontentloaded" });
  await pag.waitForTimeout(600);
  /* Os campos não têm id estável; o tipo é o seletor honesto aqui. */
  await pag.fill('input[type="email"]', CRED.email);
  await pag.fill('input[type="password"]', CRED.senha);
  await pag.click('button[type="submit"]');
  await pag.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 20000 });
  await esperarQuieto(pag);
  await pag.close();
}

const so = process.argv[2];

/*
 * O Chromium que o Playwright baixa não sobe nesta máquina — falta o runtime
 * do Visual C++, e o Windows responde "configuração lado a lado incorreta".
 * Instalar runtime pede administrador, então usamos o Chrome que já está
 * aqui. Mesmo motor, e ainda mais fiel: é o navegador em que o cliente
 * realmente abre o sistema.
 *
 * O perfil é temporário (padrão do Playwright); não toca o perfil do usuário.
 */
const navegador = await chromium.launch({ channel: "chrome" });

/* ── Sem sessão: login, cadastro, começar ── */
{
  const ctx = await navegador.newContext({ viewport: DESKTOP, deviceScaleFactor: 1, locale: "pt-BR" });
  const pag = await ctx.newPage();
  for (const t of MODULOS.entrada) {
    if (so && t.rota !== so) continue;
    try {
      await pag.goto(BASE + t.rota, { waitUntil: "domcontentloaded", timeout: 25000 });
      await esperarQuieto(pag);
      await capturar(pag, path.join(DESTINO, "entrada"), `${t.nome}--desktop`);
      await pag.setViewportSize(CELULAR);
      await esperarQuieto(pag);
      await capturar(pag, path.join(DESTINO, "entrada"), `${t.nome}--mobile`);
      await pag.setViewportSize(DESKTOP);
      console.log(`  ✓ ${t.rota}`);
    } catch (e) {
      falhas.push({ rota: t.rota, motivo: String(e).slice(0, 160) });
      console.log(`  ✗ ${t.rota}: ${String(e).slice(0, 90)}`);
    }
  }
  await ctx.close();
}

/* ── Com sessão ── */
const ctx = await navegador.newContext({ viewport: DESKTOP, deviceScaleFactor: 1, locale: "pt-BR" });
try {
  await entrar(ctx);
  console.log("✓ sessão aberta com o usuário de teste\n");
} catch (e) {
  console.log("✗ não consegui entrar: " + String(e).slice(0, 200));
  await navegador.close();
  process.exit(1);
}

const pag = await ctx.newPage();

for (const [modulo, telas] of Object.entries(MODULOS)) {
  if (modulo === "entrada") continue;
  for (const t of telas) {
    if (so && t.rota !== so) continue;
    const pasta = path.join(DESTINO, modulo);
    try {
      await pag.setViewportSize(DESKTOP);
      const r = await pag.goto(BASE + t.rota, { waitUntil: "domcontentloaded", timeout: 40000 });
      await esperarQuieto(pag);

      if (r && r.status() >= 400) {
        falhas.push({ rota: t.rota, motivo: `HTTP ${r.status()}` });
        console.log(`  ✗ ${t.rota}: HTTP ${r.status()}`);
        continue;
      }

      await capturar(pag, pasta, `${t.nome}--desktop`);
      await pag.setViewportSize(CELULAR);
      await esperarQuieto(pag);
      await capturar(pag, pasta, `${t.nome}--mobile`);
      console.log(`  ✓ ${t.rota}`);
    } catch (e) {
      falhas.push({ rota: t.rota, motivo: String(e).slice(0, 160) });
      console.log(`  ✗ ${t.rota}: ${String(e).slice(0, 90)}`);
    }
  }
}

await navegador.close();

fs.mkdirSync(DESTINO, { recursive: true });
fs.writeFileSync(
  path.join(DESTINO, "_capturas.json"),
  JSON.stringify({ geradoEm: new Date().toISOString(), base: BASE, desktop: DESKTOP, celular: CELULAR, feitas, falhas }, null, 1)
);

console.log(`\n${feitas.length} capturas · ${falhas.length} falha(s)`);
for (const f of falhas) console.log(`  ✗ ${f.rota}  ${f.motivo}`);
